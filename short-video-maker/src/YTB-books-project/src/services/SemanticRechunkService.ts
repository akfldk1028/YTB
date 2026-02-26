/**
 * SemanticRechunkService — n8n 노드 패턴
 *
 * AI 시맨틱 청킹의 모든 비즈니스 로직을 단일 노드로 캡슐화:
 * - buildPrompt(): 청크 미리보기 → AI 프롬프트 생성
 * - callGemini(): Gemini API 호출 + JSON 파싱
 * - validatePlan(): 분할 계획 검증 (누락/중복 체크)
 * - assembleChapters(): AI 계획 + 원본 텍스트 → 최종 챕터 조합
 * - rechunk(): 전체 파이프라인 (Input → Output)
 */

import { logger } from '../../../config';
import type { BookChunk } from '../types';

// ============================================
// Input / Output 인터페이스
// ============================================

export interface RechunkInput {
  bookId: string;
  chunks: BookChunk[];
  apiKey: string;
  model?: string;
  maxOutputTokens?: number;
}

export interface RechunkOutput {
  chapters: SemanticChapter[];
  missingChunksFixed: number;
  previousChunkCount: number;
}

/** AI가 리턴하는 분할 계획 (원본 텍스트 없음, 인덱스만) */
export interface ChunkPlan {
  title: string;
  summary: string;
  keywords: string[];
  chunkType: 'chapter' | 'section' | 'concept';
  chunkIndices: number[];
}

/** Neo4j에 저장할 최종 청크 */
export interface SemanticChapter {
  title: string;
  summary: string;
  text: string;
  keywords: string[];
  chunkType: 'chapter' | 'section' | 'concept';
}

// ============================================
// 상수
// ============================================

const DEFAULT_MODEL = 'gemini-3-flash-preview';
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const PREVIEW_CHARS = 200;

// ============================================
// Service
// ============================================

export class SemanticRechunkService {

  /**
   * 전체 리청킹 파이프라인 (n8n 노드 메인 메서드)
   * Input: bookId + 기존 chunks + API key
   * Output: 시맨틱 챕터 배열 (Neo4j 저장용)
   */
  async rechunk(input: RechunkInput): Promise<RechunkOutput> {
    const { bookId, chunks, apiKey } = input;
    const model = input.model || DEFAULT_MODEL;
    const maxOutputTokens = input.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS;

    if (chunks.length === 0) {
      throw new Error('Cannot rechunk empty chunks array');
    }

    logger.info({ bookId, chunkCount: chunks.length, model }, 'Starting semantic rechunking');

    // 1. 프롬프트 생성 (bookId sanitize: prompt injection 방지)
    const safeBookId = bookId.replace(/[^\w가-힣.\-_() ]/g, '_').substring(0, 100);
    const prompt = this.buildPrompt(safeBookId, chunks);

    // 2. Gemini API 호출
    const rawJson = await this.callGemini(prompt, apiKey, model, maxOutputTokens);

    // 3. JSON 파싱
    const parsed = this.parseGeminiResponse(rawJson);

    // 4. 검증 + 누락 보정
    const missingChunksFixed = this.fixMissingIndices(parsed.chapters, chunks.length);

    // 5. 원본 텍스트 조합
    const chapters = this.assembleChapters(parsed.chapters, chunks);

    logger.info({ bookId, previousCount: chunks.length, newCount: chapters.length, missingFixed: missingChunksFixed }, 'Semantic rechunking complete');

    return {
      chapters,
      missingChunksFixed,
      previousChunkCount: chunks.length,
    };
  }

  /**
   * AI 프롬프트 생성 — 각 청크 앞 200자 미리보기만 전송
   */
  /**
   * Detect if content is primarily English (>50% ASCII letters)
   */
  private isEnglishContent(chunks: BookChunk[]): boolean {
    const sample = chunks.slice(0, 5).map(c => c.text.substring(0, 200)).join('');
    const asciiLetters = (sample.match(/[a-zA-Z]/g) || []).length;
    return asciiLetters / sample.length > 0.5;
  }

