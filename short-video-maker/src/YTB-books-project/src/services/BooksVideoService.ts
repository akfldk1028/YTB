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
  /** v3.2.5: 씬당 나레이션 최대 글자수 (한국어 TTS ~4자/초 → 24자=6초, 여유 포함) */
  maxNarrationLength: 24,
  /** v3.2.5: 씬당 최대 초 — TTS 길이 우선, 이 값은 TTS 없는 씬의 fallback */
  maxSceneDuration: 8,
} as const;

export interface BooksVideoConfig {
  orientation?: 'portrait' | 'landscape';
  /** 콘텐츠 언어 - TTS voice 자동 선택에 사용 */
  language?: 'ko' | 'en';
  ttsVoice?: string;
  ttsGender?: 'female' | 'male';
  subtitleYPosition?: string;
  /** v2.7.0: 수학 수식 감지 및 렌더링 활성화 (기본: false, v2.9.1) */
  enableMathFormulas?: boolean;
  /** v2.7.0: 수식 위치 (기본: bottom) */
  mathFormulaPosition?: 'center' | 'top' | 'bottom';
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
          model: 'gemini-2.5-flash-preview-tts',  // 빠른 응답용
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

              // v3.2.2: 수식 씬은 설명이 핵심이므로 길이 제한 완화 (50→100자)
              const maxLen = Math.max(BOOKS_PROJECT_CONFIG.maxNarrationLength * 2, 70);
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
              const formulasWithText: MathFormula[] = selectedFormulas.map((latex, idx) => ({
                id: `math_${Date.now()}_${i}_${idx}`,
                originalText: latex,
                latex: latex,
                description: '',
                position: defaultMathPosition as 'center' | 'top' | 'bottom'
              }));

              const renderedFormulas = await this.mathService.renderFormulasForScene(formulasWithText, tempDir);
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
      logger.info({ voice: selectedVoice.name, gender: selectedVoice.gender, language }, 'TTS Voice 선택');

