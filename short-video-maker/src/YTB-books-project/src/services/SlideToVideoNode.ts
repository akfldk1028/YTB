/**
 * SlideToVideoNode — NotebookLM 슬라이드 → 영상 생성 n8n 노드
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ 파이프라인 흐름                                         │
 * │                                                         │
 * │ Step 1: 슬라이드 PNG 수집 (slidesDir → 정렬)            │
 * │ Step 2: Gemini Vision → 슬라이드별 나레이션 생성         │
 * │ Step 3: ShortPlan + imagePaths 어댑터                    │
 * │ Step 4: BooksVideoService.createShortVideo() 위임        │
 * │   (TTS + Ken Burns + 자막 + concat → 최종 영상)         │
 * └─────────────────────────────────────────────────────────┘
 *
 * n8n 패턴: SlideToVideoInput → process() → SlideToVideoOutput
 *
 * @version 1.0.0
 */

import path from 'path';
import fs from 'fs-extra';
import { logger, Config } from '../../../config';
import { getBooksVideoService, BOOKS_PROJECT_CONFIG } from './BooksVideoService';
import { getStyleProfile } from '../styles';
import type { BooksVideoConfig } from './BooksVideoService';
import type { ScenePlan, ShortPlan } from './ContentPlannerService';
import type { SceneType } from '../types';

// ============================================
// Input / Output Interfaces
// ============================================

export interface SlideToVideoInput {
  /** 책/문서 ID (추적용) */
  bookId: string;
  /** 슬라이드 폴더 경로 (slide_001.png, slide_002.png, ...) */
  slidesDir: string;
  /** 또는 개별 슬라이드 경로 배열 (slidesDir보다 우선) */
  slidePaths?: string[];
  /** 스타일 프로파일 ID (ttsVoice, hookTextOverlay 등 결정) */
  style?: string;
  /** 에피소드 번호 (제목 생성용) */
  episodeNumber?: number;
  /** 나레이션 언어 */
  language?: 'ko' | 'en';
  /** 나레이션 생성 모드: vision=AI가 슬라이드 읽음, manual=직접 제공 */
  narrationMode?: 'vision' | 'manual';
  /** manual 모드: 슬라이드별 나레이션 텍스트 */
  manualNarrations?: string[];
  /** Gemini Vision 모델 */
  visionModel?: string;
  /** 슬라이드당 최대 나레이션 글자수 */
  maxNarrationLength?: number;
  /** BooksVideoConfig 추가 설정 */
  videoConfig?: Partial<BooksVideoConfig>;
}

export interface SlideNarration {
  slideIndex: number;
  slidePath: string;
  narration: string;
  /** AI가 읽은 슬라이드 텍스트 원본 */
  slideText?: string;
  /** AI가 추론한 씬 타입 */
  sceneType?: SceneType;
}

export interface SlideToVideoOutput {
  success: boolean;
  videoPath?: string;
  videoId?: string;
  duration?: number;
  /** 슬라이드별 생성된 나레이션 */
  narrations?: SlideNarration[];
  /** 비용 추정 ($) */
  costEstimate?: {
    visionCalls: number;
    ttsCost: number;
    total: number;
  };
  error?: string;
}

// ============================================
// Node Implementation
// ============================================

export class SlideToVideoNode {
  private config: Config;
  private visionModel: string;

  constructor(config?: Config) {
    this.config = config || new Config();
    this.visionModel = 'gemini-2.0-flash';
  }

