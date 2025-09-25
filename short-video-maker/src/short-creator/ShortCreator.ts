import { OrientationEnum } from "./../types/shorts";
/* eslint-disable @remotion/deterministic-randomness */
import fs from "fs-extra";
import cuid from "cuid";
import path from "path";
import https from "https";
import http from "http";

import { Kokoro } from "./libraries/Kokoro";
import { GoogleTTS } from "./libraries/google-tts";
import { Whisper } from "./libraries/Whisper";
import { FFMpeg } from "./libraries/FFmpeg";
import { PexelsAPI } from "./libraries/Pexels";
import { GoogleVeoAPI } from "./libraries/GoogleVeo";
import { LeonardoAI } from "./libraries/LeonardoAI";
import { Config } from "../config";
import { logger } from "../logger";
import { MusicManager } from "./music";
import type {
  SceneInput,
  RenderConfig,
  Scene,
  VideoStatus,
  MusicMoodEnum,
  MusicTag,
  MusicForVideo,
} from "../types/shorts";

export class ShortCreator {
  private queue: {
    sceneInput: SceneInput[];
    config: RenderConfig;
    id: string;
    callbackUrl?: string;
    metadata?: any;
  }[] = [];
  constructor(
    private config: Config,
    private ttsProvider: Kokoro | GoogleTTS,
    private whisper: Whisper,
    private ffmpeg: FFMpeg,
    private pexelsApi: PexelsAPI,
    private musicManager: MusicManager,
    private googleVeoApi?: GoogleVeoAPI,
    private leonardoApi?: LeonardoAI,
  ) {}

  public status(id: string): VideoStatus {
    const videoPath = this.getVideoPath(id);
    if (this.queue.find((item) => item.id === id)) {
      return "processing";
    }
    if (fs.existsSync(videoPath)) {
      return "ready";
    }
    return "failed";
  }

  public addToQueue(
    sceneInput: SceneInput[], 
    config: RenderConfig, 
    callbackUrl?: string, 
    metadata?: any
  ): string {
    // todo add mutex lock
    const id = cuid();
    this.queue.push({
      sceneInput,
      config,
      id,
      callbackUrl,
      metadata,
    });
    if (this.queue.length === 1) {
      this.processQueue();
    }
    return id;
  }

  private async processQueue(): Promise<void> {
    // todo add a semaphore
    if (this.queue.length === 0) {
      return;
    }
    const { sceneInput, config, id, callbackUrl, metadata } = this.queue[0];
    logger.debug(
      { sceneInput, config, id, callbackUrl },
      "Processing video item in the queue",
    );
    try {
      await this.createShort(id, sceneInput, config);
      logger.debug({ id }, "Video created successfully");
      
      // N8N callback 전송
      if (callbackUrl) {
        await this.sendCompletionCallback(id, callbackUrl, sceneInput, config, metadata, 'completed');
      }
    } catch (error: unknown) {
      logger.error(error, "Error creating video");
      
      // N8N error callback 전송
      if (callbackUrl) {
        const errorType = this.categorizeError(error);
        await this.sendCompletionCallback(id, callbackUrl, sceneInput, config, metadata, 'failed', error, errorType);
      }
    } finally {
      this.queue.shift();
      this.processQueue();
    }
  }

