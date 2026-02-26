/**
 * LongFormCompilerService (n8n 노드 패턴)
 *
 * Input: documentId + episode filter options
 * Output: compiled long-form video path + chapter metadata
 *
 * 단일 책임: completed 에피소드들 → 1개 롱폼 비디오
 * Phase 2: Shorts N개 합쳐서 8-15분 롱폼 컴필레이션 (RPM 50-200x)
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { logger } from '../../../config';
import { VideoConcat } from '../../../YTB-ffmpeg/VideoConcat';
import { getVideoDuration } from '../../../YTB-ffmpeg/utils';
import { Neo4jService, createNeo4jService } from './Neo4jService';
import type { Episode } from '../types';

// ============================================
// n8n Node Interface
// ============================================

export interface CompileInput {
  /** 문서 ID (Neo4j fileName) */
  documentId: string;
  /** 특정 에피소드만 선택 (미지정 시 completed 전부) */
  episodeIds?: string[];
  /** 롱폼 비디오 제목 (미지정 시 documentId + "시리즈 모음") */
  title?: string;
  /** 트랜지션 타입 (default: 'dissolve') */
  transitionType?: string;
  /** 트랜지션 길이 초 (default: 0.5) */
  transitionDuration?: number;
  /** 해상도 (default: '1080x1920' portrait) */
  orientation?: string;
  /** 챕터 메타데이터 포함 여부 (default: true) */
  includeChapters?: boolean;
}

export interface ChapterInfo {
  title: string;
  startTime: number;
  /** HH:MM:SS 포맷 */
  startTimeFormatted: string;
  episodeNumber: number;
}

export interface CompileOutput {
  success: boolean;
  videoPath?: string;
  duration?: number;
  episodeCount?: number;
  chapters?: ChapterInfo[];
  /** YouTube 챕터 설명문 (복붙용) */
  chaptersDescription?: string;
  title?: string;
  /** 에피소드들에서 수집한 키워드 (중복 제거) */
  aggregatedKeywords?: string[];
  /** 에피소드들에서 수집한 해시태그 (중복 제거) */
  aggregatedHashtags?: string[];
  error?: string;
}

// ============================================
// Service
// ============================================

export class LongFormCompilerService {
  private videoConcat = new VideoConcat();
  private neo4jService: Neo4jService | null = null;

  private async getNeo4jService(): Promise<Neo4jService> {
    if (!this.neo4jService) {
      this.neo4jService = createNeo4jService();
    }
    return this.neo4jService;
  }

  /**
   * 컴파일 가능한 에피소드 목록 조회
   * completed 상태 + videoPath 존재 + 파일 실제 존재
   */
  async getCompilableEpisodes(documentId: string): Promise<Episode[]> {
    const neo4j = await this.getNeo4jService();
    const episodes = await neo4j.getDocumentEpisodes(documentId);

    const compilable: Episode[] = [];
    for (const ep of episodes) {
      if (
        (ep.status === 'completed' || ep.status === 'uploaded') &&
        ep.videoPath &&
        await fs.pathExists(ep.videoPath)
      ) {
        compilable.push(ep);
      }
    }

    // episodeNumber 순 정렬
    compilable.sort((a, b) => a.episodeNumber - b.episodeNumber);
    return compilable;
  }