  /**
   * 메인 실행: 슬라이드 폴더 → 최종 영상
   */
  async process(input: SlideToVideoInput): Promise<SlideToVideoOutput> {
    const startTime = Date.now();

    logger.info({
      bookId: input.bookId,
      slidesDir: input.slidesDir,
      style: input.style,
      narrationMode: input.narrationMode || 'vision',
    }, '[SlideToVideo] 시작');

    try {
      // Step 1: 슬라이드 수집
      const slidePaths = await this.collectSlides(input);
      if (slidePaths.length === 0) {
        return { success: false, error: '슬라이드가 없습니다' };
      }
      if (slidePaths.length > 15) {
        logger.warn({ count: slidePaths.length }, '[SlideToVideo] 슬라이드 15장 초과 — 15장까지만 사용');
        slidePaths.splice(15);
      }

      logger.info({ slideCount: slidePaths.length }, '[SlideToVideo] Step 1: 슬라이드 수집 완료');

      // Step 2: 나레이션 생성
      const narrations = await this.generateNarrations(slidePaths, input);
      logger.info({
        count: narrations.length,
        preview: narrations[0]?.narration?.substring(0, 40),
      }, '[SlideToVideo] Step 2: 나레이션 생성 완료');

      // Step 3: ShortPlan 어댑터
      const { shortPlan, imagePaths } = this.buildShortPlan(narrations, input);

      // Step 4: BooksVideoService 위임
      const styleProfile = getStyleProfile(input.style);
      const videoService = getBooksVideoService();

      const videoConfig: BooksVideoConfig = {
        orientation: 'portrait',
        language: input.language || 'ko',
        ttsVoice: styleProfile.ttsVoice,
        ttsGender: styleProfile.ttsGender,
        ttsStylePrompt: styleProfile.ttsStylePrompt,
        subtitleYPosition: BOOKS_PROJECT_CONFIG.subtitleYPosition,
        hookTextOverlay: styleProfile.hookTextOverlay,
        // 슬라이드 영상: 수식 오버레이 불필요 (슬라이드에 이미 텍스트 포함)
        enableMathFormulas: false,
        // 슬라이드 영상: Grok 애니메이션 불필요 → Ken Burns만 사용 (비용 $0)
        enableAnimation: false,
        // v13.1: Cat 프로젝트 패턴 — 최소 5초/씬 (짧은 나레이션도 슬라이드 읽을 시간 확보)
        minSceneDuration: 5,
        // v13.1: 슬라이드 간 부드러운 전환 (xfade 0.3초)
        useSceneTransitions: true,
        // v13.1: Vision AI가 이미 문맥 연결한 나레이션 → 커넥터 중복 방지
        disableConnectors: true,
        ...input.videoConfig,
      };

      const result = await videoService.createShortVideo({
        bookId: input.bookId,
        shortPlan,
        imagePaths,
        config: videoConfig,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (!result.success) {
        return { success: false, error: result.error, narrations };
      }

      logger.info({
        videoPath: result.videoPath,
        duration: result.duration,
        elapsed: `${elapsed}s`,
      }, '[SlideToVideo] 완료');

      return {
        success: true,
        videoPath: result.videoPath,
        videoId: result.videoId,
        duration: result.duration,
        narrations,
        costEstimate: {
          visionCalls: input.narrationMode === 'manual' ? 0 : slidePaths.length,
          ttsCost: slidePaths.length * 0.001,
          total: (input.narrationMode === 'manual' ? 0 : slidePaths.length * 0.0002) + slidePaths.length * 0.001,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[SlideToVideo] 실패');
      return { success: false, error: msg };
    }
  }

  // ============================================
  // Step 1: 슬라이드 수집 + 정렬
  // ============================================

  private async collectSlides(input: SlideToVideoInput): Promise<string[]> {
    if (input.slidePaths && input.slidePaths.length > 0) {
      // 직접 경로 제공 시 검증만
      const valid: string[] = [];
      for (const p of input.slidePaths) {
        if (await fs.pathExists(p)) valid.push(p);
        else logger.warn({ path: p }, '[SlideToVideo] 슬라이드 파일 없음 — 스킵');
      }
      return valid;
    }

    if (!await fs.pathExists(input.slidesDir)) {
      return [];
    }

    const files = await fs.readdir(input.slidesDir);
    return files
      .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .sort() // slide_001, slide_002, ... 알파벳 정렬
      .map(f => path.join(input.slidesDir, f));
  }

  // ============================================
  // Step 2: Gemini Vision 나레이션 생성
  // ============================================

  private async generateNarrations(
    slidePaths: string[],
    input: SlideToVideoInput,
  ): Promise<SlideNarration[]> {
    const mode = input.narrationMode || 'vision';

    // manual 모드
    if (mode === 'manual' && input.manualNarrations) {
      return slidePaths.map((p, i) => ({
        slideIndex: i,
        slidePath: p,
        narration: input.manualNarrations![i] || '이 슬라이드의 내용을 확인해보세요.',
        sceneType: this.inferSceneType(i, slidePaths.length),
      }));
    }

    // vision 모드: Gemini Vision API
    const apiKey = this.config.googleGeminiApiKey;
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY 필요 (Gemini Vision 나레이션 생성)');
    }

    const model = input.visionModel || this.visionModel;
    const maxLen = input.maxNarrationLength || 80;
    const narrations: SlideNarration[] = [];

    for (let i = 0; i < slidePaths.length; i++) {
      // 이전 슬라이드 나레이션을 컨텍스트로 전달 (자연스러운 이어짐)
      const prevNarrations = narrations.map(n => n.narration);
      try {
        const narration = await this.callVisionAPI(
          apiKey, model, slidePaths[i], i, slidePaths.length, maxLen, input.language || 'ko', prevNarrations,
        );
        narrations.push(narration);
      } catch (error) {
        logger.warn({ error, slideIndex: i }, '[SlideToVideo] Vision API 실패 — fallback 나레이션');
        narrations.push({
          slideIndex: i,
          slidePath: slidePaths[i],
          narration: '이 내용을 함께 살펴볼까요?',
          sceneType: this.inferSceneType(i, slidePaths.length),
        });
      }
    }

    return narrations;
  }

  private async callVisionAPI(
    apiKey: string,
    model: string,
    slidePath: string,
    slideIndex: number,
    totalSlides: number,
    maxLength: number,
    language: string,
    prevNarrations: string[] = [],
  ): Promise<SlideNarration> {
    const imageBuffer = await fs.readFile(slidePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(slidePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

    const positionHint = slideIndex === 0
      ? '첫 슬라이드 — 시청자의 관심을 끄는 훅으로 시작하세요'
      : slideIndex === totalSlides - 1
        ? '마지막 슬라이드 — 핵심 메시지 요약 + 댓글 유도 CTA'
        : '중간 슬라이드 — 핵심 내용을 전달하세요';

    // 이전 나레이션 컨텍스트 (자연스러운 이어짐)
    const contextBlock = prevNarrations.length > 0
      ? `\n\n이전 슬라이드 나레이션 (흐름 참고, 반복 금지):\n${prevNarrations.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
      : '';

    const prompt = `당신은 YouTube Shorts 나레이터입니다.
이 슬라이드 이미지를 보고, 시청자에게 설명하는 ${language === 'ko' ? '한국어' : '영어'} 나레이션을 작성하세요.

규칙:
1. 슬라이드에 보이는 텍스트와 시각 요소를 기반으로 자연스럽게 설명
2. 친구에게 이야기하듯 따뜻하고 자연스러운 구어체
3. ${maxLength}자 이내
4. 슬라이드 ${slideIndex + 1}/${totalSlides} — ${positionHint}
5. "이 슬라이드에는..." 같은 메타 표현 금지. 바로 내용을 말하세요
6. 슬라이드에 이미 텍스트가 있으면 그걸 그대로 읽지 말고, 그 의미를 풀어서 설명하세요
7. 이전 나레이션과 자연스럽게 이어지도록 작성 (같은 말 반복 금지)${contextBlock}

JSON으로 응답:
{"narration": "나레이션 텍스트", "slideText": "슬라이드에서 읽은 원본 텍스트", "sceneType": "hook|explanation|conclusion"}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // 30초 타임아웃 — 걸리면 fallback 나레이션 사용
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { data: base64, mimeType } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vision API ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    logger.debug({ slideIndex, rawResponseLength: text?.length, rawPreview: text?.substring(0, 120) }, '[SlideToVideo] Vision API raw response');
    if (!text) throw new Error('Vision API 빈 응답');

    // Gemini가 코드펜스로 감싸거나 깨진 JSON 반환할 수 있음
    const jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
      // Gemini가 배열로 감싸는 경우 ([{...}]) → 첫 번째 요소 unwrap
      if (Array.isArray(parsed)) parsed = parsed[0] || {};
    } catch {
      // JSON 파싱 실패 시 fallback 나레이션 (깨진 JSON 텍스트가 아닌 안전한 문구)
      logger.warn({ slideIndex, rawText: text.substring(0, 100) }, '[SlideToVideo] JSON 파싱 실패 — fallback');
      parsed = { narration: '이 내용을 함께 살펴볼까요?', sceneType: undefined };
    }
    const sceneType = this.validateSceneType(parsed.sceneType, slideIndex, totalSlides);

    const narrationText = (parsed.narration || '').trim();
    if (!narrationText) {
      logger.warn({ slideIndex, rawText: text.substring(0, 150) }, '[SlideToVideo] 빈 나레이션 — fallback');
    }

    return {
      slideIndex,
      slidePath,
      narration: (narrationText || '이 내용을 함께 살펴볼까요?').substring(0, maxLength),
      slideText: parsed.slideText,
      sceneType,
    };
  }

  // ============================================
  // Step 3: ShortPlan 어댑터
  // ============================================

  private buildShortPlan(
    narrations: SlideNarration[],
    input: SlideToVideoInput,
  ): { shortPlan: ShortPlan; imagePaths: string[] } {
    const scenes: ScenePlan[] = narrations.map((n, i) => ({
      sceneIndex: i,
      sceneType: n.sceneType || this.inferSceneType(i, narrations.length),
      narrationText: n.narration,
      visualPrompt: '', // 슬라이드가 곧 비주얼 — 프롬프트 불필요
      durationHint: 7,  // TTS가 실제 길이 결정
      sourceChunkIds: [],
    }));

    const shortPlan: ShortPlan = {
      shortIndex: input.episodeNumber || 1,
      title: `EP${String(input.episodeNumber || 1).padStart(2, '0')}`,
      hook: narrations[0]?.narration || '',
      theme: input.bookId,
      scenes,
      totalDuration: scenes.length * 7,
      tags: [],
    };

    const imagePaths = narrations.map(n => n.slidePath);
    return { shortPlan, imagePaths };
  }

  // ============================================
  // Helpers
  // ============================================

  private inferSceneType(index: number, total: number): SceneType {
    if (index === 0) return 'hook';
    if (index === total - 1) return 'conclusion';
    return 'explanation';
  }

  private validateSceneType(raw: string | undefined, index: number, total: number): SceneType {
    const valid: SceneType[] = ['hook', 'intro', 'explanation', 'example', 'conclusion', 'cta'];
    if (raw && valid.includes(raw as SceneType)) return raw as SceneType;
    return this.inferSceneType(index, total);
  }
}

// ============================================
// Factory (singleton)
// ============================================

let nodeInstance: SlideToVideoNode | null = null;

export function getSlideToVideoNode(): SlideToVideoNode {
  if (!nodeInstance) {
    nodeInstance = new SlideToVideoNode();
  }
  return nodeInstance;
}
