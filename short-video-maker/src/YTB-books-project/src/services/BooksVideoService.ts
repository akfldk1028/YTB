/**
 * BooksVideoService
 * 책 → Shorts 비디오 생성 서비스
 *
 * 기능:
 * - 정적 이미지 + TTS 조합으로 비디오 생성
 * - GPT-to-NanoBanana 이미지 결과 활용
 * - GeminiTTS로 나레이션 생성
 * - 한국어 자막 자동 생성
 * - 수학 수식 LaTeX 렌더링 및 오버레이 (v2.7.0)
 */

import cuid from 'cuid';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../../config';

// FFMpeg 모듈
import { FFMpeg } from '../../../YTB-ffmpeg';
import { VIDEO_DIMENSIONS } from '../../../short-creator/utils/Constants';
import { OrientationEnum } from '../../../types/shorts';

// TTS 모듈
import { GeminiTTS } from '../../../YTB-tts';
import { Config } from '../../../config';

// 자막 유틸리티
import { splitNarrationToCaptions } from '../../../YTB-news-project/utils/KoreanCaptionSplitter';

// Types
import type { ScenePlan, ShortPlan } from './ContentPlannerService';
import type { Caption } from '../../../types/shorts';

// v2.7.0: 수학 수식 서비스
import { MathFormulaService, getMathFormulaService, type MathFormula, type MathDetectionResult } from './MathFormulaService';

// v12.2: LaTeX 변수 컬러 코딩 유틸
import { colorizeLatex } from '../utils/latexColorizer';

// v4.0: 이미지 애니메이션 (Grok Img2Video)
// v5.0: Manim 올빼미 캐릭터 애니메이션
import { VideoAnimationService } from '../../../YTB-video-animation';
import type { ManimAnimationRequest } from '../../../YTB-video-animation';

// v12.0: 후크 텍스트 오버레이
import { HookTextOverlayNode } from './HookTextOverlayNode';

// ============================================
// Types & Books Project Config
// ============================================

/**
 * Books 프로젝트 전용 기본 설정
 * - 각 프로젝트(News, Cat, Books)마다 독립적인 config 사용
 * - BooksRouter에서 이 값을 import하여 API 호출 시 적용
 */
export const BOOKS_PROJECT_CONFIG = {
  orientation: 'portrait' as const,
  language: 'ko' as const,
  /** v3.5.2: Books 프로젝트 전용 TTS 음성 (Leda: 따뜻하고 친근한 여성 음성) */
  ttsVoice: 'Leda' as const,
  ttsGender: 'female' as const,
  /** 자막 위치: 최하단 (이미지 가림 방지) */
  subtitleYPosition: 'h*0.88',
  /** 수학 수식 오버레이 활성화 (MathJax PNG, v3.2.0) */
  enableMathFormulas: true,
  /** 수식 위치 (활성화 시) - 상단 배치로 자막과 분리 */
  mathFormulaPosition: 'top' as const,
  /** v3.2.3: 이미지 재사용 비활성화 — 모든 씬 개별 이미지 생성 */
  reuseImageForSameType: false,
  /** v3.1.3: 에피소드당 최대 씬 수 (숏츠 60초 제한 대응) */
  maxScenesPerEpisode: 10,
  /** v3.5.2: 씬당 나레이션 최대 글자수 (한국어 TTS ~4자/초 → 60자≈15초)
   *  v3.4.0 35자는 한국어 문장 1개도 못 담아 문장 중간 절단 → TTS 끊김 */
  maxNarrationLength: 60,
  /** v3.3.0: 수식 씬 나레이션 최대 글자수 (수식 설명에 충분한 길이) */
  maxFormulaNarrationLength: 60,
  /** v3.2.5: 씬당 최대 초 — TTS 길이 우선, 이 값은 TTS 없는 씬의 fallback */
  maxSceneDuration: 8,
  /** v3.3.0: 수식 씬 최대 초 (수식 설명에 충분한 시간) */
  maxFormulaSceneDuration: 12,
  /** v4.0: 이미지 애니메이션 (Grok Img2Video) */
  enableAnimation: true,  // v4.0: Grok Img2Video 애니메이션 — 테스트 시 false, 프로덕션 시 true ($0.05/초)
  animationProvider: 'manim' as const,  // v5.0: 'grok' → 'manim' (올빼미 캐릭터 애니메이션, 무료)
  /** v5.0: Manim 올빼미 캐릭터 애니메이션 — 비활성화 (이미지 품질 우선) */
  enableManim: false,
  /** v11.0: VEO 3.1 Frame Interpolation 활성화 (기본 false, opt-in) */
  enableVeoInterpolation: false,
  /** v11.0: VEO 모델 */
  veoModel: 'veo-3.1-fast-generate-preview' as const,
} as const;

export interface BooksVideoConfig {
  orientation?: 'portrait' | 'landscape';
  /** 콘텐츠 언어 - TTS voice 자동 선택에 사용 */
  language?: 'ko' | 'en';
  ttsVoice?: string;
  ttsGender?: 'female' | 'male';
  /** TTS 스타일 프롬프트 (톤, 속도 지시) */
  ttsStylePrompt?: string;
  subtitleYPosition?: string;
  /** v2.7.0: 수학 수식 감지 및 렌더링 활성화 (기본: false, v2.9.1) */
  enableMathFormulas?: boolean;
  /** v2.7.0: 수식 위치 (기본: bottom) */
  mathFormulaPosition?: 'center' | 'top' | 'bottom';
  /** 수식 SVG fill 색상 (default: white) */
  mathFillColor?: string;
  /** v13.0: 이미지 애니메이션(Grok) 비활성화 — false이면 전체 Ken Burns (슬라이드 영상 등) */
  enableAnimation?: boolean;
  /** v11.0: VEO 3.1 Frame Interpolation 활성화 */
  useVeoInterpolation?: boolean;
  /** v12.2: 변수별 컬러 코딩 활성화 (math_character 스타일) */
  useColorCodedVariables?: boolean;
  /** v12.2: 변수명→색상 매핑 (colorizeLatex에 전달) */
  variableColors?: Record<string, string>;
  /** v12.0: 후크 텍스트 오버레이 설정 */
  hookTextOverlay?: {
    enabled: boolean;
    position: 'top' | 'top-center' | 'center' | 'bottom';
    fontSize: number;
    fontColor: string;
    strokeColor: string;
    strokeWidth: number;
    backgroundColor?: string;
    paddingX?: number;
    paddingY?: number;
  };
  /** v13.1: 최소 씬 길이 (초) — Cat 프로젝트 MIN_SCENE_DURATION 패턴. 슬라이드 영상 등에서 짧은 나레이션도 충분한 시간 표시 */
  minSceneDuration?: number;
  /** v13.1: 씬 간 xfade 전환 (Cat 프로젝트 패턴). false=하드컷(기본), true=0.3초 fade 전환 */
  useSceneTransitions?: boolean;
  /** v13.1: 씬간 커넥터("그리고,", "다음으로,") 주입 비활성화 — AI가 이미 문맥 연결한 나레이션용 */
  disableConnectors?: boolean;
}

