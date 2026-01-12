/**
 * NewsProjectService - News 숏츠 생성 서비스
 *
 * 원칙:
 * - YTB-ffmpeg 모듈 직접 사용 (독립적)
 * - ImageGenerationService 직접 사용 (Nano Banana)
 * - YTB-tts 모듈 사용 (ElevenLabs / Google 선택 가능)
 */

import cuid from 'cuid';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../logger';

// 🔥 YTB-ffmpeg 모듈 (독립 사용 가능)
import { FFMpeg } from '../YTB-ffmpeg';
import { VIDEO_DIMENSIONS } from '../short-creator/utils/Constants';
import { OrientationEnum } from '../types/shorts';

// 🔥 이미지 생성 서비스
import { ImageGenerationService } from '../image-generation/services/ImageGenerationService';
import { ImageModelType } from '../image-generation/models/imageModels';

// 🔥 YTB-tts 모듈 (ElevenLabs / Google 자유자재로 선택)
import { ElevenLabsTTS, GoogleTTS } from '../YTB-tts';
import { Config } from '../config';

// 타입
import type {
  NewsPayload,
  NewsVideoResult,
  VideoStatus,
  Caption,
} from './types';

/**
 * 처리 상태
 */
interface ProcessingState {
  videoId: string;
  status: VideoStatus;
  progress: { current: number; total: number; step: string };
  result?: NewsVideoResult;
  error?: string;
}

/**
 * NewsProjectService
 */
export class NewsProjectService {
  private config: Config;
  private ffmpeg!: FFMpeg;
  private imageService!: ImageGenerationService;
  private elevenLabsTTS?: ElevenLabsTTS;
  private googleTTS?: GoogleTTS;
  private states = new Map<string, ProcessingState>();
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

    // 이미지 생성 서비스 초기화
    if (!this.config.googleGeminiApiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY is required for image generation');
    }
    this.imageService = new ImageGenerationService(
      this.config.googleGeminiApiKey,
      ImageModelType.NANO_BANANA,
      this.config.tempDirPath
    );

    // 🔥 TTS 서비스 초기화 (필요할 때 lazy init)
    // ElevenLabs (기본)
    if (this.config.elevenLabsApiKey) {
      this.elevenLabsTTS = new ElevenLabsTTS({
        apiKey: this.config.elevenLabsApiKey,
      });
      logger.info('[NewsProject] ElevenLabs TTS 사용 가능');
    }

    // Google TTS (옵션)
    try {
      this.googleTTS = new GoogleTTS();
      logger.info('[NewsProject] Google TTS 사용 가능');
    } catch {
      logger.info('[NewsProject] Google TTS 사용 불가 (credentials 없음)');
    }