  private async createShort(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig,
  ): Promise<string> {
    logger.debug(
      {
        inputScenes,
        config,
      },
      "Creating short video",
    );
    const scenes: Scene[] = [];
    let totalDuration = 0;
    const excludeVideoIds = [];
    const tempFiles = [];

    const orientation: OrientationEnum =
      config.orientation || OrientationEnum.portrait;

    let index = 0;
    for (const scene of inputScenes) {
      const audio = await this.ttsProvider.generate(
        scene.text,
        config.voice ?? "af_heart",
      );
      let { audioLength } = audio;
      const { audio: audioStream } = audio;

      // add the paddingBack in seconds to the last scene
      if (index + 1 === inputScenes.length && config.paddingBack) {
        audioLength += config.paddingBack / 1000;
      }

      const tempId = cuid();
      const tempWavFileName = `${tempId}.wav`;
      const tempMp3FileName = `${tempId}.mp3`;
      const tempVideoFileName = `${tempId}.mp4`;
      const tempWavPath = path.join(this.config.tempDirPath, tempWavFileName);
      const tempMp3Path = path.join(this.config.tempDirPath, tempMp3FileName);
      const tempVideoPath = path.join(
        this.config.tempDirPath,
        tempVideoFileName,
      );
      tempFiles.push(tempVideoPath);
      tempFiles.push(tempWavPath, tempMp3Path);

      await this.ffmpeg.saveNormalizedAudio(audioStream, tempWavPath);
      const captions = await this.whisper.CreateCaption(tempWavPath);

      await this.ffmpeg.saveToMp3(audioStream, tempMp3Path);
      
      let video;
      if (this.config.videoSource === "veo" && this.googleVeoApi) {
        try {
          video = await this.googleVeoApi.findVideo(
            scene.searchTerms,
            audioLength,
            excludeVideoIds,
            orientation,
          );
        } catch (error) {
          logger.warn(error, "Veo API failed, falling back to Pexels");
          video = await this.pexelsApi.findVideo(
            scene.searchTerms,
            audioLength,
            excludeVideoIds,
            orientation,
          );
        }
      } else if (this.config.videoSource === "leonardo" && this.leonardoApi) {
        try {
          video = await this.leonardoApi.findVideo(
            scene.searchTerms,
            audioLength,
            excludeVideoIds,
            orientation,
          );
        } catch (error) {
          logger.warn(error, "Leonardo API failed, falling back to Pexels");
          video = await this.pexelsApi.findVideo(
            scene.searchTerms,
            audioLength,
            excludeVideoIds,
            orientation,
          );
        }
      } else if (this.config.videoSource === "both" && Math.random() > 0.5) {
        // Randomly choose between API services if both are configured
        try {
          if (this.googleVeoApi && this.leonardoApi) {
            const useVeo = Math.random() > 0.5;
            if (useVeo) {
              video = await this.googleVeoApi.findVideo(
                scene.searchTerms,
                audioLength,
                excludeVideoIds,
                orientation,
              );
            } else {
              video = await this.leonardoApi.findVideo(
                scene.searchTerms,
                audioLength,
                excludeVideoIds,
                orientation,
              );
            }
          } else if (this.googleVeoApi) {
            video = await this.googleVeoApi.findVideo(
              scene.searchTerms,
              audioLength,
              excludeVideoIds,
              orientation,
            );
          } else if (this.leonardoApi) {
            video = await this.leonardoApi.findVideo(
              scene.searchTerms,
              audioLength,
              excludeVideoIds,
              orientation,
            );
          } else {
            // Fallback to Pexels
            video = await this.pexelsApi.findVideo(
              scene.searchTerms,
              audioLength,
              excludeVideoIds,
              orientation,
            );
          }
        } catch (error) {
          logger.warn(error, "API video generation failed, falling back to Pexels");
          video = await this.pexelsApi.findVideo(
            scene.searchTerms,
            audioLength,
            excludeVideoIds,
            orientation,
          );
        }
      } else {
        // Default to Pexels
        video = await this.pexelsApi.findVideo(
          scene.searchTerms,
          audioLength,
          excludeVideoIds,
          orientation,
        );
      }

      logger.debug(`Downloading video from ${video.url} to ${tempVideoPath}`);

      await new Promise<void>((resolve, reject) => {
        const fileStream = fs.createWriteStream(tempVideoPath);
        https
          .get(video.url, (response: http.IncomingMessage) => {
            if (response.statusCode !== 200) {
              reject(
                new Error(`Failed to download video: ${response.statusCode}`),
              );
              return;
            }

            response.pipe(fileStream);

            fileStream.on("finish", () => {
              fileStream.close();
              logger.debug(`Video downloaded successfully to ${tempVideoPath}`);
              resolve();
            });
          })
          .on("error", (err: Error) => {
            fs.unlink(tempVideoPath, () => {}); // Delete the file if download failed
            logger.error(err, "Error downloading video:");
            reject(err);
          });
      });

      excludeVideoIds.push(video.id);

      scenes.push({
        captions,
        video: `http://localhost:${this.config.port}/api/tmp/${tempVideoFileName}`,
        audio: {
          url: `http://localhost:${this.config.port}/api/tmp/${tempMp3FileName}`,
          duration: audioLength,
        },
      });

      totalDuration += audioLength;
      index++;
    }
    if (config.paddingBack) {
      totalDuration += config.paddingBack / 1000;
    }

    // Check if we're using API-generated video or FFmpeg mode that doesn't need Remotion
    const isApiVideo = this.config.videoSource === "veo" || this.config.videoSource === "leonardo" || 
                      (this.config.videoSource === "both" && (this.googleVeoApi || this.leonardoApi));
    const isFFmpegMode = this.config.videoSource === "ffmpeg";
    
    if (isFFmpegMode) {
      // FFmpeg 모드: 단일 씬 또는 멀티 씬 모두 지원
      const outputLocation = path.join(this.config.videosDirPath, `${videoId}.mp4`);
      
      if (scenes.length === 1) {
        // 단일 씬 처리 (기존 로직 유지)
        logger.debug({ videoId }, "Processing single scene with FFmpeg");
        await this.processSingleSceneWithFFmpeg(scenes[0], outputLocation, totalDuration, orientation, config);
      } else {
        // 멀티 씬 처리 (새로운 로직)
        logger.debug({ videoId, sceneCount: scenes.length }, "Processing multi-scene video with FFmpeg");
        await this.processMultiSceneWithFFmpeg(scenes, outputLocation, orientation, config);
      }
    } else if (isApiVideo && scenes.length === 1) {
      // API 비디오 단일 씬 처리 (기존 로직)
      const scene = scenes[0];
      const outputLocation = path.join(this.config.videosDirPath, `${videoId}.mp4`);
      
      logger.debug({ videoId }, "Using API-generated video directly with FFmpeg audio overlay");
      await this.processSingleSceneWithFFmpeg(scene, outputLocation, totalDuration, orientation, config);
    } else {
      // All video processing is now handled by FFmpeg mode
      throw new Error("Unsupported video configuration - please use FFmpeg mode (VIDEO_SOURCE=ffmpeg)");
    }

    for (const file of tempFiles) {
      fs.removeSync(file);
    }

    return videoId;
  }

