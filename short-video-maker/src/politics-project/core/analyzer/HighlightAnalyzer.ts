/**
 * Highlight Analyzer
 *
 * AI를 사용하여 자막에서 하이라이트 구간을 분석합니다.
 * Google Gemini API 사용 (responseSchema로 JSON 출력 보장)
 */

import { GoogleGenAI, Type } from '@google/genai';
import { logger } from '../../../logger';
import { SubtitleEntry, Highlight, AnalyzerOptions } from './types';
import { HIGHLIGHT_ANALYSIS_PROMPT, applyTemplate } from './prompts';

// Highlight 배열 스키마 정의
const HIGHLIGHT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    highlights: {
      type: Type.ARRAY,
      description: '하이라이트 구간 목록 (3개 이상)',
      items: {
        type: Type.OBJECT,
        properties: {
          startSec: {
            type: Type.NUMBER,
            description: '시작 시간 (초)',
          },
          endSec: {
            type: Type.NUMBER,
            description: '종료 시간 (초)',
          },
          title: {
            type: Type.STRING,
            description: '하이라이트 제목 (짧게)',
          },
          reason: {
            type: Type.STRING,
            description: '선정 이유',
          },
          score: {
            type: Type.NUMBER,
            description: '중요도 점수 (1-10)',
          },
        },
        propertyOrdering: ['startSec', 'endSec', 'title', 'reason', 'score'],
        required: ['startSec', 'endSec', 'title', 'reason'],
      },
    },
  },
  required: ['highlights'],
};

export class HighlightAnalyzer {
  private ai: GoogleGenAI;
  private model: string;

  constructor(options?: { model?: string; apiKey?: string }) {
    const apiKey = options?.apiKey || process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY is required for HighlightAnalyzer');
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.model = options?.model || 'gemini-2.5-flash';
  }

  /**
   * 자막에서 하이라이트 구간 분석
   */
  async analyze(
    entries: SubtitleEntry[],
    options: AnalyzerOptions
  ): Promise<Highlight[]> {
    logger.info({
      entryCount: entries.length,
      title: options.title
    }, '하이라이트 분석 시작');

    const subtitleText = this.formatSubtitles(entries);
    const prompt = this.buildPrompt(subtitleText, options);

    const response = await this.callAI(prompt);
    const highlights = this.parseResponse(response);

    logger.info({
      highlightCount: highlights.length
    }, '하이라이트 분석 완료');

    return highlights;
  }

  /**
   * 자막을 분석용 텍스트로 포맷
   */
  private formatSubtitles(entries: SubtitleEntry[]): string {
    return entries
      .map(e => `[${this.formatTime(e.startSec)}] ${e.text}`)
      .join('\n');
  }

  /**
   * 시간을 MM:SS 형식으로 포맷
   */
  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * AI 프롬프트 생성
   */
  private buildPrompt(subtitleText: string, options: AnalyzerOptions): string {
    return applyTemplate(HIGHLIGHT_ANALYSIS_PROMPT, {
      title: options.title,
      duration: options.duration,
      subtitleText,
      maxHighlights: options.maxHighlights || 5
    });
  }

  /**
   * Google Gemini API 호출 (responseSchema로 JSON 보장)
   */
  private async callAI(prompt: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        maxOutputTokens: 4096,  // 응답 잘림 방지
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: HIGHLIGHT_SCHEMA,
      }
    });

    const text = response.text || '';
    logger.debug({ responseLength: text.length }, 'AI 응답 수신');
    return text;
  }

  /**
   * AI 응답 파싱 (responseSchema 사용 시 바로 JSON)
   */
  private parseResponse(response: string): Highlight[] {
    try {
      if (!response || response.trim() === '') {
        logger.warn('AI 응답이 비어있음');
        return [];
      }

      // responseSchema를 사용하면 response가 바로 유효한 JSON
      const parsed = JSON.parse(response);
      const highlights = parsed.highlights || parsed || [];

      // 배열이 아닌 경우 처리
      const highlightArray = Array.isArray(highlights) ? highlights : [highlights];

      const validated = this.validateHighlights(highlightArray);
      logger.info({
        rawCount: highlightArray.length,
        validCount: validated.length
      }, 'AI 응답 파싱 완료');

      return validated;
    } catch (error) {
      logger.error({ error, response: response.substring(0, 500) }, 'AI 응답 파싱 실패');
      return [];
    }
  }

  /**
   * 하이라이트 유효성 검증
   */
  private validateHighlights(highlights: unknown[]): Highlight[] {
    return highlights
      .filter((h) => this.isValidHighlight(h))
      .map(h => {
        const obj = h as Highlight;
        return {
          startSec: obj.startSec,
          endSec: obj.endSec,
          title: obj.title,
          reason: obj.reason,
          score: obj.score
        };
      });
  }

  /**
   * 하이라이트 객체 유효성 체크
   */
  private isValidHighlight(h: unknown): h is Highlight {
    if (typeof h !== 'object' || h === null) return false;

    const obj = h as Record<string, unknown>;

    return (
      typeof obj.startSec === 'number' &&
      typeof obj.endSec === 'number' &&
      typeof obj.title === 'string' &&
      typeof obj.reason === 'string' &&
      obj.startSec < obj.endSec
    );
  }
}
