/**
 * BooksVideoService
 * 책 → Shorts 비디오 생성 서비스
 *
 * 기능:
 * - 정적 이미지 + TTS 조합으로 비디오 생성
 * - GPT-to-NanoBanana 이미지 결과 활용
 * - GeminiTTS로 나레이션 생성
 * - 한국어 자막 자동 생성
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

// ============================================
// Types
// ============================================

export interface BooksVideoInput {
  /** 책 ID (추적용) */
  bookId: string;
  /** Short 계획 (narration, visualPrompt 포함) */
  shortPlan: ShortPlan;
  /** 이미지 경로 배열 (GPT-to-NanoBanana 결과) - scenes 순서와 일치 */
  imagePaths: string[];
  /** 설정 */
  config?: {
    orientation?: 'portrait' | 'landscape';
    ttsVoice?: string;
    ttsGender?: 'female' | 'male';
    subtitleYPosition?: string;
  };
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
  };
}

// ============================================
// Service
// ============================================

export class BooksVideoService {
  private config: Config;
  private ffmpeg!: FFMpeg;
  private geminiTTS?: GeminiTTS;
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
    }, '📚 Books Short 비디오 생성 시작');

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

      // ============================================
      // Step 1: TTS 생성 (각 씬별)
      // ============================================
      const audioFiles: string[] = [];
      const sceneDurations: number[] = [];
      const allCaptions: Caption[] = [];
      let cumulativeTime = 0;

      // 전체 영상에서 동일한 voice 사용
      // 🔥 inputConfig.ttsVoice가 지정되면 해당 voice 사용, 아니면 기본 Kore (한국어 최적화)
      const selectedVoice = inputConfig?.ttsVoice
        ? { name: inputConfig.ttsVoice, gender: this.geminiTTS.getVoiceGender(inputConfig.ttsVoice) }
        : { name: 'Kore', gender: 'female' as const };  // 한국어에 가장 안정적인 voice
      logger.info({ voice: selectedVoice.name, gender: selectedVoice.gender }, '🎙️ TTS Voice 선택');

      for (let i = 0; i < shortPlan.scenes.length; i++) {
        const scene = shortPlan.scenes[i];
        const narrationText = scene.narrationText;

        if (!narrationText || narrationText.trim().length === 0) {
          logger.warn({ sceneIndex: i }, '⚠️ 빈 나레이션 - 무음 처리');
          // 무음 오디오 생성 (3초)
          const silentPath = path.join(tempDir, `audio_${i}.mp3`);
          await this.ffmpeg.generateSilentAudio(silentPath, 3);
          audioFiles.push(silentPath);
          sceneDurations.push(3);
          cumulativeTime += 3;
          continue;
        }

        // TTS 생성
        logger.info({ scene: i + 1, textLength: narrationText.length }, '🔊 TTS 생성 중');

        const ttsResult = await this.geminiTTS.generate(
          narrationText,
          selectedVoice.name,
          { useNewsVoice: false }
        );

        // PCM → MP3 변환
        const audioPath = path.join(tempDir, `audio_${i}.mp3`);
        await this.ffmpeg.savePcmToMp3(ttsResult.audio, audioPath);

        // Duration 결정: TTS 길이와 hint 중 큰 값
        const ttsDuration = ttsResult.audioLength;
        const hintDuration = scene.durationHint || 5;
        const effectiveDuration = Math.max(ttsDuration, hintDuration);

        // TTS가 hint보다 짧으면 무음 패딩
        let finalAudioPath = audioPath;
        if (ttsDuration < hintDuration) {
          const paddedPath = path.join(tempDir, `audio_padded_${i}.mp3`);
          const silencePath = path.join(tempDir, `silence_${i}.mp3`);
          await this.ffmpeg.generateSilentAudio(silencePath, hintDuration - ttsDuration);
          await this.ffmpeg.concatAudios([audioPath, silencePath], paddedPath);
          finalAudioPath = paddedPath;
          logger.debug({ scene: i + 1, padding: hintDuration - ttsDuration }, '🔇 무음 패딩 추가');
        }

        audioFiles.push(finalAudioPath);
        sceneDurations.push(effectiveDuration);

        // 자막 생성
        const sceneCaptions = splitNarrationToCaptions(
          narrationText,
          effectiveDuration * 1000,  // 밀리초
          cumulativeTime * 1000
        );
        allCaptions.push(...sceneCaptions);

        cumulativeTime += effectiveDuration;

        logger.info({
          scene: i + 1,
          ttsDuration,
          effectiveDuration,
          captionCount: sceneCaptions.length,
        }, '✅ 씬 TTS 완료');
      }

      // ============================================
      // Step 2: 이미지 → 비디오 변환
      // ============================================
      logger.info({ imageCount: imagePaths.length }, '🖼️ 이미지 → 비디오 변환 중');

      const orientation = inputConfig?.orientation || 'portrait';
      const dimensionStr = orientation === 'portrait'
        ? VIDEO_DIMENSIONS.PORTRAIT
        : VIDEO_DIMENSIONS.LANDSCAPE;

      // 이미지 데이터 준비 (각 이미지의 duration)
      const imageDataList = imagePaths.map((imagePath, i) => ({
        imagePath,
        duration: sceneDurations[i],
      }));

      const tempVideoPath = path.join(tempDir, `temp_video.mp4`);
      await this.ffmpeg.createStaticVideoFromMultipleImages(
        imageDataList,
        tempVideoPath,
        dimensionStr
      );

      logger.info({ totalDuration: cumulativeTime }, '✅ 이미지 비디오 생성 완료');

      // ============================================
      // Step 3: 오디오 연결
      // ============================================
      let finalAudioPath: string;
      if (audioFiles.length > 1) {
        finalAudioPath = path.join(tempDir, `final_audio.mp3`);
        await this.ffmpeg.concatAudios(audioFiles, finalAudioPath);
        logger.info({ audioCount: audioFiles.length }, '✅ 오디오 연결 완료');
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

      // 자막 위치 설정 (기본: 하단)
      const subtitleConfig = inputConfig?.subtitleYPosition
        ? { yPosition: inputConfig.subtitleYPosition }
        : { yPosition: 'h*0.75' };  // 하단 기본값

      logger.info({
        captionCount: allCaptions.length,
        totalDuration: cumulativeTime,
        subtitleYPosition: subtitleConfig.yPosition,
      }, '🎬 최종 합성 시작');

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
      }, '✅ Books Short 비디오 생성 완료');

      return {
        success: true,
        videoId,
        videoPath: outputPath,
        duration: cumulativeTime,
        details: {
          sceneCount: shortPlan.scenes.length,
          totalTtsDuration: cumulativeTime,
          captionCount: allCaptions.length,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, videoId }, '❌ Books Short 비디오 생성 실패');

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
