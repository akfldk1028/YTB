/**
 * TikTokTrendScraper (n8n 노드)
 * TikTok Creative Center 트렌딩 해시태그 스크래핑
 *
 * Input:  ScraperInput { region?, maxResults? }
 * Output: TrendKeyword[]
 *
 * 방법: Creative Center 페이지 방문 → 쿠키 획득 → API 호출
 *       실패 시 Fallback: TikTok 검색 제안 API
 * 비용: $0
 */

import { BaseTrendScraper } from './BaseTrendScraper';
import { TrendPlatform } from '../types';
import type { TrendKeyword, ScraperInput } from '../types';
import { logger } from '../../config';

// TikTok Creative Center 내부 API
const TIKTOK_TRENDING_API = 'https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list';
const TIKTOK_CC_PAGE = 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en';

// 브라우저처럼 보이는 User-Agent
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface TikTokHashtagItem {
  hashtag_name: string;
  publish_cnt: number;
  video_views: number;
  trend: number; // 1=rising, 0=stable
}

export class TikTokTrendScraper extends BaseTrendScraper {
  readonly platform = TrendPlatform.TIKTOK;
  readonly displayName = 'TikTok Creative Center';

  async scrape(input: ScraperInput): Promise<TrendKeyword[]> {
    try {
      const maxResults = input.maxResults || 20;
      const region = input.region || 'KR';

      // 전략 1: 쿠키 기반 Creative Center API
      const ccResult = await this.scrapeWithSession(region, maxResults);
      if (ccResult.length > 0) return ccResult;

      // 전략 2: TikTok 검색 제안 API (인기 검색어)
      logger.info('[TikTokTrend] Trying search suggestions fallback');
      const suggestResult = await this.scrapeSearchSuggestions(maxResults);
      if (suggestResult.length > 0) return suggestResult;

      // 전략 3: TikTok Discover page
      logger.info('[TikTokTrend] Trying discover page fallback');
      return this.scrapeDiscoverPage(maxResults);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** 전략 1: Creative Center 페이지 방문 → 쿠키 → API 호출 */
  private async scrapeWithSession(region: string, maxResults: number): Promise<TrendKeyword[]> {
    try {
      // Step 1: Creative Center 페이지 방문하여 쿠키 획득
      const pageRes = await this.safeFetch(TIKTOK_CC_PAGE, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });

      // Set-Cookie 헤더에서 쿠키 추출
      const cookies = this.extractCookies(pageRes);

      if (!cookies) {
        logger.debug('[TikTokTrend] No cookies from CC page');
        return [];
      }

      // Step 2: 쿠키와 함께 API 호출
      const params = new URLSearchParams({
        period: '7',
        country_code: region,
        page: '1',
        limit: '50',
        sort_by: 'popular',
      });

      const apiUrl = `${TIKTOK_TRENDING_API}?${params}`;
      const apiRes = await this.safeFetch(apiUrl, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'application/json',
          'Referer': TIKTOK_CC_PAGE,
          'Cookie': cookies,
          'Origin': 'https://ads.tiktok.com',
        },
      });

      if (!apiRes.ok) {
        logger.debug({ status: apiRes.status }, '[TikTokTrend] CC API with cookies failed');
        return [];
      }

      const data = await apiRes.json() as { code?: number; data?: { list?: TikTokHashtagItem[] } };

      // code 0 = 성공, 40101 = no permission
      if (data.code !== 0 && data.code !== undefined) {
        logger.debug({ code: data.code }, '[TikTokTrend] CC API returned error code');
        return [];
      }

      const items = data?.data?.list || [];
      if (items.length === 0) return [];

      const maxViews = Math.max(1, ...items.map(i => i.video_views || 0));

      const keywords: TrendKeyword[] = items.slice(0, maxResults).map(item => ({
        keyword: item.hashtag_name.replace(/^#/, ''),
        platform: this.platform,
        score: this.normalizeScore(item.video_views || 0, maxViews),
        metadata: {
          views: item.video_views,
          posts: item.publish_cnt,
          growth: item.trend === 1 ? 'rising' : 'stable',
        },
      }));

      logger.info({ count: keywords.length }, '[TikTokTrend] CC API scrape complete');
      return keywords;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.debug({ error: msg }, '[TikTokTrend] CC session scrape failed');
      return [];
    }
  }

