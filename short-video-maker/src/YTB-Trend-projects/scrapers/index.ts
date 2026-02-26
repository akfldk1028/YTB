/**
 * Scraper Registry — 플러그 앤 플레이 (n8n 노드 레지스트리 패턴)
 *
 * 새 플랫폼 추가 = 스크래퍼 파일 1개 + 이 Map에 1줄 추가
 * 기존 코드 변경 0줄
 */

import { TrendPlatform } from '../types';
import { BaseTrendScraper } from './BaseTrendScraper';
import { YouTubeTrendScraper } from './YouTubeTrendScraper';
import { TikTokTrendScraper } from './TikTokTrendScraper';
import { RedditTrendScraper } from './RedditTrendScraper';
import { BilibiliTrendScraper } from './BilibiliTrendScraper';
import { GoogleTrendsScraper } from './GoogleTrendsScraper';

export { BaseTrendScraper } from './BaseTrendScraper';
export { YouTubeTrendScraper } from './YouTubeTrendScraper';
export { TikTokTrendScraper } from './TikTokTrendScraper';
export { RedditTrendScraper } from './RedditTrendScraper';
export { BilibiliTrendScraper } from './BilibiliTrendScraper';
export { GoogleTrendsScraper } from './GoogleTrendsScraper';

/**
 * 스크래퍼 팩토리 레지스트리
 * YouTube만 API 키 필요, 나머지는 무료 공개 API
 */
export function getScrapers(
  platforms?: TrendPlatform[],
  youtubeApiKey?: string,
): BaseTrendScraper[] {
  const registry = new Map<TrendPlatform, () => BaseTrendScraper>();
  registry.set(TrendPlatform.YOUTUBE, () => new YouTubeTrendScraper(youtubeApiKey || ''));
  registry.set(TrendPlatform.TIKTOK, () => new TikTokTrendScraper());
  registry.set(TrendPlatform.REDDIT, () => new RedditTrendScraper());
  registry.set(TrendPlatform.BILIBILI, () => new BilibiliTrendScraper());
  registry.set(TrendPlatform.GOOGLE_TRENDS, () => new GoogleTrendsScraper());

  const selectedPlatforms = platforms || Array.from(registry.keys());

  return selectedPlatforms
    .filter(p => registry.has(p))
    .map(p => registry.get(p)!());
}
