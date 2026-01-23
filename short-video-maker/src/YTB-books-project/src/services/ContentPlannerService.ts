/**
 * ContentPlannerService
 * AI를 사용하여 책/문서 청크를 분석하고 Shorts 계획을 생성
 *
 * 기능:
 * - 청크 분석하여 Shorts 개수 결정
 * - 각 Short당 Scene 분할
 * - 나레이션 텍스트 및 이미지 프롬프트 생성
 */

import { logger } from '../../../config';
import type { BookChunk } from '../types';

// ============================================
// Types
// ============================================

export interface ScenePlan {
  sceneIndex: number;
  sceneType: 'hook' | 'intro' | 'problem' | 'solution' | 'explanation' | 'example' | 'data' | 'comparison' | 'conclusion' | 'cta';
  narrationText: string;           // 나레이션 (한국어)
  visualPrompt: string;            // 이미지 생성 프롬프트 (영어)
  durationHint: number;            // 예상 길이 (초)
  sourceChunkIds: string[];        // 참조된 청크 ID들
}

export interface ShortPlan {
  shortIndex: number;
  title: string;                   // Short 제목
  hook: string;                    // 시작 훅 (첫 3초)
  theme: string;                   // 주제/테마
  scenes: ScenePlan[];
  totalDuration: number;           // 총 예상 길이 (초)
  tags: string[];                  // YouTube 태그
}

export interface ShortsPlan {
  bookId: string;
  bookTitle: string;
  totalShorts: number;
  character: {
    description: string;           // 캐릭터 설명 (프롬프트용)
    style: string;                 // 스타일 (ghibli, anime, realistic 등)
  };
  shorts: ShortPlan[];
  metadata: {
    analyzedAt: string;
    totalChunks: number;
    totalScenes: number;
    estimatedTotalDuration: number;
  };
}

export interface ContentPlannerConfig {
  apiKey: string;
  model?: string;                  // default: gemini-2.0-flash
  maxShortsPerBook?: number;       // default: 10
  maxScenesPerShort?: number;      // default: 8
  targetShortDuration?: number;    // default: 60 (seconds)
  language?: 'ko' | 'en';          // default: ko
  style?: string;                  // default: ghibli
}

// ============================================
// Service
// ============================================

export class ContentPlannerService {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private model: string;
  private config: Required<Omit<ContentPlannerConfig, 'apiKey'>>;

  constructor(config: ContentPlannerConfig) {
    if (!config.apiKey) {
      throw new Error('Google Gemini API key is required');
    }

    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-2.0-flash';
    this.config = {
      model: this.model,
      maxShortsPerBook: config.maxShortsPerBook || 10,
      maxScenesPerShort: config.maxScenesPerShort || 8,
      targetShortDuration: config.targetShortDuration || 60,
      language: config.language || 'ko',
      style: config.style || 'ghibli'
    };

    logger.info({ model: this.model, config: this.config }, '🤖 ContentPlannerService initialized');
  }

  /**
   * 청크들을 분석하여 Shorts 계획 생성
   */
  async analyzeAndPlan(
    bookId: string,
    bookTitle: string,
    chunks: BookChunk[],
    characterDescription?: string
  ): Promise<ShortsPlan> {
    logger.info({ bookId, bookTitle, chunkCount: chunks.length }, '📊 Starting content analysis');

    // 청크 텍스트 결합
    const combinedText = chunks.map((c, i) =>
      `[청크 ${i + 1}] ${c.text}`
    ).join('\n\n');

    // AI 분석 요청
    const analysisPrompt = this.buildAnalysisPrompt(bookTitle, combinedText, characterDescription);
    const response = await this.callGeminiAPI(analysisPrompt);

    // JSON 파싱
    const plan = this.parseAIResponse(response, bookId, bookTitle, chunks);

    logger.info({
      bookId,
      totalShorts: plan.totalShorts,
      totalScenes: plan.metadata.totalScenes
    }, '✅ Content analysis completed');

    return plan;
  }