export interface BooksVideoInput {
  /** 책 ID (추적용) */
  bookId: string;
  /** Short 계획 (narration, visualPrompt 포함) */
  shortPlan: ShortPlan;
  /** 이미지 경로 배열 (GPT-to-NanoBanana 결과) - scenes 순서와 일치 */
  imagePaths: string[];
  /** 설정 */
  config?: BooksVideoConfig;
  /** v11.0: 키프레임 쌍 경로 (VEO 모드) — imagePaths 대신 사용 */
  keyframePairs?: Array<{
    firstFramePath: string;
    lastFramePath: string;
  }>;
}

export interface BooksVideoResult {
  success: boolean;
  videoId: string;
  videoPath?: string;
  duration?: number;
  error?: string;
  details?: {
    sceneCount: number;
    totalTtsDuration: number;
    captionCount: number;
    /** v2.7.0 */
    mathFormulaCount?: number;
    scenesWithMath?: number;
  };
}

// ============================================
// Service
// ============================================

export class BooksVideoService {
  private config: Config;
  private ffmpeg!: FFMpeg;
  private geminiTTS?: GeminiTTS;
  private mathService?: MathFormulaService;  // v2.7.0
  private animationService?: VideoAnimationService;  // v4.0
  private initialized = false;

  constructor() {
    this.config = new Config();
  }