  public getVideoPath(videoId: string): string {
    return path.join(this.config.videosDirPath, `${videoId}.mp4`);
  }

  public getDetailedStatus(videoId: string): any {
    const status = this.status(videoId);
    const videoPath = this.getVideoPath(videoId);
    
    // 기본 상태 정보
    const result: any = {
      videoId,
      status,
      videoPath: fs.existsSync(videoPath) ? videoPath : null,
      timestamp: new Date().toISOString()
    };

    // 큐에서 진행 중인 작업 찾기
    const queueItem = this.queue.find(item => item.id === videoId);
    if (queueItem) {
      result.processing = true;
      result.scenes = queueItem.sceneInput;
      result.config = queueItem.config;
      result.metadata = queueItem.metadata;
      result.callbackUrl = queueItem.callbackUrl;
    } else {
      result.processing = false;
    }

    // 완료된 비디오의 상세 정보
    if (status === "ready" && fs.existsSync(videoPath)) {
      const stats = fs.statSync(videoPath);
      result.fileSize = stats.size;
      result.createdAt = stats.birthtime.toISOString();
      result.modifiedAt = stats.mtime.toISOString();
      
      // 사용된 파라미터들 (큐에서 가져오거나 기본값)
      if (queueItem) {
        result.processingParameters = {
          videoSource: this.config.videoSource,
          musicDirPath: this.config.musicDirPath,
          tempDirPath: this.config.tempDirPath,
          videosDirPath: this.config.videosDirPath,
          orientation: queueItem.config.orientation,
          musicTag: queueItem.config.music,
          sceneCount: queueItem.sceneInput.length,
          apiKeys: {
            hasGoogleVeo: !!this.googleVeoApi,
            hasLeonardo: !!this.leonardoApi,
            hasPexels: !!this.pexelsApi
          }
        };
      }
    }

    // 실패한 경우 추가 정보
    if (status === "failed") {
      result.errorInfo = {
        message: "Video processing failed or video file not found",
        videoExists: fs.existsSync(videoPath),
        inQueue: !!queueItem,
        possibleCauses: [
          "Processing error during video creation",
          "API quota exceeded", 
          "Network timeout",
          "Invalid input parameters",
          "File system error"
        ]
      };
    }

    return result;
  }