  /**
   * 분석 프롬프트 생성
   */
  private buildAnalysisPrompt(
    bookTitle: string,
    content: string,
    characterDescription?: string
  ): string {
    const style = this.config.style;
    const maxShorts = this.config.maxShortsPerBook;
    const maxScenes = this.config.maxScenesPerShort;
    const targetDuration = this.config.targetShortDuration;

    return `당신은 YouTube Shorts 콘텐츠 플래너입니다.

## 입력 문서
제목: ${bookTitle}
내용:
${content.substring(0, 15000)}
${content.length > 15000 ? '\n... (내용 생략)' : ''}

## 작업
이 문서를 기반으로 YouTube Shorts 시리즈를 계획해주세요.

## 제약조건
- 최대 ${maxShorts}개의 Shorts
- 각 Short는 최대 ${maxScenes}개의 Scene
- 각 Short 목표 길이: ${targetDuration}초
- 각 Scene: 5-8초
- 스타일: ${style}
- 캐릭터: ${characterDescription || `${style} 스타일의 친근한 해설자 캐릭터`}

## Scene Types (sceneType 값으로 사용)
- hook: 시선을 끄는 질문/놀라운 사실 (첫 Scene)
- intro: 주제 소개
- problem: 문제 제기
- solution: 해결책 제시
- explanation: 핵심 개념 설명
- example: 구체적 예시
- data: 통계/데이터 제시
- comparison: 비교/대조
- conclusion: 결론/요약
- cta: Call to Action (마지막 Scene)

## 출력 형식 (JSON)
반드시 아래 형식의 유효한 JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.

{
  "shorts": [
    {
      "shortIndex": 0,
      "title": "Shorts 제목 (한국어, 50자 이내)",
      "hook": "시작 훅 문장 (한국어)",
      "theme": "주제 키워드",
      "scenes": [
        {
          "sceneIndex": 0,
          "sceneType": "hook",
          "narrationText": "나레이션 텍스트 (한국어, 자연스러운 말투)",
          "visualPrompt": "Image prompt in English, ${style} style, detailed visual description",
          "durationHint": 5,
          "sourceChunkIds": ["chunk_0"]
        }
      ],
      "tags": ["태그1", "태그2", "태그3"]
    }
  ],
  "character": {
    "description": "${characterDescription || `A friendly narrator character, ${style} anime style, expressive face, warm colors`}",
    "style": "${style}"
  }
}

## 주의사항
1. narrationText는 자연스러운 한국어 구어체로 작성
2. visualPrompt는 영어로 작성, 구체적인 시각 묘사 포함
3. 각 Short는 hook으로 시작하고 cta 또는 conclusion으로 끝낼 것
4. sourceChunkIds는 해당 Scene이 참조하는 청크 번호 (chunk_0, chunk_1, ...)
5. JSON만 출력 - 설명이나 주석 없음`;
  }

  /**
   * Gemini API 호출
   */
  private async callGeminiAPI(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    };

