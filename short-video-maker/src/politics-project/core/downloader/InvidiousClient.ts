/**
 * Invidious API Client
 *
 * YouTube의 대체 프론트엔드인 Invidious API를 통해 영상을 다운로드합니다.
 * yt-dlp 실패 시 최후의 폴백으로 사용됩니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../../logger';
import { DownloadOptions } from './types';

const execAsync = promisify(exec);

// Invidious 인스턴스 목록
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.protokolla.fi',
  'https://iv.melmac.space'
];

// Invidious API 응답 타입
interface InvidiousVideoInfo {
  title: string;
  duration: number;
  adaptiveFormats: Array<{
    url: string;
    qualityLabel?: string;
    type: string;
    container: string;
    resolution?: string;
    itag: number;
  }>;
  captions: Array<{
    label: string;
    languageCode: string;
    url: string;
  }>;
}

export class InvidiousClient {
  /**
   * YouTube URL에서 video ID 추출
   */
  extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/  // video ID만 전달된 경우
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Invidious API로 영상 정보 조회
   */
  async getVideoInfo(videoId: string): Promise<InvidiousVideoInfo | null> {
    for (const instance of INVIDIOUS_INSTANCES) {
      try {
        const apiUrl = `${instance}/api/v1/videos/${videoId}?local=true`;
        logger.info({ instance, videoId }, 'Invidious API 조회 시도');

        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: AbortSignal.timeout(15000) // 15초 타임아웃
        });

        if (!response.ok) {
          logger.warn({ instance, status: response.status }, 'Invidious 응답 실패');
          continue;
        }

        const data = await response.json();
        logger.info({
          title: data.title,
          formatsCount: data.adaptiveFormats?.length
        }, 'Invidious 영상 정보 조회 성공');

        return {
          title: data.title,
          duration: data.lengthSeconds,
          adaptiveFormats: data.adaptiveFormats || [],
          captions: data.captions || []
        };
      } catch (error) {
        logger.warn({ instance, error: (error as Error).message }, 'Invidious 인스턴스 오류');
        continue;
      }
    }
    return null;
  }

  /**
   * Invidious에서 최적의 비디오 포맷 선택
   */
  selectBestFormat(
    formats: InvidiousVideoInfo['adaptiveFormats'],
    maxHeight: number
  ): { videoUrl: string; audioUrl: string } | null {
    // 비디오 포맷 필터링 (mp4 또는 webm, 최대 해상도 제한)
    const videoFormats = formats
      .filter(f => f.type.startsWith('video/') && !f.type.includes('audio'))
      .filter(f => {
        const height = parseInt(f.resolution?.replace('p', '') || '0', 10);
        return height > 0 && height <= maxHeight;
      })
      .sort((a, b) => {
        const heightA = parseInt(a.resolution?.replace('p', '') || '0', 10);
        const heightB = parseInt(b.resolution?.replace('p', '') || '0', 10);
        return heightB - heightA; // 높은 해상도 우선
      });

    // 오디오 포맷 선택 (m4a 우선)
    const audioFormats = formats
      .filter(f => f.type.startsWith('audio/'))
      .sort((a, b) => {
        // m4a(MP4) 우선
        if (a.container === 'mp4' && b.container !== 'mp4') return -1;
        if (a.container !== 'mp4' && b.container === 'mp4') return 1;
        return 0;
      });

    if (videoFormats.length === 0 || audioFormats.length === 0) {
      logger.warn({
        videoCount: videoFormats.length,
        audioCount: audioFormats.length
      }, 'Invidious 포맷 부족');
      return null;
    }

    return {
      videoUrl: videoFormats[0].url,
      audioUrl: audioFormats[0].url
    };
  }

  /**
   * Invidious를 통한 비디오 다운로드
   */
  async downloadVideo(
    url: string,
    opts: DownloadOptions
  ): Promise<{ videoPath: string; title: string; duration: number }> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('유효하지 않은 YouTube URL');
    }

    logger.info({ videoId }, 'Invidious 폴백 다운로드 시작');

    // 1. Invidious API로 정보 조회
    const info = await this.getVideoInfo(videoId);
    if (!info) {
      throw new Error('모든 Invidious 인스턴스 실패');
    }

    // 2. 최적 포맷 선택
    const formats = this.selectBestFormat(info.adaptiveFormats, opts.maxQuality || 1080);
    if (!formats) {
      throw new Error('다운로드 가능한 포맷 없음');
    }

    const safeTitle = this.sanitizeFilename(info.title);
    const videoTempPath = path.join(opts.outputDir, `${safeTitle}_video.mp4`);
    const audioTempPath = path.join(opts.outputDir, `${safeTitle}_audio.m4a`);
    const outputPath = path.join(opts.outputDir, `${safeTitle}.mp4`);

    // 3. 비디오/오디오 따로 다운로드
    logger.info({ videoUrl: formats.videoUrl.substring(0, 100) }, '비디오 스트림 다운로드');
    await this.downloadStream(formats.videoUrl, videoTempPath);

    logger.info({ audioUrl: formats.audioUrl.substring(0, 100) }, '오디오 스트림 다운로드');
    await this.downloadStream(formats.audioUrl, audioTempPath);

    // 4. FFmpeg로 병합
    logger.info('비디오/오디오 병합 중');
    const mergeCmd = [
      'ffmpeg -y',
      `-i "${videoTempPath}"`,
      `-i "${audioTempPath}"`,
      '-c:v copy -c:a aac',
      '-strict experimental',
      `"${outputPath}"`
    ].join(' ');

    await execAsync(mergeCmd);

    // 5. 임시 파일 삭제
    await fs.remove(videoTempPath);
    await fs.remove(audioTempPath);

    logger.info({ outputPath, title: info.title }, 'Invidious 다운로드 완료');

    return {
      videoPath: outputPath,
      title: safeTitle,
      duration: info.duration
    };
  }

  /**
   * URL에서 파일 다운로드 (curl 사용)
   */
  private async downloadStream(url: string, outputPath: string): Promise<void> {
    const cmd = [
      'curl -L',
      '-H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"',
      `--output "${outputPath}"`,
      `"${url}"`
    ].join(' ');

    try {
      await execAsync(cmd, {
        maxBuffer: 500 * 1024 * 1024, // 500MB
        timeout: 600000 // 10분
      });
    } catch (error) {
      throw new Error(`스트림 다운로드 실패: ${(error as Error).message}`);
    }
  }

  /**
   * Invidious를 통한 자막 다운로드
   */
  async downloadSubtitle(
    url: string,
    opts: DownloadOptions
  ): Promise<string | null> {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;

    const info = await this.getVideoInfo(videoId);
    if (!info || !info.captions.length) {
      logger.warn('Invidious: 자막 없음');
      return null;
    }

    const langs = opts.subtitleLang || ['ko', 'en'];

    // 원하는 언어 자막 찾기
    for (const lang of langs) {
      const caption = info.captions.find(c =>
        c.languageCode.startsWith(lang) || c.label.toLowerCase().includes(lang)
      );

      if (caption) {
        try {
          const safeTitle = this.sanitizeFilename(info.title);
          const srtPath = path.join(opts.outputDir, `${safeTitle}.${lang}.srt`);

          // Invidious 자막 URL에서 다운로드
          const response = await fetch(caption.url);
          if (response.ok) {
            const vttContent = await response.text();
            // VTT를 SRT로 변환
            const srtContent = this.vttToSrt(vttContent);
            await fs.writeFile(srtPath, srtContent, 'utf-8');
            logger.info({ srtPath, lang }, 'Invidious 자막 다운로드 성공');
            return srtPath;
          }
        } catch (error) {
          logger.warn({ error, lang }, 'Invidious 자막 다운로드 실패');
        }
      }
    }

    return null;
  }

  /**
   * VTT 자막을 SRT로 변환
   */
  private vttToSrt(vttContent: string): string {
    let srtContent = vttContent
      .replace(/^WEBVTT\s*\n/m, '')
      .replace(/^Kind:.*\n/gm, '')
      .replace(/^Language:.*\n/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // 타임스탬프 형식 변환 (00:00:00.000 -> 00:00:00,000)
    srtContent = srtContent.replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2');

    // 인덱스 추가
    const blocks = srtContent.split('\n\n').filter(b => b.trim());
    const srtBlocks = blocks.map((block, i) => {
      if (!block.match(/^\d{2}:\d{2}:\d{2},\d{3}/)) {
        return `${i + 1}\n${block}`;
      }
      return `${i + 1}\n${block}`;
    });

    return srtBlocks.join('\n\n');
  }

  /**
   * 파일명에 사용할 수 없는 문자 제거
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '').substring(0, 100);
  }
}