  public deleteVideo(videoId: string): void {
    const videoPath = this.getVideoPath(videoId);
    fs.removeSync(videoPath);
    logger.debug({ videoId }, "Deleted video file");
  }

  /**
   * 에러 타입 분류
   */
  private categorizeError(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      if (message.includes('quota') || message.includes('429')) {
        return 'quota_exceeded';
      } else if (message.includes('authentication') || message.includes('401')) {
        return 'authentication_error';
      } else if (message.includes('network') || message.includes('timeout')) {
        return 'network_error';
      } else if (message.includes('veo') || message.includes('leonardo')) {
        return 'video_generation_error';
      } else if (message.includes('tts') || message.includes('audio')) {
        return 'audio_generation_error';
      } else if (message.includes('whisper') || message.includes('transcribe')) {
        return 'transcription_error';
      } else if (message.includes('ffmpeg') || message.includes('render')) {
        return 'video_processing_error';
      } else {
        return 'unknown_error';
      }
    }
    return 'unknown_error';
  }

  /**
   * N8N으로 완료 콜백 전송
   */
  private async sendCompletionCallback(
    videoId: string, 
    callbackUrl: string,
    sceneInput: SceneInput[], 
    config: RenderConfig, 
    originalMetadata?: any,
    status: 'completed' | 'failed' | 'processing' = 'completed',
    error?: unknown,
    errorType?: string
  ): Promise<void> {
    try {
      const videoPath = this.getVideoPath(videoId);
      const videoStats = fs.existsSync(videoPath) ? fs.statSync(videoPath) : null;
      
      // 사용된 파라미터들 수집
      const usedParameters = {
        videoId,
        scenes: sceneInput.map((scene, index) => ({
          sceneNumber: index + 1,
          text: scene.text,
          searchTerms: scene.searchTerms,
          voiceConfig: (scene as any).voiceConfig || { voice: 'af_heart' },
          duration: (scene as any).duration || null,
          videoPrompt: (scene as any).videoPrompt || null,
          textOverlays: (scene as any).textOverlays || null
        })),
        config: {
          orientation: config.orientation,
          musicTag: (config as any).musicTag || 'happy',
          quality: (config as any).quality || '1080p',
          style: (config as any).style || null,
          soundtrack: (config as any).soundtrack || null,
          // Remotion/렌더링 설정
          paddingBack: config.paddingBack,
          music: config.music,
          captionPosition: config.captionPosition,
          captionBackgroundColor: config.captionBackgroundColor,
          voice: config.voice,
          musicVolume: config.musicVolume
        },
        processing: {
          totalScenes: sceneInput.length,
          totalDuration: sceneInput.reduce((sum, scene) => sum + ((scene as any).duration || 0), 0),
          videoSource: this.config.videoSource,
          ttsProvider: this.config.ttsProvider,
          whisperModel: this.config.whisperModel,
          whisperVerbose: this.config.whisperVerbose,
          kokoroModelPrecision: this.config.kokoroModelPrecision,
          googleCloudProjectId: this.config.googleCloudProjectId,
          googleCloudRegion: this.config.googleCloudRegion,
          devMode: this.config.devMode,
          concurrency: this.config.concurrency,
          port: this.config.port
        },
        // API 키 정보 (보안상 키 값은 제외하고 사용 여부만)
        api_keys: {
          pexels: !!this.config.pexelsApiKey,
          googleVeo: !!this.config.googleVeoApiKey,
          leonardo: !!this.config.leonardoApiKey,
          googleGemini: !!this.config.googleGeminiApiKey,
          googleTts: !!this.config.googleTtsApiKey
        },
        // 파일 경로 정보
        paths: {
          videosDirPath: this.config.videosDirPath,
          tempDirPath: this.config.tempDirPath,
          musicDirPath: this.config.musicDirPath,
          whisperInstallPath: this.config.whisperInstallPath,
          packageDirPath: this.config.packageDirPath
        }
      };

      // 결과 정보
      const result = {
        status,
        videoId,
        videoUrl: status === 'completed' ? `${this.getBaseUrl()}/api/short-video/${videoId}` : null,
        filePath: status === 'completed' ? videoPath : null,
        fileSize: videoStats?.size || 0,
        createdAt: new Date().toISOString(),
        parameters: usedParameters,
        metadata: originalMetadata,
        error: status === 'failed' ? {
          type: errorType || 'unknown_error',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        } : null,
        // 추가 디버깅 정보
        processing_info: {
          server_url: this.getBaseUrl(),
          video_storage_path: this.config.videosDirPath,
          temp_path: this.config.tempDirPath,
          video_source: this.config.videoSource,
          tts_provider: this.config.ttsProvider
        }
      };

      logger.info({ callbackUrl, result }, "Sending completion callback to N8N");

      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(result)
      });

      if (!response.ok) {
        throw new Error(`Callback failed: ${response.status} ${response.statusText}`);
      }

      logger.info({ videoId, callbackUrl }, "Successfully sent completion callback to N8N");
    } catch (callbackError: unknown) {
      logger.error(callbackError, "Failed to send completion callback to N8N");
    }
  }

  /**
   * 베이스 URL 생성 (callback에서 비디오 URL 제공용)
   */
  private getBaseUrl(): string {
    return `http://localhost:${this.config.port}`;
  }

  public getVideo(videoId: string): Buffer {
    const videoPath = this.getVideoPath(videoId);
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video ${videoId} not found`);
    }
    return fs.readFileSync(videoPath);
  }

  private findMusic(videoDuration: number, tag?: MusicMoodEnum): MusicForVideo {
    const musicFiles = this.musicManager.musicList().filter((music) => {
      if (tag) {
        return music.mood === tag;
      }
      return true;
    });
    return musicFiles[Math.floor(Math.random() * musicFiles.length)];
  }

  public ListAvailableMusicTags(): MusicTag[] {
    const tags = new Set<MusicTag>();
    this.musicManager.musicList().forEach((music) => {
      tags.add(music.mood as MusicTag);
    });
    return Array.from(tags.values());
  }

  public listAllVideos(): { id: string; status: VideoStatus }[] {
    const videos: { id: string; status: VideoStatus }[] = [];

    // Check if videos directory exists
    if (!fs.existsSync(this.config.videosDirPath)) {
      return videos;
    }

    // Read all files in the videos directory
    const files = fs.readdirSync(this.config.videosDirPath);

    // Filter for MP4 files and extract video IDs
    for (const file of files) {
      if (file.endsWith(".mp4")) {
        const videoId = file.replace(".mp4", "");

        let status: VideoStatus = "ready";
        const inQueue = this.queue.find((item) => item.id === videoId);
        if (inQueue) {
          status = "processing";
        }

        videos.push({ id: videoId, status });
      }
    }

    // Add videos that are in the queue but not yet rendered
    for (const queueItem of this.queue) {
      const existingVideo = videos.find((v) => v.id === queueItem.id);
      if (!existingVideo) {
        videos.push({ id: queueItem.id, status: "processing" });
      }
    }

    return videos;
  }

  public ListAvailableVoices(): string[] {
    return this.ttsProvider.listAvailableVoices();
  }

  /**
   * 단일 씬을 FFmpeg로 처리 (기존 로직)
   */
  private async processSingleSceneWithFFmpeg(
    scene: any,
    outputLocation: string,
    totalDuration: number,
    orientation: OrientationEnum,
    config: RenderConfig,
    skipSubtitles = false // 멀티씬에서 개별 씬 처리시 자막 건너뛰기
  ): Promise<void> {
    // BUGFIX: Use the actual temp file paths from the scene creation, not URL parsing
    // The scene URLs contain the temp file names that were generated during processing
    const videoFileName = scene.video.split('/').pop();
    const audioFileName = scene.audio.url.split('/').pop();
    
    const tempVideoPath = path.join(this.config.tempDirPath, videoFileName!);
    const tempMp3Path = path.join(this.config.tempDirPath, audioFileName!);
    
    // Verify files exist before processing
    if (!fs.existsSync(tempVideoPath)) {
      throw new Error(`Temp video file not found: ${tempVideoPath}`);
    }
    if (!fs.existsSync(tempMp3Path)) {
      throw new Error(`Temp audio file not found: ${tempMp3Path}`);
    }
    
    logger.debug({ tempVideoPath, tempMp3Path, outputLocation }, "FFmpeg file paths verified");
    
    // Use FFmpeg to combine video with audio and captions
    await this.ffmpeg.combineVideoWithAudioAndCaptions(
      tempVideoPath,
      tempMp3Path,
      scene.captions,
      outputLocation,
      totalDuration,
      orientation,
      config,
      skipSubtitles
    );
  }

  /**
   * 멀티 씬을 FFmpeg로 처리 (새로운 기능)
   * 각 씬을 개별적으로 처리한 후 concat으로 결합
   */
  private async processMultiSceneWithFFmpeg(
    scenes: any[],
    outputLocation: string,
    orientation: OrientationEnum,
    config: RenderConfig
  ): Promise<void> {
    const sceneVideoPaths: string[] = [];
    const tempFilesToCleanup: string[] = [];
    const allCaptions: any[] = [];
    let cumulativeDuration = 0;

    try {
      // 각 씬을 개별적으로 처리 (자막 제외)
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneVideoPath = path.join(
          this.config.tempDirPath, 
          `scene_${i}_${Date.now()}.mp4`
        );
        
        logger.debug({ sceneIndex: i, sceneVideoPath }, `Processing scene ${i + 1}/${scenes.length}`);
        
        // 개별 씬에 대한 처리 시간 계산 (오디오 길이 기준)
        const sceneDuration = scene.audio.duration || 3;
        
        // 단일 씬 처리 로직 재사용 (자막 건너뛰기)
        await this.processSingleSceneWithFFmpeg(
          scene,
          sceneVideoPath,
          sceneDuration,
          orientation,
          config,
          true // skipSubtitles = true
        );
        
        // 자막 수집 및 타이밍 조정
        if (scene.captions && scene.captions.length > 0) {
          const adjustedCaptions = scene.captions.map((caption: any) => ({
            ...caption,
            startMs: caption.startMs + (cumulativeDuration * 1000),
            endMs: caption.endMs + (cumulativeDuration * 1000),
          }));
          allCaptions.push(...adjustedCaptions);
          logger.debug({ sceneIndex: i, captionCount: adjustedCaptions.length, timeOffset: cumulativeDuration }, 
            "Collected scene captions with time offset");
        }
        
        sceneVideoPaths.push(sceneVideoPath);
        tempFilesToCleanup.push(sceneVideoPath);
        cumulativeDuration += sceneDuration;
        
        logger.debug({ sceneIndex: i, sceneVideoPath }, `Scene ${i + 1} processed successfully`);
      }

      // 모든 씬 비디오를 하나로 결합
      logger.debug({ sceneVideoPaths, outputLocation }, "Concatenating scene videos");
      const tempConcatenatedPath = path.join(this.config.tempDirPath, `temp_concat_${Date.now()}.mp4`);
      await this.ffmpeg.concatVideos(sceneVideoPaths, tempConcatenatedPath);
      logger.debug({ outputLocation }, "Multi-scene video concatenation complete");

      // 결합된 비디오에 시간 동기화된 자막 적용
      if (allCaptions.length > 0) {
        logger.debug({ captionCount: allCaptions.length }, "Applying synchronized subtitles to final video");
        await this.ffmpeg.addSubtitlesToVideo(tempConcatenatedPath, outputLocation, allCaptions, orientation);
        // 임시 결합 파일 삭제
        if (fs.existsSync(tempConcatenatedPath)) {
          fs.unlinkSync(tempConcatenatedPath);
          logger.debug({ tempFile: tempConcatenatedPath }, "Cleaned up temporary concatenated video");
        }
      } else {
        // 자막이 없으면 결합된 비디오를 최종 위치로 이동
        fs.renameSync(tempConcatenatedPath, outputLocation);
        logger.debug("No subtitles to apply, moved concatenated video to final location");
      }

    } catch (error) {
      logger.error(error, "Error processing multi-scene video with FFmpeg");
      throw error;
    } finally {
      // 임시 씬 비디오 파일들 정리
      for (const tempFile of tempFilesToCleanup) {
        try {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
            logger.debug({ tempFile }, "Cleaned up temporary scene video");
          }
        } catch (cleanupError) {
          logger.warn(cleanupError, `Could not clean up temporary file: ${tempFile}`);
        }
      }
    }
  }
}