  /** 전략 2: TikTok 인기 검색어 제안 API */
  private async scrapeSearchSuggestions(maxResults: number): Promise<TrendKeyword[]> {
    try {
      // 인기 있는 키워드 시드로 검색 제안 수집
      const seedKeywords = ['trending', 'viral', 'fyp', 'challenge', 'funny'];
      const allKeywords: TrendKeyword[] = [];
      const seen = new Set<string>();

      for (const seed of seedKeywords) {
        try {
          const url = `https://www.tiktok.com/api/search/general/suggest/?keyword=${encodeURIComponent(seed)}`;
          const res = await this.safeFetch(url, {
            headers: {
              'User-Agent': BROWSER_UA,
              'Accept': 'application/json',
            },
          });

          if (!res.ok) continue;

          const data = await res.json() as {
            sug_list?: Array<{ content: string; extra_info?: { search_cnt?: number } }>;
          };

          const suggestions = data?.sug_list || [];
          for (const sug of suggestions) {
            const keyword = sug.content?.trim();
            if (!keyword) continue;

            const normalized = keyword.toLowerCase();
            if (seen.has(normalized)) continue;
            seen.add(normalized);

            allKeywords.push({
              keyword,
              platform: this.platform,
              score: sug.extra_info?.search_cnt
                ? Math.min(100, Math.round(sug.extra_info.search_cnt / 10000))
                : 50,
              metadata: {
                growth: 'rising',
              },
            });
          }
        } catch {
          // 개별 seed 실패 무시
        }
      }

      if (allKeywords.length > 0) {
        allKeywords.sort((a, b) => b.score - a.score);
        const result = allKeywords.slice(0, maxResults);
        logger.info({ count: result.length }, '[TikTokTrend] Search suggestions complete');
        return result;
      }

      return [];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.debug({ error: msg }, '[TikTokTrend] Search suggestions failed');
      return [];
    }
  }

  /** 전략 3: TikTok Discover/Topic page */
  private async scrapeDiscoverPage(maxResults: number): Promise<TrendKeyword[]> {
    try {
      const url = 'https://www.tiktok.com/api/discover/topiclist/?noUser=1&from_page=search';
      const res = await this.safeFetch(url, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        logger.warn({ status: res.status }, '[TikTokTrend] Discover page failed');
        return [];
      }

      const data = await res.json() as { data?: Array<{ name: string; view_count?: number }> };
      const items = data?.data || [];

      if (items.length === 0) {
        logger.warn('[TikTokTrend] All strategies failed — TikTok requires browser-level access');
        return [];
      }

      const maxViews = Math.max(1, ...items.map(i => i.view_count || 0));

      const result = items.slice(0, maxResults).map(item => ({
        keyword: item.name,
        platform: this.platform,
        score: this.normalizeScore(item.view_count || 0, maxViews),
        metadata: { views: item.view_count },
      }));

      logger.info({ count: result.length }, '[TikTokTrend] Discover page complete');
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: msg }, '[TikTokTrend] All fallbacks failed');
      return [];
    }
  }

  /** Response에서 Set-Cookie 헤더 추출 */
  private extractCookies(res: Response): string | null {
    try {
      const setCookies = res.headers.getSetCookie?.() || [];
      if (setCookies.length === 0) {
        // getSetCookie()가 없는 환경 fallback
        const raw = res.headers.get('set-cookie');
        if (!raw) return null;
        return raw.split(',')
          .map(c => c.split(';')[0].trim())
          .filter(c => c.includes('='))
          .join('; ');
      }
      return setCookies
        .map(c => c.split(';')[0].trim())
        .filter(c => c.includes('='))
        .join('; ');
    } catch {
      return null;
    }
  }
}
