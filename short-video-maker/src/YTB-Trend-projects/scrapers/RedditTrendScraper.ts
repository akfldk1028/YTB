/**
 * RedditTrendScraper (n8n 노드)
 * Reddit JSON API → 인기 포스트에서 트렌드 키워드 추출
 *
 * Input:  ScraperInput { category?, maxResults? }
 * Output: TrendKeyword[]
 *
 * API: https://www.reddit.com/r/{subreddit}.json (인증 불필요)
 * 비용: $0
 */

import { BaseTrendScraper } from './BaseTrendScraper';
import { TrendPlatform } from '../types';
import type { TrendKeyword, ScraperInput } from '../types';
import { logger } from '../../config';

// 카테고리별 서브레딧 매핑
const SUBREDDIT_MAP: Record<string, string[]> = {
  education: ['explainlikeimfive', 'todayilearned', 'educationalgifs'],
  science: ['science', 'askscience', 'space'],
  tech: ['technology', 'programming', 'artificial'],
  news: ['worldnews', 'news'],
  default: ['popular'],
};

interface RedditPost {
  data: {
    title: string;
    subreddit: string;
    ups: number;
    num_comments: number;
    permalink: string;
  };
}

export class RedditTrendScraper extends BaseTrendScraper {
  readonly platform = TrendPlatform.REDDIT;
  readonly displayName = 'Reddit Popular';

  async scrape(input: ScraperInput): Promise<TrendKeyword[]> {
    try {
      const maxResults = input.maxResults || 20;
      const subreddits = input.category
        ? (SUBREDDIT_MAP[input.category] || SUBREDDIT_MAP.default)
        : SUBREDDIT_MAP.default;

      const allPosts: RedditPost[] = [];

      // 여러 서브레딧 병렬 스크래핑
      const results = await Promise.allSettled(
        subreddits.map(sub => this.fetchSubreddit(sub))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          allPosts.push(...result.value);
        }
      }

      if (allPosts.length === 0) {
        logger.info('[RedditTrend] No posts found');
        return [];
      }

      // upvote 기준 정규화
      const maxUps = Math.max(...allPosts.map(p => p.data.ups));

      const keywords: TrendKeyword[] = [];
      const seen = new Set<string>();

      for (const post of allPosts) {
        const titleKeywords = this.extractKeywords(post.data.title);

        for (const kw of titleKeywords) {
          const normalized = kw.toLowerCase().trim();
          if (normalized.length < 3 || seen.has(normalized)) continue;
          // 불용어 필터
          if (STOP_WORDS.has(normalized)) continue;
          seen.add(normalized);

          keywords.push({
            keyword: kw,
            platform: this.platform,
            score: this.normalizeScore(post.data.ups, maxUps),
            category: this.categorizeSubreddit(post.data.subreddit),
            metadata: {
              posts: post.data.num_comments,
            },
          });
        }
      }

      keywords.sort((a, b) => b.score - a.score);
      const result = keywords.slice(0, maxResults);

      logger.info({ count: result.length, subreddits }, '[RedditTrend] Scrape complete');
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async fetchSubreddit(subreddit: string): Promise<RedditPost[]> {
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`;
    const res = await this.safeFetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) return [];

    const data = await res.json() as { data?: { children?: RedditPost[] } };
    return data?.data?.children || [];
  }

  private categorizeSubreddit(subreddit: string): string {
    const lower = subreddit.toLowerCase();
    for (const [category, subs] of Object.entries(SUBREDDIT_MAP)) {
      if (subs.includes(lower)) return category;
    }
    return 'other';
  }
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'was', 'are', 'have',
  'has', 'had', 'not', 'but', 'what', 'all', 'were', 'when', 'your', 'can',
  'there', 'use', 'each', 'which', 'she', 'how', 'their', 'will', 'other',
  'about', 'out', 'many', 'then', 'them', 'these', 'some', 'her', 'would',
  'make', 'like', 'him', 'into', 'time', 'very', 'just', 'know', 'take',
  'people', 'its', 'over', 'such', 'after', 'also', 'did', 'get', 'got',
  'been', 'being', 'does', 'than', 'now', 'could', 'may', 'who', 'more',
]);
