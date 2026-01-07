/**
 * Video Searcher
 *
 * yt-dlp의 ytsearch 기능을 사용하여 대체 영상을 검색합니다.
 * 원본 URL이 실패했을 때 같은 제목의 다른 영상을 찾습니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../../logger';

const execAsync = promisify(exec);

// Residential Proxy 설정
const RESIDENTIAL_PROXY_URL = (process.env.RESIDENTIAL_PROXY_URL || '').trim();
const USE_PROXY = !!RESIDENTIAL_PROXY_URL;

export class VideoSearcher {
  /**
   * Proxy 설정 args 생성
   */
  private getProxyArgs(): string {
    if (!USE_PROXY) {
      return '';
    }
    return `--proxy "${RESIDENTIAL_PROXY_URL}"`;
  }

  /**
   * YouTube URL에서 video ID 추출
   */
  extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * ytsearch로 대체 영상 검색
   *
   * 원본 URL이 실패했을 때 같은 제목의 다른 영상을 찾습니다.
   * (리믹스, 라이브 버전, 리업로드 등)
   *
   * @param title 검색할 영상 제목
   * @param originalUrl 원본 URL (중복 방지용)
   * @param maxResults 최대 검색 결과 수 (기본: 3)
   */
  async searchAlternative(
    title: string,
    originalUrl: string,
    maxResults: number = 3
  ): Promise<string | null> {
    const originalVideoId = this.extractVideoId(originalUrl);
    const proxyArgs = this.getProxyArgs();

    // 제목에서 특수문자 제거 후 검색
    const searchQuery = title.replace(/[^\w\s가-힣]/g, ' ').trim();

    if (!searchQuery) {
      logger.warn({ title }, '검색 쿼리가 비어있음');
      return null;
    }

    // ytsearch: 최대 결과 검색
    const cmd = `yt-dlp ${proxyArgs} --flat-playlist --print "%(id)s|||%(title)s" "ytsearch${maxResults}:${searchQuery}"`;

    logger.debug({ cmd, searchQuery }, 'ytsearch 검색 명령');

    try {
      const { stdout } = await execAsync(cmd, { timeout: 30000 });
      const lines = stdout.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const [videoId, videoTitle] = line.split('|||');

        // 원본과 같은 영상은 스킵
        if (videoId === originalVideoId) {
          continue;
        }

        // 대체 영상 발견
        const alternativeUrl = `https://www.youtube.com/watch?v=${videoId}`;
        logger.info({
          originalTitle: title,
          alternativeTitle: videoTitle,
          alternativeUrl
        }, '대체 영상 발견');

        return alternativeUrl;
      }

      logger.warn({ searchQuery }, '대체 영상을 찾지 못함');
      return null;
    } catch (error) {
      logger.warn({ error, searchQuery }, 'ytsearch 검색 실패');
      return null;
    }
  }

  /**
   * 키워드로 영상 검색
   *
   * @param keyword 검색 키워드
   * @param maxResults 최대 검색 결과 수
   */
  async searchByKeyword(
    keyword: string,
    maxResults: number = 5
  ): Promise<Array<{ id: string; title: string; url: string }>> {
    const proxyArgs = this.getProxyArgs();
    const cmd = `yt-dlp ${proxyArgs} --flat-playlist --print "%(id)s|||%(title)s" "ytsearch${maxResults}:${keyword}"`;

    logger.debug({ cmd, keyword }, 'ytsearch 키워드 검색');

    try {
      const { stdout } = await execAsync(cmd, { timeout: 30000 });
      const lines = stdout.trim().split('\n').filter(Boolean);

      return lines.map(line => {
        const [id, title] = line.split('|||');
        return {
          id,
          title,
          url: `https://www.youtube.com/watch?v=${id}`
        };
      });
    } catch (error) {
      logger.warn({ error, keyword }, '키워드 검색 실패');
      return [];
    }
  }
}