    logger.debug({ model: this.model, promptLength: prompt.length }, '📤 Calling Gemini API');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, '❌ Gemini API error');
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      logger.error({ response: data }, '❌ No text in Gemini response');
      throw new Error('No text in Gemini API response');
    }

    return data.candidates[0].content.parts[0].text;
  }

  /**
   * AI 응답 파싱
   */
  private parseAIResponse(
    responseText: string,
    bookId: string,
    bookTitle: string,
    chunks: BookChunk[]
  ): ShortsPlan {
    let parsed: any;

    try {
      // JSON 추출 (마크다운 코드 블록 제거)
      let jsonStr = responseText.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }

      parsed = JSON.parse(jsonStr.trim());
    } catch (error) {
      logger.error({ error, responseText: responseText.substring(0, 500) }, '❌ Failed to parse AI response');
      throw new Error('Failed to parse AI response as JSON');
    }

    // 계획 구성
    const shorts: ShortPlan[] = (parsed.shorts || []).map((s: any, idx: number) => {
      const scenes: ScenePlan[] = (s.scenes || []).map((sc: any, scIdx: number) => ({
        sceneIndex: sc.sceneIndex ?? scIdx,
        sceneType: sc.sceneType || 'explanation',
        narrationText: sc.narrationText || '',
        visualPrompt: sc.visualPrompt || '',
        durationHint: sc.durationHint || 5,
        sourceChunkIds: sc.sourceChunkIds || [`chunk_${scIdx}`]
      }));

      return {
        shortIndex: s.shortIndex ?? idx,
        title: s.title || `Short ${idx + 1}`,
        hook: s.hook || '',
        theme: s.theme || '',
        scenes,
        totalDuration: scenes.reduce((sum, sc) => sum + sc.durationHint, 0),
        tags: s.tags || []
      };
    });

    const totalScenes = shorts.reduce((sum, s) => sum + s.scenes.length, 0);
    const totalDuration = shorts.reduce((sum, s) => sum + s.totalDuration, 0);

    return {
      bookId,
      bookTitle,
      totalShorts: shorts.length,
      character: {
        description: parsed.character?.description || `A friendly narrator character, ${this.config.style} style`,
        style: parsed.character?.style || this.config.style
      },
      shorts,
      metadata: {
        analyzedAt: new Date().toISOString(),
        totalChunks: chunks.length,
        totalScenes,
        estimatedTotalDuration: totalDuration
      }
    };
  }

  /**
   * 단일 청크에서 Scene 생성 (간단한 케이스)
   */
  async createSceneFromChunk(
    chunk: BookChunk,
    sceneIndex: number,
    style?: string
  ): Promise<ScenePlan> {
    const prompt = `다음 텍스트를 기반으로 YouTube Shorts의 한 Scene을 생성해주세요.

텍스트:
${chunk.text}

## 출력 (JSON)
{
  "sceneIndex": ${sceneIndex},
  "sceneType": "explanation",
  "narrationText": "한국어 나레이션 (자연스러운 구어체)",
  "visualPrompt": "English image prompt, ${style || this.config.style} style, detailed visual",
  "durationHint": 5
}`;

    const response = await this.callGeminiAPI(prompt);
    const parsed = JSON.parse(response);

    return {
      sceneIndex: parsed.sceneIndex ?? sceneIndex,
      sceneType: parsed.sceneType || 'explanation',
      narrationText: parsed.narrationText || chunk.text.substring(0, 200),
      visualPrompt: parsed.visualPrompt || `${chunk.text.substring(0, 100)}, ${style || this.config.style} style`,
      durationHint: parsed.durationHint || 5,
      sourceChunkIds: [chunk.id]
    };
  }

  /**
   * 기존 계획 수정 (Scene 추가/제거)
   */
  async refinePlan(
    plan: ShortsPlan,
    feedback: string
  ): Promise<ShortsPlan> {
    const prompt = `현재 YouTube Shorts 계획을 피드백을 반영하여 수정해주세요.

## 현재 계획
${JSON.stringify(plan, null, 2)}

## 피드백
${feedback}

## 출력
수정된 계획을 동일한 JSON 형식으로 출력하세요.`;

    const response = await this.callGeminiAPI(prompt);
    const parsed = JSON.parse(response);

    // 기존 메타데이터 유지하면서 수정된 내용 반영
    return {
      ...plan,
      ...parsed,
      metadata: {
        ...plan.metadata,
        analyzedAt: new Date().toISOString()
      }
    };
  }
}

// ============================================
// Factory
// ============================================

export function createContentPlannerService(config?: Partial<ContentPlannerConfig>): ContentPlannerService {
  // API 키 우선순위: 직접 전달 > GOOGLE_GEMINI_API_KEY > GEMINI_API_KEY > GOOGLE_API_KEY
  const apiKey = config?.apiKey
    || process.env.GOOGLE_GEMINI_API_KEY
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || '';

  if (!apiKey) {
    logger.warn('⚠️ No Gemini API key found. Set GOOGLE_GEMINI_API_KEY environment variable.');
  }

  return new ContentPlannerService({
    apiKey,
    model: config?.model || 'gemini-2.0-flash',
    maxShortsPerBook: config?.maxShortsPerBook,
    maxScenesPerShort: config?.maxScenesPerShort,
    targetShortDuration: config?.targetShortDuration,
    language: config?.language,
    style: config?.style
  });
}