  buildPrompt(bookId: string, chunks: BookChunk[]): string {
    const isEnglish = this.isEnglishContent(chunks);
    const chunkPreviews = chunks.map((c, i) =>
      `[Chunk ${i}] (${c.text.length} chars) ${c.text.substring(0, PREVIEW_CHARS).replace(/\n/g, ' ')}`
    ).join('\n');

    if (isEnglish) {
      return `You are an expert educational content editor.
Below are previews of ${chunks.length} existing chunks from the book "${bookId}".
Group these chunks into **semantic units (chapters/sections)** by topic.

## Rules
1. Each chapter should have enough content for 1-3 YouTube Shorts (group 1-5 adjacent chunks)
2. Split at topic boundaries
3. Generate title, summary (1-2 sentences), keywords (3-7) for each chapter
4. chunkType: major unit='chapter', sub-unit='section', standalone concept='concept'
5. **Every chunk must be included** (union of chunkIndices = 0 to ${chunks.length - 1})
6. chunkIndices must be consecutive adjacent indices (e.g. [0,1,2], [3,4] — NOT [0,3,5])
7. Minimum 3, maximum 20 chapters

## Chunk Previews
${chunkPreviews}

## Output Format (JSON) — no text field, only chunkIndices!
{
  "chapters": [
    {
      "title": "Chapter Title",
      "summary": "1-2 sentence summary",
      "keywords": ["keyword1", "keyword2"],
      "chunkType": "chapter",
      "chunkIndices": [0, 1, 2]
    }
  ]
}`;
    }

    return `당신은 교육 콘텐츠 편집 전문가입니다.
아래는 "${bookId}" 책의 기존 청크 ${chunks.length}개의 미리보기입니다.
이 청크들을 **주제별 의미 단위(챕터/섹션)**로 그룹화해주세요.

## 규칙
1. 각 챕터는 YouTube Shorts 1~3개를 만들 수 있는 분량 (인접 청크 1~5개 묶기)
2. 챕터 경계는 주제가 바뀌는 지점에서 자르기
3. 각 챕터에 제목(title), 요약(summary, 1-2문장), 핵심 키워드(keywords, 3-7개) 생성
4. chunkType: 큰 단원='chapter', 소단원='section', 독립 개념='concept'
5. **모든 청크가 빠짐없이** 어딘가에 포함되어야 합니다 (chunkIndices 합집합 = 0~${chunks.length - 1})
6. chunkIndices는 반드시 연속된 인접 인덱스여야 합니다 (예: [0,1,2], [3,4] — [0,3,5]처럼 건너뛰기 금지)
7. 최소 3개, 최대 20개 챕터

## 청크 미리보기
${chunkPreviews}

## 출력 형식 (JSON) — text 필드 없음, chunkIndices만!
{
  "chapters": [
    {
      "title": "챕터 제목",
      "summary": "1-2문장 요약",
      "keywords": ["키워드1", "키워드2"],
      "chunkType": "chapter",
      "chunkIndices": [0, 1, 2]
    }
  ]
}`;
  }

  /**
   * Gemini API 호출 + 응답 텍스트 추출
   */
  async callGemini(prompt: string, apiKey: string, model: string, maxOutputTokens: number): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens, responseMimeType: 'application/json' },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Gemini API error: ${resp.status} ${errText.substring(0, 200)}`);
    }

    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /**
   * Gemini 응답 JSON 파싱 (markdown fence 제거 포함)
   */
  parseGeminiResponse(rawJson: string): { chapters: ChunkPlan[] } {
    try {
      return JSON.parse(rawJson);
    } catch {
      const cleaned = rawJson.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch {
        throw new Error(`AI returned invalid JSON: ${rawJson.substring(0, 300)}`);
      }
    }
  }

  /**
   * 분할 계획 검증 — 누락된 청크를 마지막 챕터에 추가
   * @returns 보정된 누락 인덱스 수
   */
  fixMissingIndices(chapters: ChunkPlan[], totalChunks: number): number {
    if (!chapters || chapters.length === 0) {
      throw new Error('AI returned empty chapters');
    }

    const allUsedIndices = new Set(chapters.flatMap(c => c.chunkIndices));
    const missingIndices = Array.from({ length: totalChunks }, (_, i) => i).filter(i => !allUsedIndices.has(i));

    if (missingIndices.length > 0) {
      logger.warn({ missingIndices }, 'AI plan missing chunk indices — appending to last chapter');
      chapters[chapters.length - 1].chunkIndices.push(...missingIndices);
      chapters[chapters.length - 1].chunkIndices.sort((a, b) => a - b);
    }

    return missingIndices.length;
  }

  /**
   * 엄격 검증 (CLI용 — 중복/범위초과도 체크)
   * @returns null이면 통과, 문자열이면 에러 메시지
   */
  validatePlanStrict(plans: ChunkPlan[], totalChunks: number): string | null {
    const allIndices = new Set<number>();
    for (const plan of plans) {
      for (const idx of plan.chunkIndices) {
        if (idx < 0 || idx >= totalChunks) {
          return `Invalid chunk index ${idx} (total: ${totalChunks})`;
        }
        if (allIndices.has(idx)) {
          return `Duplicate chunk index ${idx}`;
        }
        allIndices.add(idx);
      }
    }

    const missing: number[] = [];
    for (let i = 0; i < totalChunks; i++) {
      if (!allIndices.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
      return `Missing chunk indices: [${missing.join(', ')}]`;
    }

    return null;
  }

  /**
   * AI 계획 + 원본 텍스트 → 최종 SemanticChapter 조합
   * 원본 텍스트를 chunkIndices로 조합 (AI가 변형할 수 없음)
   */
  assembleChapters(plans: ChunkPlan[], chunks: BookChunk[]): SemanticChapter[] {
    return plans.map(plan => ({
      title: plan.title,
      summary: plan.summary,
      keywords: plan.keywords,
      chunkType: plan.chunkType,
      text: plan.chunkIndices
        .filter(idx => idx >= 0 && idx < chunks.length)
        .map(idx => chunks[idx].text)
        .join('\n\n'),
    }));
  }
}

// Singleton factory
let _instance: SemanticRechunkService | null = null;
export function getSemanticRechunkService(): SemanticRechunkService {
  if (!_instance) _instance = new SemanticRechunkService();
  return _instance;
}
