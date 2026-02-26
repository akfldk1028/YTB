/**
 * GoogleTrendsScraper (n8n 노드)
 * Google Trends RSS 피드 → 트렌딩 검색어 추출
 *
 * Input:  ScraperInput { region?, maxResults? }
 * Output: TrendKeyword[]
 *
 * 방법: Google Trends RSS 피드 (무료, API 키 불필요)
 * URL:   https://trends.google.com/trending/rss?geo={region}
 * 비용: $0
 */

import { XMLParser } from 'fast-xml-parser';
import { BaseTrendScraper } from './BaseTrendScraper';
import { TrendPlatform } from '../types';
import type { TrendKeyword, ScraperInput } from '../types';
import { logger } from '../../config';

// Google Trends RSS 피드 (2024년 이후 새 URL)
const GOOGLE_TRENDS_RSS_URL = 'https://trends.google.com/trending/rss';

interface RssItem {
  title: string;
  'ht:approx_traffic'?: string;   // "200+" or "1000+"
  'ht:news_item'?: RssNewsItem | RssNewsItem[];
  pubDate?: string;
}

interface RssNewsItem {
  'ht:news_item_title'?: string;
  'ht:news_item_url'?: string;
}

export class GoogleTrendsScraper extends BaseTrendScraper {
  readonly platform = TrendPlatform.GOOGLE_TRENDS;
  readonly displayName = 'Google Trends (RSS)';

  private parser: XMLParser;

  constructor() {
    super();
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
  }

  async scrape(input: ScraperInput): Promise<TrendKeyword[]> {
    try {
      const maxResults = input.maxResults || 20;
      const geo = input.region || 'KR';

      const url = `${GOOGLE_TRENDS_RSS_URL}?geo=${encodeURIComponent(geo)}`;

      logger.info({ url, geo }, '[GoogleTrends] Fetching RSS feed');

      const res = await this.safeFetch(url, {
        headers: {
          'Accept': 'application/rss+xml, application/xml, text/xml',
          'User-Agent': 'Mozilla/5.0 (compatible; TrendBot/1.0)',
        },
      });

      if (!res.ok) {
        logger.warn({ status: res.status }, '[GoogleTrends] RSS feed request failed');
        return [];
      }

      const xmlText = await res.text();
      if (!xmlText || xmlText.length < 100) {
        logger.warn('[GoogleTrends] Empty RSS response');
        return [];
      }

      const parsed = this.parser.parse(xmlText);
      const channel = parsed?.rss?.channel;
      if (!channel) {
        logger.warn('[GoogleTrends] Invalid RSS structure');
        return [];
      }

      // RSS items 추출
      let items: RssItem[] = [];
      if (Array.isArray(channel.item)) {
        items = channel.item;
      } else if (channel.item) {
        items = [channel.item];
      }

      if (items.length === 0) {
        logger.info({ geo }, '[GoogleTrends] No trending items in RSS');
        return [];
      }

      // 트래픽 숫자 파싱하여 최대값 계산
      const traffics = items.map(item => this.parseTraffic(item['ht:approx_traffic']));
      const maxTraffic = Math.max(1, ...traffics);

      const keywords: TrendKeyword[] = [];
      const seen = new Set<string>();

      for (let i = 0; i < items.length && keywords.length < maxResults; i++) {
        const item = items[i];
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        if (!title) continue;

        const normalized = title.toLowerCase();
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        const traffic = traffics[i] || 0;

        // 관련 뉴스에서 키워드 추출
        const relatedKeywords: string[] = [];
        const newsItems = this.getNewsItems(item);
        for (const news of newsItems.slice(0, 3)) {
          const newsTitle = news['ht:news_item_title'];
          if (newsTitle && typeof newsTitle === 'string') {
            relatedKeywords.push(...this.extractKeywords(newsTitle));
          }
        }

        keywords.push({
          keyword: title,
          platform: this.platform,
          score: this.normalizeScore(traffic, maxTraffic),
          relatedKeywords: [...new Set(relatedKeywords)].slice(0, 5),
          metadata: {
            growth: 'rising',
            posts: traffic,
          },
        });
      }

      logger.info({ count: keywords.length, geo }, '[GoogleTrends] RSS scrape complete');
      return keywords;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.safeFetch(`${GOOGLE_TRENDS_RSS_URL}?geo=US`, {
        headers: { 'Accept': 'application/rss+xml' },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** "200+" → 200, "1,000+" → 1000, "10K+" → 10000 */
  private parseTraffic(raw?: string): number {
    if (!raw || typeof raw !== 'string') return 0;
    let cleaned = raw.replace(/[+,\s]/g, '');
    if (cleaned.endsWith('K')) {
      return parseInt(cleaned.replace('K', '')) * 1000 || 0;
    }
    if (cleaned.endsWith('M')) {
      return parseInt(cleaned.replace('M', '')) * 1000000 || 0;
    }
    return parseInt(cleaned) || 0;
  }

  /** RSS의 news_item이 단일 객체 또는 배열일 수 있음 */
  private getNewsItems(item: RssItem): RssNewsItem[] {
    const raw = item['ht:news_item'];
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return [raw];
  }
}
