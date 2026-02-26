/**
 * ContentRewriterService (n8n 노드)
 * ContentDNA → AI 재창작 → VideoCloneContent
 *
 * Input:  ContentDNA (추출된 콘텐츠 구조)
 * Output: VideoCloneContent (기존 clone 파이프라인 호환)
 *
 * 핵심: 저작권 안전 — 구조만 참고, 내용은 완전 재창작
 * 비용: ~$0.02 (텍스트만)
 */

import { GoogleGenAI } from '@google/genai';
import { logger } from '../../config';
import { CONTENT_REWRITE_PROMPT } from '../utils/PromptTemplates';
import type { ContentDNA, VideoCloneContent } from '../types';

const MODEL = 'gemini-2.0-flash';
const REWRITE_COST_ESTIMATE = 0.02;

export class ContentRewriterService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * ContentDNA를 기반으로 완전히 새로운 스크립트 생성
   */
  async rewrite(contentDNA: ContentDNA, targetLanguage = 'ko'): Promise<VideoCloneContent | null> {
    try {
      logger.info(
        { topic: contentDNA.topic, niche: contentDNA.niche, language: contentDNA.language },
        '[ContentRewriter] Starting rewrite'
      );

      const prompt = CONTENT_REWRITE_PROMPT(
        JSON.stringify(contentDNA, null, 2),
        targetLanguage
      );

      const response = await this.ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const rawText = response.text || '';
      const parsed = this.parseJSON(rawText);

      if (!parsed || !parsed.title || !parsed.hook || !Array.isArray(parsed.mainPoints) || !parsed.conclusion) {
        logger.error({ rawText: rawText.substring(0, 500) }, '[ContentRewriter] Invalid response structure');
        return null;
      }

      const result: VideoCloneContent = {
        title: parsed.title,
        hook: parsed.hook,
        mainPoints: parsed.mainPoints,
        conclusion: parsed.conclusion,
      };

      logger.info(
        { title: result.title, pointCount: result.mainPoints.length },
        '[ContentRewriter] Rewrite complete'
      );

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[ContentRewriter] Rewrite failed');
      return null;
    }
  }

  getCostEstimate(): number {
    return REWRITE_COST_ESTIMATE;
  }

  private parseJSON(text: string): any {
    try {
      let json = text;
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) json = fenceMatch[1].trim();
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
}
