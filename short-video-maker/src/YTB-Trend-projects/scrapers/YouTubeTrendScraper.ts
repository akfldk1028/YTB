/**
 * YouTubeTrendScraper (n8n 노드)
 * YouTube Data API v3 → mostPopular 영상에서 트렌드 키워드 추출
 *
 * Input:  ScraperInput { region?, category?, maxResults? }
 * Output: TrendKeyword[]
 *
 * API: GET /youtube/v3/videos?chart=mostPopular
 * 비용: $0 (무료 할당량 10,000 units/day)
 */

import { BaseTrendScraper } from './BaseTrendScraper';
import { TrendPlatform } from '../types';
import type { TrendKeyword, ScraperInput } from '../types';
import { logger } from '../../config';

// YouTube Data API v3 categoryId 매핑 (교육/과학 위주)
const CATEGORY_MAP: Record<string, string> = {
  education: '27',
  science: '28',
  tech: '28',
  entertainment: '24',
  news: '25',
  howto: '26',
};

interface YouTubeVideoItem {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    categoryId: string;
    tags?: string[];
  };
  statistics?: {
    viewCount: string;
    likeCount?: string;
  };
}

export class YouTubeTrendScraper extends BaseTrendScraper {
  readonly platform = TrendPlatform.YOUTUBE;
  readonly displayName = 'YouTube Trending';

  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async scrape(input: ScraperInput): Promise<TrendKeyword[]> {
    try {
      const region = input.region || 'KR';
      const maxResults = Math.min(input.maxResults || 20, 50);
      const categoryId = input.category ? CATEGORY_MAP[input.category] : undefined;

      const params = new URLSearchParams({
        chart: 'mostPopular',
        regionCode: region,
        maxResults: maxResults.toString(),
        part: 'snippet,statistics',
        key: this.apiKey,
      });

      if (categoryId) {
        params.set('videoCategoryId', categoryId);
      }

      const url = `https://www.googleapis.com/youtube/v3/videos?${params}`;
      const res = await this.safeFetch(url);

      if (!res.ok) {
        throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
      }

      const data = await res.json() as { items?: YouTubeVideoItem[] };
      const items = data.items || [];

      if (items.length === 0) {
        logger.info({ region, categoryId }, '[YouTubeTrend] No trending videos found');
        return [];
      }

      // 조회수 최대값 (정규화용)
      const maxViews = Math.max(...items.map(i => parseInt(i.statistics?.viewCount || '0')));

      const keywords: TrendKeyword[] = [];
      const seen = new Set<string>();

      for (const item of items) {
        const views = parseInt(item.statistics?.viewCount || '0');

        // 제목에서 키워드 추출
        const titleKeywords = this.extractKeywords(item.snippet.title);
        // 태그도 포함
        const tags = item.snippet.tags || [];
        const allKeywords = [...titleKeywords, ...tags];

        for (const kw of allKeywords) {
          const normalized = kw.toLowerCase().trim();
          if (normalized.length < 2 || seen.has(normalized)) continue;
          seen.add(normalized);

          keywords.push({
            keyword: kw,
            platform: this.platform,
            score: this.normalizeScore(views, maxViews),
            category: this.categoryFromId(item.snippet.categoryId),
            metadata: { views },
          });
        }
      }

      // 점수순 정렬, maxResults 제한
      keywords.sort((a, b) => b.score - a.score);
      const result = keywords.slice(0, maxResults);

      logger.info({ count: result.length, region }, '[YouTubeTrend] Scrape complete');
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.apiKey) return false;
      // YouTube Data API v3는 key를 query param으로만 받음 (헤더 불가)
      const params = new URLSearchParams({
        chart: 'mostPopular', regionCode: 'KR', maxResults: '1', part: 'snippet', key: this.apiKey,
      });
      const res = await this.safeFetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, undefined, 5000);
      return res.ok;
    } catch {
      return false;
    }
  }

  private categoryFromId(categoryId: string): string {
    const map: Record<string, string> = {
      '24': 'entertainment', '25': 'news', '26': 'howto',
      '27': 'education', '28': 'science',
    };
    return map[categoryId] || 'other';
  }
}
