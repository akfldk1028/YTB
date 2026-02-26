/**
 * BaseTrendScraper — 추상 베이스 (n8n 노드 인터페이스)
 *
 * 모든 트렌드 스크래퍼가 반드시 구현하는 계약.
 * 새 플랫폼 추가 = 이 클래스 상속 + scrape() 구현 + registry 등록
 */

import { logger } from '../../config';
import type { TrendKeyword, TrendPlatform, ScraperInput } from '../types';

export abstract class BaseTrendScraper {
  abstract readonly platform: TrendPlatform;
  abstract readonly displayName: string;

  /**
   * 핵심 메서드 — 트렌드 키워드 수집
   * Input:  ScraperInput { region?, category?, maxResults? }
   * Output: TrendKeyword[]
   */
  abstract scrape(input: ScraperInput): Promise<TrendKeyword[]>;

  /** 헬스체크 (n8n 노드의 test connection) */
  async healthCheck(): Promise<boolean> {
    return true;
  }

  /** 점수 정규화: rawValue → 0-100 */
  protected normalizeScore(rawValue: number, maxValue: number): number {
    if (maxValue <= 0) return 0;
    return Math.min(100, Math.round((rawValue / maxValue) * 100));
  }

  /** 텍스트에서 의미 있는 키워드 추출 (간단 구현) */
  protected extractKeywords(text: string): string[] {
    // 입력 길이 제한 (ReDoS 방지)
    const safe = text.slice(0, 500);
    const cleaned = safe
      .replace(/[#@\[\](){}|\\\/~`!?.,;:'"<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.split(' ').filter(w => w.length >= 2);
  }

  /** 안전한 fetch with timeout */
  protected async safeFetch(url: string, options?: RequestInit, timeoutMs = 10_000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          ...(options?.headers || {}),
        },
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 스크래핑 실패 시 빈 배열 반환 (graceful degradation) */
  protected handleError(error: unknown): TrendKeyword[] {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn({ platform: this.platform, error: msg }, `[${this.displayName}] Scrape failed — returning empty`);
    return [];
  }
}
