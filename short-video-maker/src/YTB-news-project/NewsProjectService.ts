/**
 * NewsProjectService - News 숏츠 생성 서비스
 *
 * 원칙:
 * - YTB-ffmpeg 모듈 직접 사용 (독립적)
 * - NewsVisualSource 사용 (Pexels 스톡 → AI fallback)
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

// 🔥 NewsVisualSource (Pexels 스톡 → AI fallback)
import { NewsVisualSource } from './NewsVisualSource';
import type { ImageGenerationMode } from './types';

// 🔥 YTB-tts 모듈 (ElevenLabs / Google / Gemini 선택)
import { ElevenLabsTTS, GoogleTTS, GeminiTTS } from '../YTB-tts';
import { Config } from '../config';

// 🔥 GCS 업로드 (다운로드 URL 제공용)
import { GoogleCloudStorageService } from '../storage/GoogleCloudStorageService';

// 타입
import type {
  NewsPayload,
  NewsVideoResult,
  VideoStatus,
  Caption,
} from './types';

// 🔥 한국어 자막 분리 유틸리티
import { splitNarrationToCaptions } from './utils/KoreanCaptionSplitter';

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
  private elevenLabsTTS?: ElevenLabsTTS;
  private googleTTS?: GoogleTTS;
  private geminiTTS?: GeminiTTS;  // 🔥 Gemini TTS (자연스러운 숏츠 음성)
  private gcsService?: GoogleCloudStorageService;
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

    // 🔥 TTS 서비스 초기화
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

    // 🔥 Gemini TTS Pro (자연스러운 고품질 음성)
    if (this.config.googleGeminiApiKey) {
      try {
        this.geminiTTS = new GeminiTTS({
          apiKey: this.config.googleGeminiApiKey,
          model: 'gemini-2.5-pro-preview-tts',  // 🔥 Pro 모델 사용 (고품질)
          defaultGender: 'female',  // 🔥 여성 voice 고정
        });
        logger.info('[NewsProject] Gemini TTS Pro 사용 가능 (고품질 음성)');
      } catch (geminiError) {
        logger.warn({ error: geminiError }, '[NewsProject] Gemini TTS 초기화 실패');
      }
    }

    // 🔥 GCS 서비스 초기화 (다운로드 URL 제공용)
    try {
      this.gcsService = new GoogleCloudStorageService(this.config);
      logger.info('[NewsProject] GCS 업로드 사용 가능');
    } catch (gcsError) {
      logger.warn({ error: gcsError }, '[NewsProject] GCS 사용 불가 - 로컬 저장만 사용');
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

    // 🔥 이미지 생성 모드 (기본값: hybrid - Pexels 우선, AI fallback)
    const imageMode: ImageGenerationMode = config.image_generation || 'hybrid';
    logger.info({ imageMode }, '[NewsProject] 이미지 생성 모드');

    try {
      await fs.ensureDir(tempDir);
      this.updateState(videoId, 'processing', '비주얼 생성 중');

      // ============================================
      // Step 1: 비주얼 생성 (Pexels 스톡 → AI fallback)
      // ============================================
      const visualSource = new NewsVisualSource(tempDir);
      await visualSource.initialize();

      // 🔥 비주얼 타입 추적 (비디오 vs 이미지)
      const visualDataList: {
        path: string;
        duration: number;
        type: 'video' | 'image';
      }[] = [];

      for (let i = 0; i < video.scenes.length; i++) {
        const scene = video.scenes[i];
        const modeLabel = imageMode === 'hybrid' ? 'Pexels비디오→이미지→AI' : imageMode;
        this.updateState(videoId, 'processing', `비주얼 생성 ${i + 1}/${video.scenes.length} (${modeLabel})`);

        const visualResult = await visualSource.getVisual(
          {
            prompt: scene.image_prompt,
            orientation: config.video.orientation,
            style: config.nanoBanana?.defaultStyle,
            sceneIndex: i,
            videoId,
            duration: scene.duration,  // 🔥 비디오 검색용 duration
          },
          imageMode
        );

        visualDataList.push({
          path: visualResult.path,
          duration: scene.duration,
          type: visualResult.type,
        });

        logger.info({
          scene: i + 1,
          type: visualResult.type,
          source: visualResult.source,
          pexelsId: visualResult.metadata?.pexelsId,
          photographer: visualResult.metadata?.photographer,
        }, `✅ 비주얼 생성 완료 (${visualResult.type}: ${visualResult.source})`);
      }

      // ============================================
      // Step 2: TTS 생성 (YTB-tts 모듈)
      // ============================================
      this.updateState(videoId, 'processing', `음성 생성 중 (${ttsProvider})`);

      const audioFiles: string[] = [];
      const allCaptions: Caption[] = [];
      let cumulativeTime = 0;

      // 🔥 씬별 제목 오버레이 수집 (text_overlay)
      const sceneOverlays: Array<{ text: string; startMs: number; endMs: number }> = [];

      // 🔥 영상 전체에서 동일한 voice 사용 (한 번만 선택)
      let selectedVoiceForVideo: { name: string; gender: 'female' | 'male' } | null = null;
      let selectedGoogleVoice: string | null = null;  // 🔥 Google TTS fallback용 voice도 미리 선택

      if (this.geminiTTS && (ttsProvider === 'gemini' || !ttsProvider)) {
        // 🔥 뉴스 숏츠 추천 여자 voice에서 랜덤 선택 (Despina, Aoede, Autonoe)
        selectedVoiceForVideo = this.geminiTTS.getNewsVoice('female');
        // 🔥 Google TTS fallback용 voice도 영상 시작 시 선택 (전체 영상에서 동일 voice 사용)
        selectedGoogleVoice = this.getGoogleVoiceByGender(selectedVoiceForVideo.gender);
        logger.info({
          voice: selectedVoiceForVideo.name,
          gender: selectedVoiceForVideo.gender,
          googleFallbackVoice: selectedGoogleVoice
        }, '[NewsProject] 🎙️ 영상 전체 voice 선택 (랜덤)');
      }

      for (let i = 0; i < video.scenes.length; i++) {
        const scene = video.scenes[i];
        this.updateState(videoId, 'processing', `음성 생성 ${i + 1}/${video.scenes.length}`);

        const audioPath = path.join(tempDir, `audio_${i}.mp3`);
        let audioDuration = 0;

        // 🔥 TTS 생성 우선순위: Gemini(기본) → ElevenLabs → Google (fallback)
        let usedProvider: string = ttsProvider;
        let ttsSuccess = false;
        let usedVoice: string = config.audio.voice || 'random';

        // 1️⃣ Gemini TTS (기본 - 자연스러운 숏츠 음성, 영상 전체 동일 voice)
        if ((ttsProvider === 'gemini' || !ttsProvider) && this.geminiTTS && selectedVoiceForVideo) {
          try {
            const ttsResult = await this.geminiTTS.generate(
              scene.narration,
              selectedVoiceForVideo.name,  // 🔥 영상 전체 동일 voice 사용
              { useNewsVoice: false }  // 이미 선택된 voice 사용
            );

            // 🔥 Gemini TTS는 RAW PCM (L16, 24kHz, mono) → MP3로 변환 필요
            await this.ffmpeg.savePcmToMp3(ttsResult.audio, audioPath);
            audioDuration = ttsResult.audioLength;
            usedVoice = ttsResult.voice;

            // 🔥 Gemini는 alignment 없음 - 어절 단위로 분리하여 자막 생성
            const geminiCaptions = splitNarrationToCaptions(
              scene.narration,
              audioDuration * 1000,  // 밀리초
              cumulativeTime * 1000  // 시작 시간 (밀리초)
            );
            allCaptions.push(...geminiCaptions);
            logger.debug({ captionCount: geminiCaptions.length }, '[NewsProject] Gemini TTS 어절 자막 생성');

            usedProvider = 'gemini';
            ttsSuccess = true;
            logger.info({ scene: i + 1, voice: usedVoice, gender: selectedVoiceForVideo.gender }, '[NewsProject] Gemini TTS 성공');
          } catch (geminiError) {
            const errMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);
            logger.warn({ error: errMsg, stack: geminiError instanceof Error ? geminiError.stack : undefined }, '[NewsProject] Gemini TTS 실패, ElevenLabs로 fallback');
          }
        }

        // 2️⃣ ElevenLabs 시도 (fallback)
        if (!ttsSuccess && this.elevenLabsTTS) {
          try {
            const ttsResult = await this.elevenLabsTTS.generate(
              scene.narration,
              config.audio.voice
            );

            const audioBuffer = Buffer.from(ttsResult.audio);
            await fs.writeFile(audioPath, audioBuffer);
            audioDuration = ttsResult.audioLength;

            // 🔥 FIX: ElevenLabs도 동일하게 어절 단위로 자막 생성 (자막 수 제한 적용)
            // alignment가 있어도 word-by-word는 자막이 너무 많아짐
            const elevenLabsCaptions = splitNarrationToCaptions(
              scene.narration,
              audioDuration * 1000,  // 밀리초
              cumulativeTime * 1000  // 시작 시간 (밀리초)
            );
            allCaptions.push(...elevenLabsCaptions);
            logger.debug({ captionCount: elevenLabsCaptions.length }, '[NewsProject] ElevenLabs TTS 어절 자막 생성');

            usedProvider = 'elevenlabs';
            ttsSuccess = true;
          } catch (elevenLabsError) {
            logger.warn({ error: elevenLabsError }, '[NewsProject] ElevenLabs 실패, Google TTS로 fallback');
          }
        }

        // 3️⃣ Google TTS (최후의 수단)
        if (!ttsSuccess && this.googleTTS) {
          try {
            // 🔥 FIX: 영상 전체에서 동일한 Google TTS voice 사용
            const googleVoice = selectedGoogleVoice || this.getGoogleVoiceByGender(selectedVoiceForVideo?.gender);

            const ttsResult = await this.googleTTS.generate(
              scene.narration,
              googleVoice
            );

            const audioBuffer = Buffer.from(ttsResult.audio);
            await fs.writeFile(audioPath, audioBuffer);
            audioDuration = ttsResult.audioLength;

            // 🔥 Google TTS도 alignment 없음 - 어절 단위로 분리하여 자막 생성
            const googleCaptions = splitNarrationToCaptions(
              scene.narration,
              audioDuration * 1000,  // 밀리초
              cumulativeTime * 1000  // 시작 시간 (밀리초)
            );
            allCaptions.push(...googleCaptions);

            usedProvider = 'google';
            usedVoice = googleVoice;  // 🔥 선택된 voice 기록
            ttsSuccess = true;
            logger.info({ voice: googleVoice, scene: i + 1, captionCount: googleCaptions.length }, '[NewsProject] Google TTS fallback 성공');
          } catch (googleError) {
            logger.error({ error: googleError }, '[NewsProject] Google TTS도 실패');
          }
        }

        if (!ttsSuccess) {
          throw new Error(`TTS 생성 실패: 모든 provider 실패`);
        }

        // 🔥 FIX: JSON duration과 TTS duration 중 큰 값 사용
        const jsonDuration = video.scenes[i].duration;
        const effectiveDuration = Math.max(jsonDuration, audioDuration);

        // 🔥 오디오 패딩: TTS가 JSON duration보다 짧으면 무음 추가
        let finalAudioPath = audioPath;
        if (audioDuration < jsonDuration) {
          const paddedAudioPath = path.join(tempDir, `audio_padded_${i}.mp3`);
          const silenceDuration = jsonDuration - audioDuration;

          // 무음 생성
          const silencePath = path.join(tempDir, `silence_${i}.mp3`);
          await this.ffmpeg.generateSilentAudio(silencePath, silenceDuration);

          // TTS + 무음 연결
          await this.ffmpeg.concatAudios([audioPath, silencePath], paddedAudioPath);
          finalAudioPath = paddedAudioPath;

          logger.info({
            scene: i + 1,
            ttsDuration: audioDuration,
            silencePadding: silenceDuration,
            totalSceneDuration: jsonDuration
          }, '🔇 오디오 패딩 추가');
        }

        audioFiles.push(finalAudioPath);
        visualDataList[i].duration = effectiveDuration;

        // 🔥 text_overlay 수집 (씬별 제목)
        const sceneStartMs = cumulativeTime * 1000;
        cumulativeTime += effectiveDuration;
        const sceneEndMs = cumulativeTime * 1000;

        if (scene.text_overlay) {
          sceneOverlays.push({
            text: scene.text_overlay,
            startMs: sceneStartMs,
            endMs: sceneEndMs
          });
          logger.debug({ scene: i + 1, overlay: scene.text_overlay }, '🔥 씬 제목 수집됨');
        }

        logger.info({
          scene: i + 1,
          jsonDuration,
          ttsDuration: audioDuration,
          effectiveDuration,
          provider: usedProvider
        }, '✅ 음성 생성 완료');
      }

      // ============================================
      // Step 3: 비디오 합성 (FFMpeg) - 비디오/이미지 분기 처리
      // ============================================
      this.updateState(videoId, 'processing', '비디오 합성 중');

      const dimensionStr = config.video.orientation === 'portrait'
        ? VIDEO_DIMENSIONS.PORTRAIT
        : VIDEO_DIMENSIONS.LANDSCAPE;

      // 🔥 "1080x1920" → { width: 1080, height: 1920 }
      const [widthStr, heightStr] = dimensionStr.split('x');
      const dimensions = { width: parseInt(widthStr), height: parseInt(heightStr) };

      const tempVideoPath = path.join(tempDir, `temp_${videoId}.mp4`);
      const sceneClips: string[] = [];

      // 🔥 각 씬별로 비디오/이미지 처리
      for (let i = 0; i < visualDataList.length; i++) {
        const visual = visualDataList[i];
        const clipPath = path.join(tempDir, `clip_${i}.mp4`);

        if (visual.type === 'video') {
          // 📹 Pexels 비디오: duration만큼 트림 + 리사이즈
          await this.ffmpeg.trimAndResizeVideo(
            visual.path,
            clipPath,
            visual.duration,
            dimensions
          );
          logger.info({ scene: i + 1, type: 'video', duration: visual.duration }, '✅ 비디오 클립 트림 완료');
        } else {
          // 🖼️ 이미지: 정적 비디오로 변환
          await this.ffmpeg.createStaticVideoFromMultipleImages(
            [{ imagePath: visual.path, duration: visual.duration }],
            clipPath,
            dimensionStr  // 문자열 형식 "1080x1920"
          );
          logger.info({ scene: i + 1, type: 'image', duration: visual.duration }, '✅ 이미지 클립 생성 완료');
        }

        sceneClips.push(clipPath);
      }

      // 모든 클립 연결
      if (sceneClips.length > 1) {
        await this.ffmpeg.concatVideos(sceneClips, tempVideoPath);
        logger.info({ clipCount: sceneClips.length }, '✅ 클립 연결 완료');
      } else {
        await fs.copy(sceneClips[0], tempVideoPath);
      }

      logger.info('✅ 비디오 합성 완료');

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

      // 🔥 전체 자막 수 제한 (ENAMETOOLONG 방지)
      // FFmpeg drawtext 필터가 너무 많으면 Windows 명령어 길이 제한 초과
      const MAX_TOTAL_CAPTIONS = 50;
      let finalCaptions = allCaptions;
      if (allCaptions.length > MAX_TOTAL_CAPTIONS) {
        logger.warn({
          originalCount: allCaptions.length,
          maxAllowed: MAX_TOTAL_CAPTIONS,
        }, '[NewsProject] 자막 수 초과 - 병합 적용');

        // 자막 병합: 인접한 자막들을 그룹화
        finalCaptions = this.mergeCaptions(allCaptions, MAX_TOTAL_CAPTIONS);
        logger.info({ finalCount: finalCaptions.length }, '[NewsProject] 자막 병합 완료');
      }

      logger.info({
        captionCount: finalCaptions.length,
        overlayCount: sceneOverlays.length
      }, '[NewsProject] 최종 자막/제목 수');

      await this.ffmpeg.combineVideoWithAudioAndCaptions(
        tempVideoPath,
        finalAudioPath,
        finalCaptions,
        outputPath,
        totalDuration,
        orientationEnum,
        { orientation: orientationEnum },
        false, // 자막 활성화
        sceneOverlays  // 🔥 씬별 제목 오버레이
      );

      logger.info({ outputPath, totalDuration }, '✅ 최종 비디오 생성 완료');

      // 임시 파일 정리
      await fs.remove(tempDir);

      // ============================================
      // 🔥 GCS 업로드 (다운로드 URL 제공)
      // ============================================
      let downloadUrl: string | undefined;
      let gcsPath: string | undefined;

      if (this.gcsService) {
        try {
          this.updateState(videoId, 'processing', 'GCS 업로드 중');
          const uploadResult = await this.gcsService.uploadVideo(videoId, outputPath);

          if (uploadResult.success) {
            downloadUrl = uploadResult.signedUrl;
            gcsPath = uploadResult.gcsPath;
            logger.info({ videoId, gcsPath, downloadUrl: downloadUrl?.substring(0, 100) + '...' }, '☁️ GCS 업로드 완료');
          } else {
            logger.warn({ videoId, error: uploadResult.error }, 'GCS 업로드 실패 - 로컬 파일만 사용');
          }
        } catch (gcsError) {
          logger.warn({ videoId, error: gcsError }, 'GCS 업로드 에러 - 로컬 파일만 사용');
        }
      }

      // ============================================
      // 완료
      // ============================================
      const result: NewsVideoResult = {
        videoId,
        status: 'completed',
        outputPath,
        duration: totalDuration,
        downloadUrl,
        gcsPath,
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
   * 🔥 자막 병합 (전체 자막 수 제한)
   * 인접한 자막들을 합쳐서 maxCaptions 이하로 만듦
   */
  private mergeCaptions(captions: Caption[], maxCaptions: number): Caption[] {
    if (captions.length <= maxCaptions) return captions;

    const mergeSize = Math.ceil(captions.length / maxCaptions);
    const merged: Caption[] = [];

    for (let i = 0; i < captions.length; i += mergeSize) {
      const group = captions.slice(i, i + mergeSize);
      if (group.length === 0) continue;

      // 그룹 내 텍스트 합치기
      const text = group.map(c => c.text).join(' ');
      const startMs = group[0].startMs;
      const endMs = group[group.length - 1].endMs;

      merged.push({ text, startMs, endMs });
    }

    return merged;
  }

  /**
   * 🔥 Gender에 따라 Google TTS voice 선택 (랜덤)
   * - Chirp3-HD만 사용 (가장 자연스러운 프리미엄 voice)
   * - ⚠️ Neural2-A, Wavenet 사용 금지
   */
  private getGoogleVoiceByGender(gender?: 'female' | 'male'): string {
    // 🔥 Chirp3-HD voices만 사용 (프리미엄 - 가장 자연스러움)
    const femaleVoices = [
      'ko-KR-Chirp3-HD-Aoede',
      'ko-KR-Chirp3-HD-Kore',
      'ko-KR-Chirp3-HD-Leda',
      'ko-KR-Chirp3-HD-Despina',
    ];
    const maleVoices = [
      'ko-KR-Chirp3-HD-Alnilam',
      'ko-KR-Chirp3-HD-Algenib',
      'ko-KR-Chirp3-HD-Charon',
      'ko-KR-Chirp3-HD-Fenrir',
    ];

    if (gender === 'male') {
      const selected = maleVoices[Math.floor(Math.random() * maleVoices.length)];
      logger.info({ gender, selectedVoice: selected }, '[NewsProject] Google TTS Chirp3-HD voice 선택 (남성)');
      return selected;
    }

    // 여성 또는 미지정 시 여성 voice 랜덤 선택
    const selected = femaleVoices[Math.floor(Math.random() * femaleVoices.length)];
    logger.info({ gender: gender || 'female', selectedVoice: selected }, '[NewsProject] Google TTS Chirp3-HD voice 선택 (여성)');
    return selected;
  }

  /**
   * ElevenLabs voice ID를 Google TTS voice로 매핑 (legacy)
   */
  private mapToGoogleVoice(elevenLabsVoice: string): string {
    // ElevenLabs voice ID → Google TTS voice 매핑
    const voiceMap: Record<string, string> = {
      // 한국어 남성
      'pNInz6obpgDQGcFmaJgB': 'ko-KR-Neural2-C',  // Adam (남성)
      'VR6AewLTigWG4xSOukaG': 'ko-KR-Neural2-C',  // Arnold (남성)
      'ErXwobaYiN019PkySvjV': 'ko-KR-Neural2-C',  // Antoni (남성)
      // 한국어 여성
      'EXAVITQu4vr4xnSDxMaL': 'ko-KR-Neural2-A',  // Bella (여성)
      'MF3mGyEYCl7XYWbV9V6O': 'ko-KR-Neural2-A',  // Elli (여성)
      'jBpfuIE2acCO8z3wKNLl': 'ko-KR-Neural2-B',  // Gigi (여성)
      '21m00Tcm4TlvDq8ikWAM': 'ko-KR-Neural2-A',  // Rachel (여성)
    };

    // 매핑된 voice가 있으면 사용, 없으면 기본 한국어 여성 voice
    return voiceMap[elevenLabsVoice] || 'ko-KR-Neural2-A';
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