  /**
   * 지연 초기화
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    // FFMpeg 초기화
    this.ffmpeg = await FFMpeg.init();
    logger.info('[BooksVideo] FFMpeg 초기화 완료');

    // Gemini TTS 초기화
    const geminiApiKey = this.config.googleGeminiApiKey;
    if (geminiApiKey) {
      try {
        this.geminiTTS = new GeminiTTS({
          apiKey: geminiApiKey,
          model: 'gemini-2.5-pro-preview-tts',  // v3.5.2: Pro TTS (더 자연스럽고 표현력 좋음)
          defaultGender: 'female',
        });
        logger.info('[BooksVideo] Gemini TTS 초기화 완료');
      } catch (error) {
        logger.warn({ error }, '[BooksVideo] Gemini TTS 초기화 실패');
      }
    } else {
      logger.warn('[BooksVideo] GOOGLE_GEMINI_API_KEY 없음 - TTS 사용 불가');
    }

    // v2.7.0: MathFormulaService 초기화
    try {
      this.mathService = getMathFormulaService();
      logger.info('[BooksVideo] MathFormulaService 초기화 완료');
    } catch (error) {
      logger.warn({ error }, '[BooksVideo] MathFormulaService 초기화 실패 - 수식 없이 진행');
    }

    // v4.0+5.0: VideoAnimationService 초기화 (Manim + Grok)
    if (BOOKS_PROJECT_CONFIG.enableAnimation) {
      try {
        this.animationService = new VideoAnimationService(
          {
            xaiApiKey: this.config.xaiApiKey,
            enableManim: BOOKS_PROJECT_CONFIG.enableManim,
            tempDirPath: this.config.tempDirPath,
          },
          this.ffmpeg
        );

        // v5.0: Manim 설치 확인 (비동기)
        if (BOOKS_PROJECT_CONFIG.enableManim) {
          const manimReady = await this.animationService.initManim();
          logger.info({ manimReady }, '[BooksVideo] Manim 초기화 결과');
        }

        logger.info({
          provider: BOOKS_PROJECT_CONFIG.animationProvider,
          hasGrok: !!this.config.xaiApiKey,
          hasManim: this.animationService.isManimAvailable(),
        }, '[BooksVideo] VideoAnimationService 초기화 완료');
      } catch (error) {
        logger.warn({ error }, '[BooksVideo] VideoAnimationService 초기화 실패 - 정적 이미지로 진행');
      }
    } else {
      logger.info('[BooksVideo] VideoAnimationService 비활성 (enableAnimation=false)');
    }

    this.initialized = true;
    logger.info('[BooksVideo] 서비스 초기화 완료');
  }

  /**
   * Short 비디오 생성
   */
  async createShortVideo(input: BooksVideoInput): Promise<BooksVideoResult> {
    await this.ensureInitialized();

    const { bookId, shortPlan, imagePaths, config: inputConfig } = input;
    const videoId = `book_${bookId}_short_${shortPlan.shortIndex}_${cuid.slug()}`;
    const tempDir = path.join(this.config.tempDirPath, videoId);

    logger.info({
      videoId,
      bookId,
      shortIndex: shortPlan.shortIndex,
      sceneCount: shortPlan.scenes.length,
      imageCount: imagePaths.length,
    }, 'Books Short 비디오 생성 시작');

    // 이미지와 씬 수 일치 검증
    if (imagePaths.length !== shortPlan.scenes.length) {
      return {
        success: false,
        videoId,
        error: `이미지 수(${imagePaths.length})와 씬 수(${shortPlan.scenes.length})가 불일치`,
      };
    }

    // TTS 필수
    if (!this.geminiTTS) {
      return {
        success: false,
        videoId,
        error: 'Gemini TTS가 초기화되지 않음 (API 키 확인)',
      };
    }

    try {
      await fs.ensureDir(tempDir);

      const language = inputConfig?.language || 'ko';

      // ============================================
      // Step 0: 씬 수 제한 + 수식 선택 + 나레이션 재생성
      // v3.1.3: maxScenesPerEpisode로 씬 수 제한 (숏츠 60초)
      // v2.9.2: 수식을 먼저 선택한 후, 나레이션이 수식을 설명하도록 재생성
      // ============================================

      // v3.1.3: 씬 수 제한 - 숏츠 60초 초과 방지
      const maxScenes = BOOKS_PROJECT_CONFIG.maxScenesPerEpisode;
      if (shortPlan.scenes.length > maxScenes) {
        logger.warn({
          original: shortPlan.scenes.length,
          limit: maxScenes,
          trimmed: shortPlan.scenes.length - maxScenes
        }, `⚠️ 씬 수 초과 (${shortPlan.scenes.length} > ${maxScenes}) - 앞 ${maxScenes}개만 사용`);
        shortPlan.scenes = shortPlan.scenes.slice(0, maxScenes);
        // imagePaths도 동일하게 자르기
        imagePaths.splice(maxScenes);
      }

      const sceneMathFormulas: Map<number, MathFormula[]> = new Map();
      const enableMath = inputConfig?.enableMathFormulas ?? BOOKS_PROJECT_CONFIG.enableMathFormulas;
      const defaultMathPosition = inputConfig?.mathFormulaPosition || BOOKS_PROJECT_CONFIG.mathFormulaPosition;
      const sceneNarrations: string[] = shortPlan.scenes.map(s => s.narrationText);

      if (this.mathService && enableMath) {
        logger.info('Step 0: 수식 선택 + 나레이션 정렬 시작...');
        const MAX_FORMULAS_PER_SCENE = 2;
        for (let i = 0; i < shortPlan.scenes.length; i++) {
          const scene = shortPlan.scenes[i];

          try {
            let selectedFormulas: string[] = [];

            // 청크에서 직접 가져온 latexFormulas 처리
            if (scene.latexFormulas && scene.latexFormulas.length > 0) {
              // v3.2.3: BooksRouter에서 라운드로빈 배분 → 여기서 중복필터 불필요
              const formulasToFilter = scene.latexFormulas;

              selectedFormulas = await this.mathService.filterRelevantFormulas(
                scene.narrationText,
                formulasToFilter,
                MAX_FORMULAS_PER_SCENE,
                scene.visualPrompt
              );

              logger.info({
                scene: i + 1,
                before: scene.latexFormulas.length,
                after: selectedFormulas.length,
              }, '수식 필터링 완료');
            }
            // 청크에 수식 없으면 나레이션에서 AI 분석
            else if (scene.narrationText) {
              const detection = await this.mathService.extractAndConvertToLatex(scene.narrationText);
              if (detection.hasMath && detection.formulas.length > 0) {
                selectedFormulas = detection.formulas.map(f => f.latex);
              }
            }

            // 수식이 선택되면: 원래 나레이션 + 수식 설명을 자연스럽게 통합
            if (selectedFormulas.length > 0) {
              const rawNarration = await this.mathService.generateFormulaAwareNarration(
                scene.narrationText,
                selectedFormulas,
                scene.sceneType
              );
              // v3.2.1: LaTeX 잔여물만 제거 (영어 단어는 TTS가 읽으므로 유지)
              let newNarration = rawNarration
                .replace(/\\(?:text|mathbf|hat|bar|tilde|frac|sum|prod|int|sqrt)\{[^}]*\}/g, '')
                .replace(/\\[a-zA-Z]+\{[^}]*\}/g, '')
                .replace(/\{[^}]*\}/g, '')
                .replace(/[\\^_{}]/g, '')
                .replace(/\$[^$]*\$/g, '')  // inline math $...$
                .replace(/\s{2,}/g, ' ')
                .replace(/\s+([,.!?])/g, '$1')
                .trim();

              // v3.3.0: 수식 씬은 maxFormulaNarrationLength (60자) 적용
              const maxLen = BOOKS_PROJECT_CONFIG.maxFormulaNarrationLength;
              if (newNarration.length > maxLen) {
                // v3.2.2: 한국어 종결어미 포함 문장 분리 (마침표 없는 문장도 감지)
                const sentences = newNarration.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g) || [newNarration];
                let trimmed = '';
                for (const sentence of sentences) {
                  if ((trimmed + sentence).length > maxLen) break;
                  trimmed += sentence;
                }
                // v3.2.2: 첫 문장이 maxLen보다 길면 마지막 공백/쉼표에서 자르기
                if (trimmed === '') {
                  const cutPoint = Math.max(
                    newNarration.lastIndexOf(' ', maxLen),
                    newNarration.lastIndexOf(',', maxLen)
                  );
                  trimmed = newNarration.substring(0, cutPoint > 0 ? cutPoint : maxLen);
                }
                newNarration = trimmed;
              }

              sceneNarrations[i] = newNarration;
              logger.info({
                scene: i + 1,
                original: scene.narrationText.substring(0, 30),
                new: newNarration.substring(0, 30),
                formulaCount: selectedFormulas.length
              }, '수식 기반 나레이션 재생성');

              // v3.2.0: MathJax PNG 렌더링 (drawtext fallback 포함)
              // v12.2: Step 0 수식에도 변수 컬러 코딩 적용 (Gap 3 수정)
              const formulasWithText: MathFormula[] = selectedFormulas.map((latex, idx) => {
                const colorized = inputConfig?.useColorCodedVariables && inputConfig?.variableColors
                  ? colorizeLatex(latex, inputConfig.variableColors)
                  : latex;
                return {
                  id: `math_${Date.now()}_${i}_${idx}`,
                  originalText: latex,
                  latex: colorized,
                  description: '',
                  position: defaultMathPosition as 'center' | 'top' | 'bottom'
                };
              });

              const renderedFormulas = await this.mathService.renderFormulasForScene(
                formulasWithText, tempDir,
                { fillColor: inputConfig?.mathFillColor }
              );
              const validFormulas = renderedFormulas.filter(f => f.pngPath || f.displayText);
              if (validFormulas.length > 0) {
                sceneMathFormulas.set(i, validFormulas);
              }
            }
          } catch (error) {
            logger.warn({ error, sceneIndex: i }, '수식 처리 실패 - 스킵');
          }
        }

        logger.info({
          totalScenes: shortPlan.scenes.length,
          scenesWithMath: sceneMathFormulas.size
        }, 'Step 0 완료: 수식 선택 + 나레이션 정렬 (drawtext)');
      }

      // ============================================
      // Step 1: TTS 생성 (수식-정렬된 나레이션 사용)
      // ============================================
      const audioFiles: string[] = [];
      const sceneDurations: number[] = [];
      const allCaptions: Caption[] = [];
      let cumulativeTime = 0;

      // 전체 영상에서 동일한 voice 사용
      const selectedVoice = inputConfig?.ttsVoice
        ? { name: inputConfig.ttsVoice, gender: this.geminiTTS.getVoiceGender(inputConfig.ttsVoice) }
        : this.geminiTTS.getDefaultVoice(language, inputConfig?.ttsGender || 'female');
      const ttsStylePrompt = inputConfig?.ttsStylePrompt || '친구에게 설명하듯 따뜻하고 또박또박, 자연스럽게 이어서 읽어주세요';
      logger.info({ voice: selectedVoice.name, gender: selectedVoice.gender, language, ttsStylePrompt: ttsStylePrompt.substring(0, 30) }, 'TTS Voice 선택');

      // v3.3.0: 씬간 연결 접속사 (TTS 자연스러움 개선)
      const connectors = ['그리고', '다음으로', '이어서', '또', '그래서'];

      for (let i = 0; i < shortPlan.scenes.length; i++) {
        const scene = shortPlan.scenes[i];
        // v2.9.2: 수식 정렬된 나레이션 사용
        let narrationText = sceneNarrations[i];

        const hasMathFormula = sceneMathFormulas.has(i);
        const sceneType = scene.sceneType || '';

        // v3.3.0: 2번째 씬부터 자연스러운 연결어 prepend
        // - 첫 씬, 마지막 씬 제외
        // - 수식 씬(explanation + formula)은 connector 스킵 (수식 도입이 자체적으로 자연스러움)
        // - v13.1: disableConnectors=true 시 스킵 (AI가 이미 문맥 연결한 나레이션)
        if (!inputConfig?.disableConnectors && i > 0 && i < shortPlan.scenes.length - 1 && narrationText && narrationText.trim().length > 0) {
          if (!hasMathFormula) {
            narrationText = `${connectors[i % connectors.length]}, ${narrationText}`;
            sceneNarrations[i] = narrationText;
          }
        }

        // v3.5.2: 나레이션 길이 트리밍 제거
        // ContentPlannerService가 이미 적절한 길이로 생성하고,
        // 60초 총합 초과는 remainingTime으로 방어하므로 나레이션 자체를 자를 필요 없음
        // (이전 35자/60자 제한은 한국어 문장 중간 절단 → TTS 끊김 유발)

        if (!narrationText || narrationText.trim().length === 0) {
          logger.warn({ sceneIndex: i }, '빈 나레이션 - 무음 처리');
          const silentPath = path.join(tempDir, `audio_${i}.mp3`);
          await this.ffmpeg.generateSilentAudio(silentPath, 3);
          audioFiles.push(silentPath);
          sceneDurations.push(3);
          cumulativeTime += 3;
          continue;
        }

        // TTS 생성
        logger.info({ scene: i + 1, textLength: narrationText.length, language }, 'TTS 생성 중');

        const ttsResult = await this.geminiTTS.generate(
          narrationText,
          selectedVoice.name,
          {
            language,
            useNewsVoice: false,
            stylePrompt: ttsStylePrompt
          }
        );

        // v3.5.0: PCM→MP3 변환 (savePcmToMp3에서 PCM 레벨 0.1초 무음 패딩 포함)
        const audioPath = path.join(tempDir, `audio_${i}.mp3`);
        await this.ffmpeg.savePcmToMp3(ttsResult.audio, audioPath);

        // ffprobe로 실제 MP3 길이 측정 (0.1초 패딩 포함된 값)
        const mp3Duration = await this.ffmpeg.getAudioDuration(audioPath);
        // 실제 음성 길이 = MP3 전체 - 0.1초 패딩 (자막 싱크용)
        const ttsDuration = Math.max(mp3Duration - 0.1, 1);
        logger.debug({ scene: i + 1, pcmEstimate: ttsResult.audioLength, mp3Duration, speechDuration: ttsDuration }, 'TTS 실제 길이 측정');

        const isLastScene = (i === shortPlan.scenes.length - 1);

        // v3.5.2: 씬간 호흡 텀 (0.3초) — 크로스페이드 0.1초 감안 → 실질 0.2초 갭
        // 60초 하드캡 제거: 나레이션 절단보다 자연스러운 완결이 중요
        // 콘텐츠 길이는 ContentPlannerService에서 씬 수/나레이션 길이로 제어
        const SCENE_BREATH_SEC = 0.3;
        const minDur = inputConfig?.minSceneDuration || 0;
        const effectiveDuration = Math.max(
          isLastScene ? mp3Duration + 0.5 : mp3Duration + SCENE_BREATH_SEC,
          minDur,
        );

        let finalAudioPath = audioPath;

        // v3.5.2: 모든 씬에 무음 패딩 (씬간 호흡 + 마지막 씬 fadeout)
        const paddingNeeded = effectiveDuration - mp3Duration;
        if (paddingNeeded > 0.05) {
          const paddedPath = path.join(tempDir, `audio_padded_${i}.mp3`);
          const silencePath = path.join(tempDir, `silence_${i}.mp3`);
          await this.ffmpeg.generateSilentAudio(silencePath, paddingNeeded);
          await this.ffmpeg.concatAudios([audioPath, silencePath], paddedPath);
          finalAudioPath = paddedPath;
          logger.debug({ scene: i + 1, padding: paddingNeeded, isLastScene }, '씬 무음 패딩');
        }
        logger.debug({ scene: i + 1, ttsDuration, mp3Duration, effectiveDuration }, '씬 duration 결정');

        audioFiles.push(finalAudioPath);
        sceneDurations.push(effectiveDuration);

        // v3.5.2: 자막은 비디오 타임라인 기준 (crossfade 보정 불필요)
        // 비디오: scene[i] 시작 = sum(dur[0..i-1]) — 크로스페이드 없이 단순 concat
        // 오디오: 크로스페이드로 (N-1)×0.1초 짧아지지만, A/V sync padding(line 565-579)이 보정
        // 따라서 자막 = 비디오 타임라인 = cumulativeTime (보정 없음)

        // v3.2.4: 자막 타이밍은 실제 TTS 길이 기준 (씬 duration이 아닌 음성 길이)
        const captionDuration = Math.min(ttsDuration, effectiveDuration);
        const sceneCaptions = splitNarrationToCaptions(
          narrationText,
          captionDuration * 1000,
          cumulativeTime * 1000,
          { initialDelayMs: 100 }  // v3.5.2: Pro TTS는 startup 빠름 (기본 500ms → 100ms)
        );
        allCaptions.push(...sceneCaptions);

        cumulativeTime += effectiveDuration;

        logger.info({
          scene: i + 1,
          ttsDuration,
          effectiveDuration,
          captionCount: sceneCaptions.length,
        }, '씬 TTS 완료');
      }

      // ============================================
      // Step 2: 이미지 → 비디오 변환 (개별 처리 후 concat)
      // FIX: 8개 이미지를 한번에 concat하면 FFmpeg 필터 복잡도 문제 발생
      // 개별 scene 비디오 생성 → concat → 오디오+자막 합성
      // ============================================
      logger.info({ imageCount: imagePaths.length }, '이미지 → 비디오 변환 중 (개별 처리)');

      const orientation = inputConfig?.orientation || 'portrait';
      const dimensionStr = orientation === 'portrait'
        ? VIDEO_DIMENSIONS.PORTRAIT
        : VIDEO_DIMENSIONS.LANDSCAPE;

      // Step 2-1: 각 이미지를 개별 scene 비디오로 변환
      // v3.1.3: 수식이 있는 씬은 drawtext 오버레이 적용
      // v4.1: Ken Burns 이펙트 순환 (씬마다 다른 효과로 다양성 확보)
      const kenBurnsEffects = ['zoom_in', 'zoom_out', 'pan_right', 'pan_left'] as const;

      // v4.2: Circuit breaker — 첫 Grok 실패 시 나머지 씬 Ken Burns로 즉시 전환
      let grokDisabled = false;
      let grokSuccessCount = 0;
      let grokFailCount = 0;
      let grokTotalCost = 0;

      if (this.animationService && BOOKS_PROJECT_CONFIG.enableAnimation) {
        const hc = await this.animationService.healthCheck();
        if (!hc.available) {
          grokDisabled = true;
          logger.warn({ error: hc.error }, '[CircuitBreaker] Grok pre-flight 실패 → 전체 Ken Burns');
        }
      }

      const sceneVideoPaths: string[] = [];

      // ============================================
      // v11.0: VEO 3.1 Frame Interpolation 파이프라인
      //
      // 조건: useVeoInterpolation=true AND keyframePairs 배열이 존재
      //
      // VEO 분기 (if):
      //   키프레임 쌍 → VeoInterpolationNode.interpolate() → 8초 VEO 비디오
      //   → trimAndResizeVideo()로 씬 duration에 맞춤 → sceneVideoPath
      //   VEO 실패 시 → Ken Burns fallback (firstFrame 이미지 기반)
      //
      // 기존 분기 (else):
      //   imagePaths[i] → Manim/Grok/Ken Burns → sceneVideoPath (변경 없음)
      //
      // 두 분기 모두 sceneVideoPaths[]에 결과 추가 → Step 2-2에서 concat
      // ============================================
      const useVeoInterpolation = inputConfig?.useVeoInterpolation === true && input.keyframePairs && input.keyframePairs.length > 0;

      if (useVeoInterpolation && input.keyframePairs) {
        const { VeoInterpolationNode } = await import('./VeoInterpolationNode.js');
        const veoNode = new VeoInterpolationNode();
        let veoSuccessCount = 0;
        let veoFailCount = 0;
        let veoTotalCost = 0;

        logger.info({ pairCount: input.keyframePairs.length }, '[VEO] Frame interpolation pipeline start');

        for (let i = 0; i < input.keyframePairs.length; i++) {
          const sceneVideoPath = path.join(tempDir, `scene_${i}.mp4`);
          const pair = input.keyframePairs[i];
          const sceneFormulas = sceneMathFormulas.get(i);
          const kbEffect = kenBurnsEffects[i % kenBurnsEffects.length];

          // VEO interpolation
          const firstBuffer = await fs.readFile(pair.firstFramePath);
          const lastBuffer = await fs.readFile(pair.lastFramePath);

          const scene = shortPlan.scenes[i];
          const veoResult = await veoNode.interpolate({
            firstFrameBuffer: firstBuffer,
            lastFrameBuffer: lastBuffer,
            mimeType: 'image/png',
            motionPrompt: scene?.visualPrompt || `Scene ${i + 1} transition`,
            targetDuration: sceneDurations[i],
            orientation: orientation as 'portrait' | 'landscape',
          });

          if (veoResult.success && veoResult.videoPath) {
            veoSuccessCount++;
            veoTotalCost += veoResult.costEstimate || 0;

            // VEO 출력 → 트리밍 + 리사이즈
            const [w, h] = dimensionStr.split('x').map(Number);
            const trimmedPath = path.join(tempDir, `scene_${i}_trimmed.mp4`);
            await this.ffmpeg.trimAndResizeVideo(veoResult.videoPath, trimmedPath, sceneDurations[i], { width: w, height: h });

            // VEO 비디오를 최종 씬 비디오로 사용
            // 수식 씬인 경우에도 VEO가 비유적 시각화를 포함하므로 별도 overlay 불필요
            // (수식 PNG overlay는 Ken Burns fallback 시에만 적용)
            await fs.move(trimmedPath, sceneVideoPath, { overwrite: true });

            logger.info({ sceneIndex: i, duration: sceneDurations[i] }, `[VEO] Scene ${i + 1} VEO interpolation success`);
          } else {
            // VEO 실패 → Ken Burns fallback (firstFrame 이미지 기반)
            veoFailCount++;
            logger.warn({ sceneIndex: i, error: veoResult.error }, `[VEO] Scene ${i + 1} failed → Ken Burns fallback`);

            if (sceneFormulas && sceneFormulas.length > 0) {
              const formula = sceneFormulas[0];
              if (formula.pngPath && fs.existsSync(formula.pngPath)) {
                await this.ffmpeg.createKenBurnsVideoWithFormulaOverlay(
                  pair.firstFramePath, sceneVideoPath, sceneDurations[i], dimensionStr,
                  formula.pngPath, formula.pngWidth || 0, formula.pngHeight || 0,
                  (formula.position || defaultMathPosition) as 'center' | 'top' | 'bottom',
                  kbEffect
                );
              } else {
                await this.ffmpeg.createKenBurnsVideoFromImage(
                  pair.firstFramePath, sceneVideoPath, sceneDurations[i], dimensionStr, kbEffect
                );
              }
            } else {
              await this.ffmpeg.createKenBurnsVideoFromImage(
                pair.firstFramePath, sceneVideoPath, sceneDurations[i], dimensionStr, kbEffect
              );
            }
          }

          sceneVideoPaths.push(sceneVideoPath);
        }

        logger.info({
          veoSuccessCount,
          veoFailCount,
          totalCost: `$${veoTotalCost.toFixed(2)}`,
        }, '[VEO] Episode interpolation summary');

      } else {
      // ========== 기존 PIPELINE (Ken Burns/Grok/Manim) ==========

      for (let i = 0; i < imagePaths.length; i++) {
        const sceneVideoPath = path.join(tempDir, `scene_${i}.mp4`);
        const sceneFormulas = sceneMathFormulas.get(i);
        const kbEffect = kenBurnsEffects[i % kenBurnsEffects.length];

        if (sceneFormulas && sceneFormulas.length > 0) {
          // v4.1: 수식 씬 — Ken Burns 배경 + 수식 PNG overlay (배경 움직임, 수식 고정)
          const formula = sceneFormulas[0];

          if (formula.pngPath && fs.existsSync(formula.pngPath)) {
            const pngStat = fs.statSync(formula.pngPath);
            if (pngStat.size > 500) {
              try {
                await this.ffmpeg.createKenBurnsVideoWithFormulaOverlay(
                  imagePaths[i], sceneVideoPath, sceneDurations[i], dimensionStr,
                  formula.pngPath,
                  formula.pngWidth || 0,
                  formula.pngHeight || 0,
                  (formula.position || defaultMathPosition) as 'center' | 'top' | 'bottom',
                  kbEffect
                );
                logger.info({ sceneIndex: i, effect: kbEffect }, `Scene ${i + 1} Ken Burns + 수식 PNG overlay`);
              } catch (kbError) {
                // Ken Burns + formula 실패 → 기존 정적 overlay fallback
                logger.warn({ error: kbError, sceneIndex: i }, `Scene ${i + 1} Ken Burns+수식 실패 → 정적 fallback`);
                const formulaTexts = sceneFormulas
                  .filter(f => f.pngPath || f.displayText)
                  .map(f => ({
                    text: f.displayText || '',
                    position: (f.position || defaultMathPosition) as 'center' | 'top' | 'bottom',
                    pngPath: f.pngPath,
                    pngWidth: f.pngWidth,
                    pngHeight: f.pngHeight,
                  }));
                await this.ffmpeg.createStaticVideoWithFormulaOverlay(
                  imagePaths[i], sceneVideoPath, sceneDurations[i], dimensionStr, formulaTexts
                );
              }
            } else {
              // PNG 파일 크기 비정상 → drawtext fallback
              logger.warn({ pngPath: formula.pngPath, size: pngStat.size }, '📐 PNG 크기 비정상 → drawtext fallback');
              const formulaTexts = sceneFormulas
                .filter(f => f.pngPath || f.displayText)
                .map(f => ({
                  text: f.displayText || '',
                  position: (f.position || defaultMathPosition) as 'center' | 'top' | 'bottom',
                  pngPath: f.pngPath,
                  pngWidth: f.pngWidth,
                  pngHeight: f.pngHeight,
                }));
              await this.ffmpeg.createStaticVideoWithFormulaOverlay(
                imagePaths[i], sceneVideoPath, sceneDurations[i], dimensionStr, formulaTexts
              );
            }
          } else {
            // PNG 없음 → drawtext fallback (기존 로직 유지)
            const formulaTexts = sceneFormulas
              .filter(f => f.pngPath || f.displayText)
              .map(f => ({
                text: f.displayText || '',
                position: (f.position || defaultMathPosition) as 'center' | 'top' | 'bottom',
                pngPath: f.pngPath,
                pngWidth: f.pngWidth,
                pngHeight: f.pngHeight,
              }));
            await this.ffmpeg.createStaticVideoWithFormulaOverlay(
              imagePaths[i], sceneVideoPath, sceneDurations[i], dimensionStr, formulaTexts
            );
            logger.info({ sceneIndex: i, formulaCount: formulaTexts.length }, `Scene ${i + 1} 수식 drawtext fallback`);
          }

        // v13.0: inputConfig.enableAnimation으로 호출별 override 가능 (슬라이드 영상은 false)
        } else if (this.animationService && (inputConfig?.enableAnimation ?? BOOKS_PROJECT_CONFIG.enableAnimation) && !grokDisabled) {
          // v5.1: 씬 타입별 분기 — hook/conclusion만 Manim, 나머지 Grok/Ken Burns
          const scene = shortPlan.scenes[i];
          const sceneType = scene.sceneType || 'explanation';
          const isManimScene = (sceneType === 'hook' || sceneType === 'intro' || sceneType === 'conclusion');
          const useManimProvider = isManimScene
            && BOOKS_PROJECT_CONFIG.enableManim
            && this.animationService.isManimAvailable();

          if (useManimProvider) {
            // v5.1: Manim 올빼미 캐릭터 애니메이션 — hook/conclusion 전용 (무료)
            const manimRequest: ManimAnimationRequest = {
              imagePath: imagePaths[i],
              duration: sceneDurations[i],
              motionPrompt: this.buildMotionPrompt(scene),
              aspectRatio: '9:16',
              resolution: '720p',
              sceneType,
              narrationText: sceneNarrations[i],
              owlMode: this.getOwlMode(scene),
              backgroundImagePath: imagePaths[i],
            };

            const animResult = await this.animationService.animateScene(manimRequest);

            if (animResult.success && animResult.videoPath) {
              grokSuccessCount++;
              grokTotalCost += animResult.costEstimate || 0;
              const [w, h] = dimensionStr.split('x').map(Number);
              await this.ffmpeg.trimAndResizeVideo(animResult.videoPath, sceneVideoPath, sceneDurations[i], { width: w, height: h });
              await fs.remove(animResult.videoPath).catch(() => {});
              logger.info({ sceneIndex: i, sceneType, duration: sceneDurations[i], provider: animResult.provider }, `Scene ${i + 1} Manim 올빼미 애니메이션`);
            } else {
              // Manim 실패 → Ken Burns fallback
              logger.warn({ sceneIndex: i, error: animResult.error }, `Scene ${i + 1} Manim 실패 → Ken Burns fallback`);
              await this.ffmpeg.createKenBurnsVideoFromImage(
                imagePaths[i], sceneVideoPath, sceneDurations[i], dimensionStr, kbEffect
              );
            }
          } else {
            // v5.1: 비캐릭터 씬 (explanation/example/data 등) — Ken Burns 또는 Grok
            const motionPrompt = this.buildMotionPrompt(scene);
            const animResult = await this.animationService.animateScene({
              imagePath: imagePaths[i],
              duration: sceneDurations[i],
              motionPrompt,
              aspectRatio: '9:16',
              resolution: '720p',
            });

            if (animResult.success && animResult.videoPath) {
              grokSuccessCount++;
              grokTotalCost += animResult.costEstimate || 0;
              const [w, h] = dimensionStr.split('x').map(Number);
              await this.ffmpeg.trimAndResizeVideo(animResult.videoPath, sceneVideoPath, sceneDurations[i], { width: w, height: h });
              await fs.remove(animResult.videoPath).catch(() => {});
              logger.info({ sceneIndex: i, sceneType, duration: sceneDurations[i], provider: animResult.provider }, `Scene ${i + 1} Grok/Ken Burns 애니메이션`);
              // v5.2: Grok rate limit 방지 — 씬 간 5초 딜레이
              if (i < imagePaths.length - 1) {
                logger.debug('[Grok] 5s delay between scenes to avoid rate limit');
                await new Promise(resolve => setTimeout(resolve, 5000));
              }
            } else {
              grokFailCount++;
              if (!grokDisabled) {
                grokDisabled = true;
                logger.warn({
                  sceneIndex: i, error: animResult.error,
                  remainingScenes: imagePaths.length - i - 1,
                }, `[CircuitBreaker] Grok 비활성화 → Ken Burns fallback`);
              }
              await this.ffmpeg.createKenBurnsVideoFromImage(
                imagePaths[i], sceneVideoPath, sceneDurations[i], dimensionStr, kbEffect
              );
            }
          }
        } else {
          // v4.1: Educational/기타 씬 — Ken Burns (기존: 정적 → 변경: Ken Burns)
          await this.ffmpeg.createKenBurnsVideoFromImage(
            imagePaths[i],
            sceneVideoPath,
            sceneDurations[i],
            dimensionStr,
            kbEffect
          );
          logger.info({ sceneIndex: i, duration: sceneDurations[i], effect: kbEffect }, `Scene ${i + 1} Ken Burns 비디오 생성`);
        }

        sceneVideoPaths.push(sceneVideoPath);
      }

      // v5.0: 애니메이션 요약 로그
      if (this.animationService && BOOKS_PROJECT_CONFIG.enableAnimation) {
        logger.info({
          provider: BOOKS_PROJECT_CONFIG.animationProvider,
          successCount: grokSuccessCount,
          failCount: grokFailCount,
          disabled: grokDisabled,
          totalCost: `$${grokTotalCost.toFixed(2)}`,
        }, '[Animation] Episode animation summary');
      }

      } // end of else (기존 Ken Burns/Grok/Manim pipeline)

      // ============================================
      // Step 2.5: Hook Text Overlay (v12.0)
      // hookTextOverlay.enabled인 경우, 첫 번째 씬(hook)에 굵은 텍스트 오버레이
      // ============================================
      if (inputConfig?.hookTextOverlay?.enabled && shortPlan.hook && sceneVideoPaths.length > 0) {
        try {
          const overlayNode = new HookTextOverlayNode();
          const hookResult = await overlayNode.apply({
            inputPath: sceneVideoPaths[0],
            inputType: 'video',
            hookText: shortPlan.hook,
            config: {
              position: inputConfig.hookTextOverlay.position,
              fontSize: inputConfig.hookTextOverlay.fontSize,
              fontColor: inputConfig.hookTextOverlay.fontColor,
              strokeColor: inputConfig.hookTextOverlay.strokeColor,
              strokeWidth: inputConfig.hookTextOverlay.strokeWidth,
              backgroundColor: inputConfig.hookTextOverlay.backgroundColor,
              paddingX: inputConfig.hookTextOverlay.paddingX,
              paddingY: inputConfig.hookTextOverlay.paddingY,
            },
          });
          if (hookResult.success && hookResult.outputPath) {
            sceneVideoPaths[0] = hookResult.outputPath;
            logger.info({ hookText: shortPlan.hook.substring(0, 30) }, '[v12.0] Hook text overlay applied');
          } else {
            logger.warn({ error: hookResult.error }, '[v12.0] Hook text overlay failed — using original video');
          }
        } catch (overlayError) {
          logger.warn({ error: overlayError }, '[v12.0] Hook text overlay error — skipping');
        }
      }

      // Step 2-2: scene 비디오들을 concat
      // v13.1: useSceneTransitions → xfade 전환 (Cat 프로젝트 패턴), 기본=하드컷
      const tempVideoPath = path.join(tempDir, `temp_video.mp4`);
      if (inputConfig?.useSceneTransitions && sceneVideoPaths.length > 1) {
        await this.ffmpeg.concatVideosWithXfade(sceneVideoPaths, tempVideoPath, 0.3, 'fade');
      } else {
        await this.ffmpeg.concatVideos(sceneVideoPaths, tempVideoPath);
      }

      logger.info({ totalDuration: cumulativeTime, sceneCount: sceneVideoPaths.length }, '이미지 비디오 생성 완료 (개별 처리 + concat)');

      // ============================================
      // Step 3: 오디오 연결
      // ============================================
      let finalAudioPath: string;
      if (audioFiles.length > 1) {
        finalAudioPath = path.join(tempDir, `final_audio.mp3`);
        // v3.5.0: 크로스페이드 적용 (0.1초) → 씬간 여유있는 전환 (0.05→0.1)
        await this.ffmpeg.concatAudiosWithCrossfade(audioFiles, finalAudioPath, 0.1);
        logger.info({ audioCount: audioFiles.length }, '오디오 크로스페이드 연결 완료');
      } else {
        finalAudioPath = audioFiles[0];
      }

      // ============================================
      // Step 3.5: A/V 싱크 보정 (v3.3.1)
      // 크로스페이드로 오디오가 (N-1)×0.08초 짧아짐 → 무음 패딩으로 보정
      // ============================================
      const finalAudioDuration = await this.ffmpeg.getAudioDuration(finalAudioPath);
      const totalVideoDuration = sceneDurations.reduce((a, b) => a + b, 0);
      const durationGap = totalVideoDuration - finalAudioDuration;

      if (durationGap > 0.1) {
        const silencePath = path.join(tempDir, 'sync_silence.mp3');
        await this.ffmpeg.generateSilentAudio(silencePath, durationGap);
        const syncedPath = path.join(tempDir, 'final_audio_synced.mp3');
        await this.ffmpeg.concatAudios([finalAudioPath, silencePath], syncedPath);
        finalAudioPath = syncedPath;
        logger.info({ durationGap, finalAudioDuration, totalVideoDuration }, 'A/V 싱크 패딩 추가');
      }

      // ============================================
      // Step 4: 최종 합성 (비디오 + 오디오 + 자막)
      // ============================================
      const outputDir = path.join(this.config.videosDirPath, 'books');
      await fs.ensureDir(outputDir);
      const outputPath = path.join(outputDir, `${videoId}.mp4`);

      const orientationEnum = orientation === 'portrait'
        ? OrientationEnum.portrait
        : OrientationEnum.landscape;

      // 자막 위치 설정 (Books 프로젝트 기본값 사용)
      const subtitleConfig = {
        yPosition: inputConfig?.subtitleYPosition || BOOKS_PROJECT_CONFIG.subtitleYPosition
      };

      logger.info({
        captionCount: allCaptions.length,
        totalDuration: cumulativeTime,
        subtitleYPosition: subtitleConfig.yPosition,
      }, '최종 합성 시작');

      await this.ffmpeg.combineVideoWithAudioAndCaptions(
        tempVideoPath,
        finalAudioPath,
        allCaptions,
        outputPath,
        cumulativeTime,
        orientationEnum,
        { orientation: orientationEnum },
        false,  // 자막 활성화
        undefined,  // 씬 오버레이 없음
        undefined,  // 폰트 설정 기본값
        subtitleConfig
      );

      // 임시 파일 정리
      await fs.remove(tempDir);

      logger.info({
        videoId,
        outputPath,
        duration: cumulativeTime,
        sceneCount: shortPlan.scenes.length,
        captionCount: allCaptions.length,
      }, 'Books Short 비디오 생성 완료');

      // v2.7.0: 수식 통계 계산
      let totalMathFormulas = 0;
      sceneMathFormulas.forEach(formulas => {
        totalMathFormulas += formulas.length;
      });

      return {
        success: true,
        videoId,
        videoPath: outputPath,
        duration: cumulativeTime,
        details: {
          sceneCount: shortPlan.scenes.length,
          totalTtsDuration: cumulativeTime,
          captionCount: allCaptions.length,
          mathFormulaCount: totalMathFormulas,
          scenesWithMath: sceneMathFormulas.size,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, videoId }, 'Books Short 비디오 생성 실패');

      // 임시 파일 정리 시도
      try {
        await fs.remove(tempDir);
      } catch { /* ignore */ }

      return {
        success: false,
        videoId,
        error: errorMessage,
      };
    }
  }

  /**
   * v4.0: 씬 타입별 모션 프롬프트 생성
   * - narrative (hook/intro/conclusion): 캐릭터 미세 움직임, 카메라 팬
   * - educational (explanation/example): 다이어그램 줌인, 패럴랙스
   * - formula: 수식 파티클 이펙트, 부드러운 글로우
   */
  private buildMotionPrompt(scene: ScenePlan): string {
    const sceneType = scene.sceneType || 'explanation';

    switch (sceneType) {
      case 'hook':
      case 'intro':
      case 'conclusion':
        return 'Gentle camera pan, character hair flowing in breeze, soft ambient movement, lo-fi animation style';
      case 'explanation':
      case 'example':
      case 'data':
      case 'comparison':
        return 'Slow zoom into diagram, subtle element highlights, gentle parallax effect, educational animation';
      default:
        // formula 등
        if (scene.assignedFormula) {
          return 'Ethereal particle effects, mathematical symbols floating gently, soft glow, calm abstract motion';
        }
        return 'Gentle camera pan, subtle ambient movement, soft parallax, lo-fi animation style';
    }
  }

  /**
   * v5.0: 씬 타입에서 올빼미 표정 모드 결정
   * - hook/intro → surprised (호기심 유발)
   * - formula (assignedFormula 있음) → thinking → pointing
   * - explanation/example → neutral
   * - conclusion → happy
   */
  private getOwlMode(scene: ScenePlan): 'neutral' | 'thinking' | 'surprised' | 'pointing' | 'happy' {
    const sceneType = scene.sceneType || 'explanation';

    if (sceneType === 'hook' || sceneType === 'intro') return 'surprised';
    if (sceneType === 'conclusion' || sceneType === 'cta') return 'happy';

    // 수식 씬
    if (scene.assignedFormula) return 'pointing';

    // 교육/설명 씬
    return 'neutral';
  }

  /**
   * 테스트용: 간단한 이미지+TTS 조합 테스트
   */
  async testImageTTSCombination(
    images: Array<{ path: string; narration: string }>,
    outputPath?: string,
    config?: BooksVideoInput['config']
  ): Promise<BooksVideoResult> {
    await this.ensureInitialized();

    const videoId = `test_${cuid.slug()}`;

    // ShortPlan 형태로 변환
    const shortPlan: ShortPlan = {
      shortIndex: 0,
      title: 'Test Video',
      hook: '',
      theme: 'test',
      scenes: images.map((img, i) => ({
        sceneIndex: i,
        sceneType: 'explanation' as const,
        narrationText: img.narration,
        visualPrompt: '',
        durationHint: 5,
        sourceChunkIds: [],
      })),
      totalDuration: images.length * 5,
      tags: ['test'],
    };

    const result = await this.createShortVideo({
      bookId: 'test',
      shortPlan,
      imagePaths: images.map(img => img.path),
      config,
    });

    // 지정된 출력 경로로 이동
    if (result.success && result.videoPath && outputPath) {
      await fs.ensureDir(path.dirname(outputPath));
      await fs.move(result.videoPath, outputPath, { overwrite: true });
      result.videoPath = outputPath;
    }

    return result;
  }
}

// ============================================
// Factory
// ============================================

let serviceInstance: BooksVideoService | null = null;

export function getBooksVideoService(): BooksVideoService {
  if (!serviceInstance) {
    serviceInstance = new BooksVideoService();
  }
  return serviceInstance;
}

export default BooksVideoService;
