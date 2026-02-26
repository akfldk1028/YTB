/**
 * YouTubePublishService (n8n 노드 패턴)
 *
 * Input: videoPath + episode metadata
 * Output: youtubeId + youtubeUrl
 *
 * 단일 책임: Books 프로젝트 비디오 → YouTube 업로드
 * v8.1: 수익화 파이프라인 연결
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { logger, Config } from '../../../config';
import { YouTubeUploader } from '../../../youtube-upload/services/YouTubeUploader';

// ============================================
// n8n Node Interface
// ============================================

export interface PublishInput {
  /** 로컬 비디오 파일 경로 */
  videoPath: string;
  /** 에피소드 메타데이터 */
  episode: {
    id: string;
    title: string;
    hook: string;
    cta: string;
    keywords: string[];
    hashtags: string[];
    episodeNumber: number;
    documentId: string;
    /** YouTube SEO 설명 (ContentPlanner가 생성) */
    description?: string;
    /** 에피소드 요약 (시리즈 설명용) */
    summary?: string;
  };
  /** 문서 제목 (시리즈명) */
  documentTitle?: string;
  /** 업로드 채널명 */
  channelName?: string;
  /** 공개 상태 */
  privacyStatus?: 'public' | 'private' | 'unlisted';
  /** 첫 댓글 (출처 고지 등) */
  firstComment?: string;
}

export interface PublishOutput {
  success: boolean;
  youtubeId?: string;
  youtubeUrl?: string;
  error?: string;
}

// ============================================
// Service
// ============================================

const DEFAULT_CHANNEL = 'clickaround';
const EDUCATION_CATEGORY_ID = '27';

export class YouTubePublishService {
  private uploader: YouTubeUploader | null = null;

  private getUploader(): YouTubeUploader {
    if (!this.uploader) {
      const config = new Config();
      this.uploader = new YouTubeUploader(config);
    }
    return this.uploader;
  }

  /**
   * YouTube에 비디오 업로드 (n8n 노드 실행)
   */
  async publish(input: PublishInput): Promise<PublishOutput> {
    const { videoPath, episode, channelName, privacyStatus, firstComment } = input;

    // 1. 비디오 파일 존재 확인
    if (!videoPath || !fs.existsSync(videoPath)) {
      return { success: false, error: `Video file not found: ${videoPath}` };
    }

    try {
      const uploader = this.getUploader();

      // 2. YouTubeUploader가 기대하는 경로로 비디오 복사
      //    YouTubeUploader는 videosDirPath/{videoId}.mp4 를 찾음
      const videoId = `books_${episode.documentId}_ep${episode.episodeNumber}_${Date.now()}`;
      const config = new Config();
      const targetDir = config.videosDirPath || path.join(process.cwd(), 'downloads');
      const targetPath = path.join(targetDir, `${videoId}.mp4`);

      await fs.ensureDir(targetDir);
      await fs.copy(videoPath, targetPath);

      logger.info({ videoId, videoPath, targetPath }, '[YouTubePublish] Video copied for upload');

      // 3. YouTube 메타데이터 구성
      const description = this.buildDescription(input);
      const tags = this.buildTags(episode);
      const title = this.buildTitle(episode);

      const channel = channelName || DEFAULT_CHANNEL;

      // 4. 업로드 실행
      const youtubeVideoId = await uploader.uploadVideo(
        videoId,
        channel,
        {
          title,
          description,
          tags,
          categoryId: EDUCATION_CATEGORY_ID,
          privacyStatus: privacyStatus || 'private',
          defaultLanguage: 'ko',
        },
        false // notifySubscribers (private이면 의미 없음)
      );

      const youtubeUrl = `https://www.youtube.com/shorts/${youtubeVideoId}`;

      logger.info({ youtubeVideoId, youtubeUrl, channel }, '[YouTubePublish] Upload successful');

      // 5. 첫 댓글 (AI 콘텐츠 고지 등)
      if (firstComment) {
        try {
          await uploader.postComment(youtubeVideoId, channel, firstComment);
          logger.info({ youtubeVideoId }, '[YouTubePublish] First comment posted');
        } catch (commentError) {
          logger.warn({ error: commentError }, '[YouTubePublish] First comment failed (non-critical)');
        }
      }

      // 6. 임시 복사 파일 정리
      try {
        await fs.remove(targetPath);
      } catch (_) { /* ignore cleanup errors */ }

      return {
        success: true,
        youtubeId: youtubeVideoId,
        youtubeUrl,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMsg, episodeId: episode.id }, '[YouTubePublish] Upload failed');
      return { success: false, error: errorMsg };
    }
  }

  /**
   * YouTube SEO 최적화 설명문 빌드
   */
  private buildDescription(input: PublishInput): string {
    const { episode, documentTitle } = input;
    const seriesName = documentTitle || episode.documentId;

    // 에피소드가 자체 description을 가지고 있으면 우선 사용
    if (episode.description) {
      return `${episode.description}

${this.buildHashtagLine(episode.hashtags)}

---
${seriesName} 시리즈 EP.${episode.episodeNumber}
#Shorts #교육 #수학`;
    }

    // fallback: hook + summary + hashtags로 구성
    const lines: string[] = [];
    lines.push(episode.hook);
    lines.push('');
    if (episode.summary) {
      lines.push(episode.summary);
      lines.push('');
    }
    lines.push(`📚 ${seriesName} 시리즈 EP.${episode.episodeNumber}`);
    lines.push('');
    lines.push(this.buildHashtagLine(episode.hashtags));
    lines.push('');
    lines.push('#Shorts #교육 #수학 #과학');

    return lines.join('\n');
  }

  /**
   * YouTube 태그 빌드 (keywords + hashtags 병합)
   */
  private buildTags(episode: PublishInput['episode']): string[] {
    const tags = new Set<string>();

    // 기본 교육 태그
    tags.add('교육');
    tags.add('Shorts');
    tags.add('수학');
    tags.add('과학');

    // 에피소드 키워드
    for (const kw of episode.keywords || []) {
      tags.add(kw);
    }

    // hashtags에서 # 제거하고 추가
    for (const ht of episode.hashtags || []) {
      tags.add(ht.replace(/^#/, ''));
    }

    return Array.from(tags).slice(0, 30); // YouTube 태그 최대 30개
  }

  /**
   * YouTube 제목 빌드 (Shorts 최적화: 짧고 강렬)
   */
  private buildTitle(episode: PublishInput['episode']): string {
    // title이 이미 바이럴 최적화됨 (v8.0 ContentPlanner)
    let title = episode.title;

    // 60자 초과 시 자르기 (YouTube Shorts 제목 최대 100자이지만 짧은 게 유리)
    if (title.length > 60) {
      title = title.substring(0, 57) + '...';
    }

    return title;
  }

  /**
   * 해시태그 라인 빌드
   */
  private buildHashtagLine(hashtags: string[]): string {
    if (!hashtags || hashtags.length === 0) return '';
    return hashtags
      .slice(0, 5)
      .map(h => h.startsWith('#') ? h : `#${h}`)
      .join(' ');
  }
}

// 싱글톤 factory
let _instance: YouTubePublishService | null = null;
export function getYouTubePublishService(): YouTubePublishService {
  if (!_instance) {
    _instance = new YouTubePublishService();
  }
  return _instance;
}