      for (let i = 0; i < shortPlan.scenes.length; i++) {
        const scene = shortPlan.scenes[i];
        // v2.9.2: 수식 정렬된 나레이션 사용
        let narrationText = sceneNarrations[i];

        // v3.2.5: 수식 씬은 설명이 핵심이므로 길이 제한 완화
        const hasMathFormula = sceneMathFormulas.has(i);
        const maxLen = hasMathFormula
          ? Math.max(BOOKS_PROJECT_CONFIG.maxNarrationLength * 2, 48)  // 수식 씬: 48자 (TTS ~10초)
          : BOOKS_PROJECT_CONFIG.maxNarrationLength;                    // 일반 씬: 24자 (TTS ~6초)
        if (narrationText && narrationText.length > maxLen) {
          // v3.2.2: 한국어 종결어미 포함 문장 분리 (마침표 없는 문장도 감지)
          const sentences = narrationText.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g) || [narrationText];
          let trimmed = '';
          for (const sentence of sentences) {
            if ((trimmed + sentence).length > maxLen) break;
            trimmed += sentence;
          }
          // v3.2.2: 첫 문장이 maxLen보다 길면 마지막 공백/쉼표에서 자르기
          if (trimmed === '') {
            const cutPoint = Math.max(
              narrationText.lastIndexOf(' ', maxLen),
              narrationText.lastIndexOf(',', maxLen)
            );
            trimmed = narrationText.substring(0, cutPoint > 0 ? cutPoint : maxLen);
          }
          narrationText = trimmed;
          sceneNarrations[i] = narrationText;
          logger.debug({ scene: i + 1, length: narrationText.length, maxLen }, '나레이션 길이 제한 적용');
        }

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
            // v3.2.5: 교육 콘텐츠 톤 — 친근하고 또박또박, 자연스러운 흐름
            stylePrompt: '친구에게 설명하듯 따뜻하고 또박또박, 자연스럽게 이어서 읽어주세요'
          }
        );

        // v3.2.5: PCM→MP3 변환 (savePcmToMp3에서 PCM 레벨 0.5초 무음 패딩 포함)
        // MP3 concat 패딩 방식 폐기 — PCM 단일 인코딩으로 LAME 경계 손실 제거
        const audioPath = path.join(tempDir, `audio_${i}.mp3`);
        await this.ffmpeg.savePcmToMp3(ttsResult.audio, audioPath);

        // ffprobe로 실제 MP3 길이 측정 (0.5초 패딩 포함된 값)
        const mp3Duration = await this.ffmpeg.getAudioDuration(audioPath);
        // 실제 음성 길이 = MP3 전체 - 0.5초 패딩 (자막 싱크용)
        const ttsDuration = Math.max(mp3Duration - 0.5, 1);
        logger.debug({ scene: i + 1, pcmEstimate: ttsResult.audioLength, mp3Duration, speechDuration: ttsDuration }, 'TTS 실제 길이 측정');

        const hintDuration = scene.durationHint || 5;
        const isLastScene = (i === shortPlan.scenes.length - 1);
        const remainingTime = 60 - cumulativeTime;

        // 씬 duration = MP3 전체 길이 (패딩 포함) 기준으로 결정
        const effectiveDuration = Math.min(
          Math.max(mp3Duration, hintDuration),
          remainingTime
        );

        // MP3 concat 불필요 — savePcmToMp3에서 이미 패딩됨
        let finalAudioPath = audioPath;

        if (mp3Duration < hintDuration) {
          // TTS가 hint보다 짧으면 무음 패딩
          const paddedPath = path.join(tempDir, `audio_padded_${i}.mp3`);
          const silencePath = path.join(tempDir, `silence_${i}.mp3`);
          await this.ffmpeg.generateSilentAudio(silencePath, hintDuration - mp3Duration);
          await this.ffmpeg.concatAudios([audioPath, silencePath], paddedPath);
          finalAudioPath = paddedPath;
          logger.debug({ scene: i + 1, padding: hintDuration - mp3Duration }, '무음 패딩 추가');
        }
        logger.debug({ scene: i + 1, ttsDuration, mp3Duration, hintDuration, effectiveDuration, remainingTime }, '씬 duration 결정');

        audioFiles.push(finalAudioPath);
        sceneDurations.push(effectiveDuration);

        // v3.2.4: 자막 타이밍은 실제 TTS 길이 기준 (씬 duration이 아닌 음성 길이)
        // effectiveDuration은 씬 전체 시간(이미지 표시), ttsDuration은 실제 음성 길이
        // 자막은 음성과 싱크해야 하므로 min(ttsDuration, effectiveDuration) 사용
        const captionDuration = Math.min(ttsDuration, effectiveDuration);
        const sceneCaptions = splitNarrationToCaptions(
          narrationText,
          captionDuration * 1000,
          cumulativeTime * 1000
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
      const sceneVideoPaths: string[] = [];
      for (let i = 0; i < imagePaths.length; i++) {
        const sceneVideoPath = path.join(tempDir, `scene_${i}.mp4`);
        const sceneFormulas = sceneMathFormulas.get(i);

        if (sceneFormulas && sceneFormulas.length > 0) {
          // v3.2.0: pngPath로 PNG overlay, 없으면 displayText drawtext fallback
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
            imagePaths[i],
            sceneVideoPath,
            sceneDurations[i],
            dimensionStr,
            formulaTexts
          );
          logger.info({ sceneIndex: i, formulaCount: formulaTexts.length }, `Scene ${i + 1} 비디오 생성 (수식 drawtext)`);
        } else {
          // 일반 scene
          await this.ffmpeg.createStaticVideoFromImage(
            imagePaths[i],
            sceneVideoPath,
            sceneDurations[i],
            dimensionStr
          );
          logger.debug({ sceneIndex: i, duration: sceneDurations[i] }, `Scene ${i + 1} 비디오 생성`);
        }

        sceneVideoPaths.push(sceneVideoPath);
      }

      // Step 2-2: scene 비디오들을 concat (stream copy로 빠르게)
      const tempVideoPath = path.join(tempDir, `temp_video.mp4`);
      await this.ffmpeg.concatVideos(sceneVideoPaths, tempVideoPath);

      logger.info({ totalDuration: cumulativeTime, sceneCount: sceneVideoPaths.length }, '이미지 비디오 생성 완료 (개별 처리 + concat)');

      // ============================================
      // Step 3: 오디오 연결
      // ============================================
      let finalAudioPath: string;
      if (audioFiles.length > 1) {
        finalAudioPath = path.join(tempDir, `final_audio.mp3`);
        await this.ffmpeg.concatAudios(audioFiles, finalAudioPath);
        logger.info({ audioCount: audioFiles.length }, '오디오 연결 완료');
      } else {
        finalAudioPath = audioFiles[0];
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