  /**
   * 롱폼 컴필레이션 생성 (n8n 노드 실행)
   */
  async compile(input: CompileInput): Promise<CompileOutput> {
    const {
      documentId,
      episodeIds,
      title,
      transitionType = 'dissolve',
      transitionDuration = 0.5,
      orientation: rawOrientation = '1080x1920',
      includeChapters = true,
    } = input;

    // orientation 매핑: portrait/landscape → 실제 해상도
    const orientationMap: Record<string, string> = {
      portrait: '1080x1920',
      landscape: '1920x1080',
    };
    const orientation = orientationMap[rawOrientation] || rawOrientation;

    logger.info({ documentId, episodeIds, transitionType, orientation }, '[LongFormCompiler] Starting compilation');

    try {
      // 1. 에피소드 조회
      let episodes = await this.getCompilableEpisodes(documentId);

      if (episodes.length === 0) {
        return { success: false, error: `No compilable episodes found for document: ${documentId}` };
      }

      // 2. 특정 에피소드만 필터
      if (episodeIds && episodeIds.length > 0) {
        const idSet = new Set(episodeIds);
        episodes = episodes.filter(ep => idSet.has(ep.id));
        if (episodes.length === 0) {
          return { success: false, error: 'None of the specified episodeIds have completed videos' };
        }
      }

      // 최소 2개 필요
      if (episodes.length < 2) {
        return { success: false, error: `Need at least 2 episodes for compilation, found ${episodes.length}` };
      }

      const videoPaths = episodes.map(ep => ep.videoPath!);
      logger.info({ episodeCount: episodes.length, videoPaths }, '[LongFormCompiler] Compiling episodes');

      // 3. 챕터 메타데이터 생성 (concat 전에 개별 duration 필요)
      let chapters: ChapterInfo[] | undefined;
      if (includeChapters) {
        chapters = await this.buildChapters(episodes, transitionDuration);
      }

      // 4. 출력 경로
      const outputDir = path.join(process.cwd(), 'downloads', 'books');
      await fs.ensureDir(outputDir);
      const timestamp = Date.now();
      const sanitizedDocId = documentId.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const outputPath = path.join(outputDir, `longform_${sanitizedDocId}_${timestamp}.mp4`);

      // 5. VideoConcat으로 합치기
      await this.videoConcat.concatVideosWithXfade(
        videoPaths,
        outputPath,
        transitionDuration,
        transitionType,
        orientation
      );

      // 6. 최종 duration 확인
      const finalDuration = await getVideoDuration(outputPath);
      const compilationTitle = title || `${documentId.replace('.pdf', '')} 시리즈 모음`;

      logger.info({
        outputPath,
        duration: finalDuration,
        episodeCount: episodes.length,
      }, '[LongFormCompiler] Compilation complete');

      // 7. 에피소드 키워드/해시태그 수집
      const keywordSet = new Set<string>();
      const hashtagSet = new Set<string>();
      for (const ep of episodes) {
        for (const kw of ep.keywords || []) keywordSet.add(kw);
        for (const ht of ep.hashtags || []) hashtagSet.add(ht);
      }

      return {
        success: true,
        videoPath: outputPath,
        duration: finalDuration,
        episodeCount: episodes.length,
        chapters,
        chaptersDescription: chapters ? this.formatChaptersForYouTube(chapters) : undefined,
        title: compilationTitle,
        aggregatedKeywords: Array.from(keywordSet),
        aggregatedHashtags: Array.from(hashtagSet),
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMsg, documentId }, '[LongFormCompiler] Compilation failed');
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 챕터 타임스탬프 계산
   * 각 에피소드의 시작 시간 = 이전 에피소드들의 duration 합 - 트랜지션 오버랩
   */
  private async buildChapters(
    episodes: Episode[],
    transitionDuration: number
  ): Promise<ChapterInfo[]> {
    const chapters: ChapterInfo[] = [];
    let cumulativeTime = 0;

    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      chapters.push({
        title: ep.title,
        startTime: Math.max(0, cumulativeTime),
        startTimeFormatted: this.formatTime(Math.max(0, cumulativeTime)),
        episodeNumber: ep.episodeNumber,
      });

      // 다음 챕터 시작 시간 계산
      const duration = await getVideoDuration(ep.videoPath!);
      // xfade는 transitionDuration만큼 겹침
      cumulativeTime += duration - (i < episodes.length - 1 ? transitionDuration : 0);
    }

    return chapters;
  }

  /**
   * 초 → HH:MM:SS 포맷
   */
  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /**
   * YouTube 챕터 설명문 생성 (복붙용)
   * YouTube는 0:00으로 시작하는 타임스탬프를 자동 챕터로 인식
   */
  private formatChaptersForYouTube(chapters: ChapterInfo[]): string {
    return chapters
      .map(ch => `${ch.startTimeFormatted} EP.${ch.episodeNumber} ${ch.title}`)
      .join('\n');
  }
}

// 싱글톤 factory
let _instance: LongFormCompilerService | null = null;
export function getLongFormCompilerService(): LongFormCompilerService {
  if (!_instance) {
    _instance = new LongFormCompilerService();
  }
  return _instance;
}
