/**
 * VideoDiscoveryService (n8n 노드)
 * 키워드 → YouTube Search API → 레퍼런스 영상 검색
 *
 * Input:  keyword (string), maxResults? (number)
 * Output: DiscoveredVideo[]
 *
 * API: YouTube Data API v3 — search.list
 * 비용: $0 (무료 할당량)
 */

import { logger } from '../../config';
import { TrendPlatform } from '../types';
import type { DiscoveredVideo } from '../types';

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: { high?: { url: string } };
  };
}

interface YouTubeVideoDetail {
  id: string;
  contentDetails: { duration: string };
  statistics: {
    viewCount: string;
    likeCount?: string;
  };
}

export class VideoDiscoveryService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 키워드로 YouTube Shorts 검색
   * @param keyword 검색 키워드
   * @param maxResults 최대 결과 수 (기본: 5)
   * @param minViews 최소 조회수 필터 (기본: 10000)
   */
  async search(keyword: string, maxResults = 5, minViews = 10_000): Promise<DiscoveredVideo[]> {
    try {
      // 7일 이내 업로드
      const publishedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Step 1: 검색
      const searchParams = new URLSearchParams({
        q: keyword,
        type: 'video',
        order: 'viewCount',
        videoDuration: 'short',       // Shorts 우선
        publishedAfter,
        maxResults: '20',              // 필터링 전 넉넉히
        part: 'snippet',
        key: this.apiKey,
      });

      const searchUrl = `https://www.googleapis.com/youtube/v3/search?${searchParams}`;
      const searchRes = await fetch(searchUrl);

      if (!searchRes.ok) {
        throw new Error(`YouTube Search API ${searchRes.status}: ${await searchRes.text()}`);
      }

      const searchData = await searchRes.json() as { items?: YouTubeSearchItem[] };
      const items = searchData?.items || [];

      if (items.length === 0) {
        logger.info({ keyword }, '[VideoDiscovery] No results');
        return [];
      }

      // Step 2: 비디오 상세 (조회수, 좋아요, 길이)
      const videoIds = items.map(i => i.id.videoId).join(',');
      const detailParams = new URLSearchParams({
        id: videoIds,
        part: 'contentDetails,statistics',
        key: this.apiKey,
      });

      const detailUrl = `https://www.googleapis.com/youtube/v3/videos?${detailParams}`;
      const detailRes = await fetch(detailUrl);

      if (!detailRes.ok) {
        throw new Error(`YouTube Videos API ${detailRes.status}`);
      }

      const detailData = await detailRes.json() as { items?: YouTubeVideoDetail[] };
      const details = new Map(
        (detailData?.items || []).map(d => [d.id, d])
      );

      // Step 3: 결합 + 필터링
      const videos: DiscoveredVideo[] = [];

      for (const item of items) {
        const detail = details.get(item.id.videoId);
        if (!detail) continue;

        const views = parseInt(detail.statistics.viewCount || '0');
        if (views < minViews) continue;

        const duration = this.parseDuration(detail.contentDetails.duration);
        if (duration === 0) continue;

        const likes = parseInt(detail.statistics.likeCount || '0');

        videos.push({
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          views,
          likes,
          publishedAt: item.snippet.publishedAt,
          duration,
          platform: TrendPlatform.YOUTUBE,
          engagementRate: views > 0 ? likes / views : 0,
          thumbnailUrl: item.snippet.thumbnails?.high?.url,
        });
      }

      // engagement rate 순 정렬
      videos.sort((a, b) => (b.engagementRate || 0) - (a.engagementRate || 0));
      const result = videos.slice(0, maxResults);

      logger.info(
        { keyword, found: videos.length, returned: result.length },
        '[VideoDiscovery] Search complete'
      );

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg, keyword }, '[VideoDiscovery] Search failed');
      return [];
    }
  }

  /** ISO 8601 duration 파싱 (PT1M30S → 90) */
  private parseDuration(isoDuration: string): number {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    return hours * 3600 + minutes * 60 + seconds;
  }
}
