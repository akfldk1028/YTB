/**
 * TrendAggregatorService (n8n 노드)
 * 크로스 플랫폼 트렌드 키워드 집계
 *
 * Input:  TrendDiscoveryRequest { platforms?, region?, category?, maxResults? }
 * Output: TrendDiscoveryResult { trends: AggregatedTrend[], platformResults }
 *
 * 흐름:
 *   1. getScrapers() → 선택된 스크래퍼 인스턴스
 *   2. 모든 스크래퍼 병렬 호출 (Promise.allSettled → graceful degradation)
 *   3. 키워드 정규화 + 점수 가중합산
 *   4. (Optional) Gemini Flash로 유사 키워드 클러스터링
 *   5. AggregatedTrend[] 반환
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../config';
import { getScrapers } from '../scrapers';
import { KEYWORD_CLUSTERING_PROMPT } from '../utils/PromptTemplates';
import { TrendPlatform } from '../types';
import type {
  TrendDiscoveryRequest,
  TrendDiscoveryResult,
  TrendKeyword,
  AggregatedTrend,
} from '../types';

// 플랫폼별 가중치
const PLATFORM_WEIGHT: Record<string, number> = {
  youtube: 1.5,
  tiktok: 1.3,
  google_trends: 1.2,
  reddit: 1.0,
  bilibili: 0.8,
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

export class TrendAggregatorService {
  private ai: GoogleGenAI;
  private apiKey: string;
  private cacheDir: string;

  constructor(apiKey: string, cacheDir: string) {
    this.apiKey = apiKey;
    this.ai = new GoogleGenAI({ apiKey });
    this.cacheDir = cacheDir;
    fs.ensureDirSync(this.cacheDir);
  }

  async discover(request: TrendDiscoveryRequest): Promise<TrendDiscoveryResult> {
    const maxResults = request.maxResults || 20;

    // 캐시 확인
    const cached = await this.checkCache(request);
    if (cached) {
      logger.info('[TrendAggregator] Returning cached result');
      return cached;
    }

    const scrapers = getScrapers(request.platforms, this.getYouTubeApiKey());

    logger.info(
      { scraperCount: scrapers.length, platforms: scrapers.map(s => s.platform) },
      '[TrendAggregator] Starting parallel scrape'
    );

    // 모든 스크래퍼 병렬 호출 (Bilibili는 항상 CN 리전)
    const results = await Promise.allSettled(
      scrapers.map(s =>
        s.scrape({
          region: s.platform === TrendPlatform.BILIBILI ? 'CN' : (request.region || 'KR'),
          category: request.category,
          maxResults: 50,
        })
      )
    );

    // 결과 수집
    const platformResults: Partial<Record<TrendPlatform, TrendKeyword[]>> = {};
    const allKeywords: TrendKeyword[] = [];

    for (let i = 0; i < scrapers.length; i++) {
      const result = results[i];
      const platform = scrapers[i].platform;

      if (result.status === 'fulfilled') {
        let keywords = result.value;

        // Bilibili 중국어 키워드 → 한국어 번역
        if (platform === TrendPlatform.BILIBILI && keywords.length > 0) {
          keywords = await this.translateBilibiliKeywords(keywords);
        }

        platformResults[platform] = keywords;
        allKeywords.push(...keywords);
        logger.info({ platform, count: keywords.length }, '[TrendAggregator] Platform result');
      } else {
        logger.warn({ platform, error: result.reason }, '[TrendAggregator] Platform failed (skipped)');
        platformResults[platform] = [];
      }
    }

    if (allKeywords.length === 0) {
      return {
        success: false,
        trends: [],
        platformResults,
        discoveredAt: new Date().toISOString(),
        error: 'All scrapers returned empty results',
      };
    }

    // 키워드 집계
    const aggregated = this.aggregateKeywords(allKeywords);

    // AI 클러스터링 (키워드 20개 이상일 때만)
    let trends: AggregatedTrend[];
    if (aggregated.length > 20) {
      trends = await this.clusterWithAI(aggregated);
    } else {
      trends = aggregated;
    }

    // 점수 순 정렬 + maxResults 제한
    trends.sort((a, b) => b.totalScore - a.totalScore);
    trends = trends.slice(0, maxResults);

    const result: TrendDiscoveryResult = {
      success: true,
      trends,
      platformResults,
      discoveredAt: new Date().toISOString(),
    };

    // 캐시 저장
    await this.saveCache(request, result);

    logger.info(
      { trendCount: trends.length, topKeyword: trends[0]?.keyword },
      '[TrendAggregator] Discovery complete'
    );

    return result;
  }

  /** 키워드 정규화 + 가중합산 */
  private aggregateKeywords(keywords: TrendKeyword[]): AggregatedTrend[] {
    const map = new Map<string, AggregatedTrend>();

    for (const kw of keywords) {
      const normalized = kw.keyword.toLowerCase().trim();
      const weight = PLATFORM_WEIGHT[kw.platform] || 1.0;

      const existing = map.get(normalized);
      if (existing) {
        existing.totalScore += kw.score * weight;
        existing.platformCount += 1;
        existing.sources.push(kw);
      } else {
        map.set(normalized, {
          keyword: kw.keyword,
          normalizedKeyword: normalized,
          totalScore: kw.score * weight,
          platformCount: 1,
          sources: [kw],
          estimatedNiche: kw.category || 'other',
        });
      }
    }

    return Array.from(map.values());
  }

  /** AI로 유사 키워드 클러스터링 */
  private async clusterWithAI(trends: AggregatedTrend[]): Promise<AggregatedTrend[]> {
    try {
      const uniqueKeywords = trends.map(t => t.keyword);
      const prompt = KEYWORD_CLUSTERING_PROMPT(uniqueKeywords);

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const rawText = response.text || '';
      const parsed = this.parseJSON(rawText);
      if (!parsed || !Array.isArray(parsed)) return trends;

      const clusters = parsed as Array<{
        representative: string;
        variants: string[];
        niche: string;
      }>;

      // 클러스터 기반 병합
      const merged: AggregatedTrend[] = [];

      for (const cluster of clusters) {
        const variantSet = new Set(cluster.variants.map(v => v.toLowerCase()));
        const matchedTrends = trends.filter(t => variantSet.has(t.normalizedKeyword));

        if (matchedTrends.length === 0) continue;

        const totalScore = matchedTrends.reduce((sum, t) => sum + t.totalScore, 0);
        const allSources = matchedTrends.flatMap(t => t.sources);
        const platformSet = new Set(allSources.map(s => s.platform));

        merged.push({
          keyword: cluster.representative,
          normalizedKeyword: cluster.representative.toLowerCase(),
          totalScore,
          platformCount: platformSet.size,
          sources: allSources,
          estimatedNiche: cluster.niche,
        });
      }

      return merged.length > 0 ? merged : trends;
    } catch (error) {
      logger.warn({ error }, '[TrendAggregator] AI clustering failed, using raw aggregation');
      return trends;
    }
  }

  /** 캐시 확인 (같은 요청 1시간 이내) */
  private async checkCache(request: TrendDiscoveryRequest): Promise<TrendDiscoveryResult | null> {
    try {
      const cachePath = this.getCachePath(request);
      if (!await fs.pathExists(cachePath)) return null;

      const stat = await fs.stat(cachePath);
      if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;

      return await fs.readJSON(cachePath);
    } catch {
      return null;
    }
  }

  private async saveCache(request: TrendDiscoveryRequest, result: TrendDiscoveryResult): Promise<void> {
    try {
      await fs.writeJSON(this.getCachePath(request), result, { spaces: 2 });
    } catch {
      // 캐시 저장 실패 무시
    }
  }

  private getCachePath(request: TrendDiscoveryRequest): string {
    const key = `trends_${request.region || 'KR'}_${request.category || 'all'}_${(request.platforms || ['all']).join('-')}`;
    return path.join(this.cacheDir, `${key}.json`);
  }

  private parseJSON(text: string): unknown {
    try {
      let json = text;
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) json = fenceMatch[1].trim();
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  /** Bilibili 중국어 키워드 → 한국어 번역 (Gemini Flash 배치) */
  private async translateBilibiliKeywords(keywords: TrendKeyword[]): Promise<TrendKeyword[]> {
    try {
      const chineseTitles = keywords.map(k => k.keyword);

      const prompt = `다음 중국어 비디오 제목들을 한국어로 번역해줘.
각 제목을 짧고 자연스러운 한국어 키워드(핵심 주제)로 변환해줘.
번역이 아니라 "한국인이 검색할 만한 키워드"로 의역해줘.

입력:
${chineseTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

JSON 배열로 반환 (입력과 같은 순서):
["한국어키워드1", "한국어키워드2", ...]`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const rawText = response.text || '';
      const parsed = this.parseJSON(rawText);

      if (!parsed || !Array.isArray(parsed) || parsed.length !== keywords.length) {
        logger.warn('[TrendAggregator] Bilibili translation parse failed, using originals');
        return keywords;
      }

      const translated = keywords.map((kw, i) => ({
        ...kw,
        keyword: String(parsed[i]) || kw.keyword,
      }));

      logger.info(
        { sample: `${chineseTitles[0]} → ${translated[0]?.keyword}` },
        '[TrendAggregator] Bilibili keywords translated to Korean'
      );

      return translated;
    } catch (error) {
      logger.warn({ error }, '[TrendAggregator] Bilibili translation failed, using originals');
      return keywords;
    }
  }

  private getYouTubeApiKey(): string {
    return this.apiKey;
  }
}