    this.initialized = true;
    logger.info('[NewsProject] 서비스 초기화 완료');
  }

  /**
   * 비디오 생성 요청
   */
  async createVideo(
    payload: NewsPayload | NewsPayload[],
    options?: { callbackUrl?: string }
  ): Promise<{ videoId: string; status: VideoStatus }> {
    await this.ensureInitialized();

    const data = Array.isArray(payload) ? payload[0] : payload;
    const video = data.videos[0];
    const videoId = `news_${video.video_id}_${cuid()}`;

    // 상태 초기화
    this.states.set(videoId, {
      videoId,
      status: 'pending',
      progress: { current: 0, total: video.scenes.length * 2 + 2, step: '시작' },
    });

    // 비동기 처리 시작
    this.processAsync(videoId, data, options?.callbackUrl);

    return { videoId, status: 'pending' };
  }

  /**
   * 상태 조회
   */
  getStatus(videoId: string): ProcessingState | null {
    return this.states.get(videoId) || null;
  }

  /**
   * 비동기 처리
   */
  private async processAsync(
    videoId: string,
    payload: NewsPayload,
    callbackUrl?: string
  ): Promise<void> {
    const video = payload.videos[0];
    const config = payload.global_config;
    const tempDir = path.join(this.config.tempDirPath, videoId);

    // TTS Provider 선택
    const ttsProvider = config.audio.tts_provider || 'elevenlabs';
    logger.info({ ttsProvider, voice: config.audio.voice, rawProvider: config.audio.tts_provider }, '[NewsProject] TTS Provider 선택됨');

    try {
      await fs.ensureDir(tempDir);
      this.updateState(videoId, 'processing', '이미지 생성 중');

      // ============================================
      // Step 1: 이미지 생성 (Nano Banana)
      // ============================================
      const aspectRatio = config.video.orientation === 'portrait' ? '9:16' : '16:9';
      const imageDataList: { imagePath: string; duration: number }[] = [];

      for (let i = 0; i < video.scenes.length; i++) {
        const scene = video.scenes[i];
        this.updateState(videoId, 'processing', `이미지 생성 ${i + 1}/${video.scenes.length}`);

        const result = await this.imageService.generateImages(
          {
            prompt: this.enhancePrompt(scene.image_prompt, config.nanoBanana?.defaultStyle),
            numberOfImages: 1,
            aspectRatio: aspectRatio as '9:16' | '16:9',
          },
          videoId,
          i
        );

        if (!result.success || !result.images?.[0]) {
          throw new Error(`이미지 생성 실패: scene ${i + 1}`);
        }

        const imagePath = path.join(tempDir, `scene_${i}.png`);
        await fs.writeFile(imagePath, result.images[0].data);

        imageDataList.push({
          imagePath,
          duration: scene.duration,
        });

        logger.info({ scene: i + 1 }, '✅ 이미지 생성 완료');
      }

      // ============================================
      // Step 2: TTS 생성 (YTB-tts 모듈)
      // ============================================
      this.updateState(videoId, 'processing', `음성 생성 중 (${ttsProvider})`);

      const audioFiles: string[] = [];
      const allCaptions: Caption[] = [];
      let cumulativeTime = 0;

      for (let i = 0; i < video.scenes.length; i++) {
        const scene = video.scenes[i];
        this.updateState(videoId, 'processing', `음성 생성 ${i + 1}/${video.scenes.length}`);

        const audioPath = path.join(tempDir, `audio_${i}.mp3`);
        let audioDuration: number;

        if (ttsProvider === 'elevenlabs' && this.elevenLabsTTS) {
          // 🔥 ElevenLabs TTS (alignment 포함)
          const ttsResult = await this.elevenLabsTTS.generate(
            scene.narration,
            config.audio.voice
          );

          // 오디오 저장
          const audioBuffer = Buffer.from(ttsResult.audio);
          await fs.writeFile(audioPath, audioBuffer);
          audioDuration = ttsResult.audioLength;

          // 자막 추출 (alignment 있을 때)
          if (ttsResult.alignment) {
            const words = this.extractWordsFromAlignment(ttsResult.alignment);
            for (const word of words) {
              allCaptions.push({
                text: word.text,
                startMs: word.startMs + cumulativeTime * 1000,
                endMs: word.endMs + cumulativeTime * 1000,
              });
            }
          }
        } else if (ttsProvider === 'google' && this.googleTTS) {
          // 🔥 Google TTS (alignment 없음 - 추후 Whisper STT로 자막 추출 가능)
          const ttsResult = await this.googleTTS.generate(
            scene.narration,
            config.audio.voice
          );

          const audioBuffer = Buffer.from(ttsResult.audio);
          await fs.writeFile(audioPath, audioBuffer);
          audioDuration = ttsResult.audioLength;

          // Google TTS는 alignment 없음 - 전체 텍스트를 하나의 자막으로
          allCaptions.push({
            text: scene.narration,
            startMs: cumulativeTime * 1000,
            endMs: (cumulativeTime + audioDuration) * 1000,
          });

          logger.warn('[NewsProject] Google TTS는 word-level 자막 미지원');
        } else {
          throw new Error(`TTS provider not available: ${ttsProvider}`);
        }

        audioFiles.push(audioPath);
        imageDataList[i].duration = audioDuration;
        cumulativeTime += audioDuration;

        logger.info({ scene: i + 1, duration: audioDuration, provider: ttsProvider }, '✅ 음성 생성 완료');
      }

      // ============================================
      // Step 3: 비디오 합성 (FFMpeg)
      // ============================================
      this.updateState(videoId, 'processing', '비디오 합성 중');

      const dimensions = config.video.orientation === 'portrait'
        ? VIDEO_DIMENSIONS.PORTRAIT
        : VIDEO_DIMENSIONS.LANDSCAPE;

      const tempVideoPath = path.join(tempDir, `temp_${videoId}.mp4`);

      // 🔥 YTB-ffmpeg 모듈 사용: 이미지 → 비디오
      await this.ffmpeg.createStaticVideoFromMultipleImages(
        imageDataList,
        tempVideoPath,
        dimensions
      );

      logger.info('✅ 정적 비디오 생성 완료');

      // ============================================
      // Step 4: 오디오 + 자막 합성
      // ============================================
      this.updateState(videoId, 'processing', '최종 합성 중');

      // 오디오 연결
      let finalAudioPath: string;
      if (audioFiles.length > 1) {
        finalAudioPath = path.join(tempDir, `audio_${videoId}.mp3`);
        await this.ffmpeg.concatAudios(audioFiles, finalAudioPath);
      } else {
        finalAudioPath = audioFiles[0];
      }

      const totalDuration = cumulativeTime;
      const outputPath = path.join(this.config.videosDirPath, `${videoId}.mp4`);
      await fs.ensureDir(this.config.videosDirPath);

      // 🔥 YTB-ffmpeg 모듈 사용: 비디오 + 오디오 + 자막
      const orientationEnum = config.video.orientation === 'portrait'
        ? OrientationEnum.portrait
        : OrientationEnum.landscape;

      await this.ffmpeg.combineVideoWithAudioAndCaptions(
        tempVideoPath,
        finalAudioPath,
        allCaptions,
        outputPath,
        totalDuration,
        orientationEnum,
        { orientation: orientationEnum },
        false // 자막 활성화
      );

      logger.info({ outputPath, totalDuration }, '✅ 최종 비디오 생성 완료');

      // 임시 파일 정리
      await fs.remove(tempDir);

      // ============================================
      // 완료
      // ============================================
      const result: NewsVideoResult = {
        videoId,
        status: 'completed',
        outputPath,
        duration: totalDuration,
      };

      const state = this.states.get(videoId);
      if (state) {
        state.status = 'completed';
        state.result = result;
        state.progress.step = '완료';
        state.progress.current = state.progress.total;
      }

      logger.info({ videoId, ttsProvider }, '🎉 News 비디오 생성 완료');

      // 콜백
      if (callbackUrl) {
        await this.sendCallback(callbackUrl, { videoId, status: 'completed', result });
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ videoId, error: errorMsg }, '❌ 에러 발생');

      const state = this.states.get(videoId);
      if (state) {
        state.status = 'error';
        state.error = errorMsg;
        state.progress.step = `에러: ${errorMsg}`;
      }

      if (callbackUrl) {
        await this.sendCallback(callbackUrl, { videoId, status: 'error', error: errorMsg });
      }
    }
  }

  /**
   * ElevenLabs alignment에서 단어 추출
   */
  private extractWordsFromAlignment(alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  }): Array<{ text: string; startMs: number; endMs: number }> {
    const words: Array<{ text: string; startMs: number; endMs: number }> = [];

    let currentWord = '';
    let wordStart = 0;
    let wordEnd = 0;

    for (let i = 0; i < alignment.characters.length; i++) {
      const char = alignment.characters[i];
      const startTime = alignment.character_start_times_seconds[i];
      const endTime = alignment.character_end_times_seconds[i];

      if (char === ' ' || char === '\n') {
        if (currentWord) {
          words.push({
            text: currentWord,
            startMs: wordStart * 1000,
            endMs: wordEnd * 1000,
          });
          currentWord = '';
        }
      } else {
        if (!currentWord) {
          wordStart = startTime;
        }
        currentWord += char;
        wordEnd = endTime;
      }
    }

    // 마지막 단어
    if (currentWord) {
      words.push({
        text: currentWord,
        startMs: wordStart * 1000,
        endMs: wordEnd * 1000,
      });
    }

    return words;
  }

  /**
   * 상태 업데이트
   */
  private updateState(videoId: string, status: VideoStatus, step: string): void {
    const state = this.states.get(videoId);
    if (state) {
      state.status = status;
      state.progress.step = step;
      state.progress.current++;
      logger.info({ videoId, step, progress: `${state.progress.current}/${state.progress.total}` }, '📊 진행');
    }
  }

  /**
   * 프롬프트 강화 (News 스타일)
   */
  private enhancePrompt(prompt: string, style?: string): string {
    const prefix = {
      news_infographic: 'Professional news infographic, clean design,',
      breaking_news: 'Breaking news style, urgent, bold,',
      documentary: 'Documentary style, realistic,',
    }[style || 'news_infographic'] || 'News style,';

    return `${prefix} ${prompt}, high quality, no text, no watermark`;
  }

  /**
   * 콜백 전송
   */
  private async sendCallback(url: string, payload: any): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      logger.info({ url }, '✅ 콜백 전송 완료');
    } catch (error) {
      logger.error({ url, error }, '❌ 콜백 전송 실패');
    }
  }
}

// Export 타입 (의존성 없음)
export type NewsProjectDependencies = Record<string, never>;
