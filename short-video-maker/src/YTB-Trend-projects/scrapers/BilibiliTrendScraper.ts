/**
 * BilibiliTrendScraper (n8n 노드)
 * Bilibili 热门 (Hot) API → 인기 비디오에서 트렌드 키워드 추출
 *
 * Input:  ScraperInput { category?, maxResults? }
 * Output: TrendKeyword[]
 *
 * API: https://api.bilibili.com/x/web-interface/ranking/v2
 * 참고: https://github.com/SocialSisterYi/bilibili-API-collect
 * 비용: $0 (번역 시 Gemini Flash ~$0.001)
 *
 * 특이사항: Bilibili는 중국 전용 → region 무시, 항상 중국 데이터
 *          중국어 제목 → 한국어 번역 (Gemini Flash)
 */

import { BaseTrendScraper } from './BaseTrendScraper';
import { TrendPlatform } from '../types';
import type { TrendKeyword, ScraperInput } from '../types';
import { logger } from '../../config';

// Bilibili 분야 ID (rid)
const CATEGORY_MAP: Record<string, number> = {
  all: 0,
  education: 36,    // 知识
  tech: 188,         // 科技
  science: 36,       // 知识
  entertainment: 5,  // 娱乐
  music: 3,          // 音乐
};

interface BilibiliVideoItem {
  title: string;
  owner: { name: string };
  stat: {
    view: number;
    like: number;
    reply: number;
  };
  short_link_v2: string;
  bvid: string;
}

export class BilibiliTrendScraper extends BaseTrendScraper {
  readonly platform = TrendPlatform.BILIBILI;
  readonly displayName = 'Bilibili 热门';

  async scrape(input: ScraperInput): Promise<TrendKeyword[]> {
    try {
      const maxResults = input.maxResults || 20;
      const rid = input.category ? (CATEGORY_MAP[input.category] ?? 0) : 0;

      // Bilibili는 리전 없음 — 항상 중국 데이터
      const url = `https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`;
      const res = await this.safeFetch(url, {
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://www.bilibili.com/ranking',
        },
      });

      if (!res.ok) {
        throw new Error(`Bilibili API ${res.status}`);
      }

      const data = await res.json() as { data?: { list?: BilibiliVideoItem[] } };
      const items = data?.data?.list || [];

      if (items.length === 0) {
        logger.info('[BilibiliTrend] No trending videos found');
        return [];
      }

      const maxViews = Math.max(1, ...items.map(i => i.stat.view));

      // 중국어 제목 전체를 키워드로 사용 (공백 split 불가)
      const keywords: TrendKeyword[] = [];
      const seen = new Set<string>();

      for (const item of items) {
        // 제목 정리: 특수문자 제거, 앞뒤 공백
        const title = item.title
          .replace(/[【】《》「」『』\[\]()（）]/g, '')
          .trim();

        if (!title || title.length < 2) continue;

        const normalized = title.toLowerCase();
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        keywords.push({
          keyword: title,
          platform: this.platform,
          score: this.normalizeScore(item.stat.view, maxViews),
          category: this.ridToCategory(rid),
          metadata: {
            views: item.stat.view,
          },
        });

        if (keywords.length >= maxResults) break;
      }

      logger.info({ count: keywords.length, rid }, '[BilibiliTrend] Scrape complete (Chinese titles)');
      return keywords;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private ridToCategory(rid: number): string {
    for (const [cat, id] of Object.entries(CATEGORY_MAP)) {
      if (id === rid && cat !== 'all') return cat;
    }
    return 'other';
  }
}
