import { OrientationEnum } from "./../types/shorts";
/* eslint-disable @remotion/deterministic-randomness */
import fs from "fs-extra";
import cuid from "cuid";
import path from "path";
import https from "https";
import http from "http";

import { Kokoro } from "./libraries/Kokoro";
import { GoogleTTS } from "./libraries/google-tts";
import { ElevenLabsTTS } from "./libraries/elevenlabs-tts";
import { TTSProvider } from "./libraries/TTSProvider";
import { Whisper } from "./libraries/Whisper";
import { FFMpeg } from "./libraries/FFmpeg";
import { PexelsAPI } from "./libraries/Pexels";
import { GoogleVeoAPI } from "./libraries/GoogleVeo";
import { LeonardoAI } from "./libraries/LeonardoAI";
import { ImageGenerationService } from "../image-generation/services/ImageGenerationService";
import { ImageModelType } from "../image-generation/models/imageModels";
import { saveImageSet } from "../image-generation/utils/imageUtils";
import { NanoBananaStaticVideoHelper } from "./nanoBananaStaticVideo";
import { Config } from "../config";
import { logger } from "../logger";
import { MusicManager } from "./music";

const defaultTimeoutMs = 30000;
import type {
  SceneInput,
  RenderConfig,
  Scene,
  VideoStatus,
  MusicMoodEnum,
  MusicTag,
  MusicForVideo,
  Voices,
} from "../types/shorts";

export class ShortCreator {
  private queue: {
    sceneInput: SceneInput[];
    config: RenderConfig;
    id: string;
    callbackUrl?: string;
    metadata?: any;
  }[] = [];
  
  // Image cache for sharing generated images across scenes
  private imageCache: Map<string, any[]> = new Map();
  
  constructor(
    private config: Config,
    private ttsProvider: Kokoro | GoogleTTS | ElevenLabsTTS | TTSProvider,
    private whisper: Whisper,
    private ffmpeg: FFMpeg,
    private pexelsApi: PexelsAPI,
    private musicManager: MusicManager,
    private googleVeoApi?: GoogleVeoAPI,
    private leonardoApi?: LeonardoAI,
    private imageGenerationService?: ImageGenerationService,
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
      await this.createShort(id, sceneInput, config, metadata);
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
    metadata?: any,
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

    // Clear image cache for new video creation
    this.imageCache.clear();

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
      // Use request-specific videoSource if provided
      const videoSource = config?.videoSource || this.config.videoSource;
      
      // Handle NANO BANANA-only mode (generate image and create static video)
      logger.debug({ 
        sceneIndex: index,
        videoSource,
        needsImageGeneration: scene.needsImageGeneration,
        hasImageData: !!scene.imageData,
        hasVideo: !!scene.video,
        metadataMode: metadata?.mode
      }, "Checking NANO BANANA conditions");
      
      const isNanoBananaMode = (videoSource === "ffmpeg" && scene.needsImageGeneration && scene.imageData && !scene.video) || 
                               (metadata?.mode === "nano-banana");
      
      if (isNanoBananaMode) {
        logger.debug({ sceneIndex: index }, "NANO BANANA-only mode: generating image and creating static video");
        
        try {
          // Ensure imageData exists for NANO BANANA mode
          if (!scene.imageData) {
            scene.imageData = {
              prompt: scene.text,
              style: "cinematic",
              mood: "dynamic"
            };
          }
          
          // Generate image using NANO BANANA
          if (!scene.imageData?.prompt) {
            throw new Error("Image generation prompt is required for NANO BANANA mode");
          }
          
          const imageGenData = {
            prompt: scene.imageData.prompt,
            style: scene.imageData.style || "cinematic",
            mood: scene.imageData.mood || "dynamic"
          };
          
          // Create cache key for image generation (include scene index for NANO BANANA-only mode)
          const cacheKey = JSON.stringify({
            prompt: imageGenData.prompt,
            style: imageGenData.style,
            mood: imageGenData.mood,
            orientation,
            sceneIndex: index // Add scene index for NANO BANANA-only mode
          });
          
          // Check if consistency mode is enabled (generate multiple images)
          logger.debug({ 
            useConsistency: (scene.imageData as any).useConsistency,
            generateMultiple: (scene.imageData as any).generateMultiple,
            numberOfImages: (scene.imageData as any).numberOfImages,
            count: (scene.imageData as any).count,
            cacheKey: cacheKey.substring(0, 100) + "..."
          }, "NANO BANANA: Checking consistency mode flags and cache");
          
          const useConsistencyMode = (scene.imageData as any).useConsistency || 
                                     (scene.imageData as any).generateMultiple || 
                                     metadata?.useConsistency;
          let generatedImage;
          
          if (useConsistencyMode) {
            let generatedImages = this.imageCache.get(cacheKey);
            
            if (generatedImages) {
              logger.debug({ 
                generatedCount: generatedImages.length,
                sceneIndex: index,
                cacheHit: true
              }, "NANO BANANA: Found cached images for consistency mode");
            } else {
              logger.debug("NANO BANANA: Using consistency mode: generating multiple images");
              const numberOfImages = (scene.imageData as any).numberOfImages || 
                                     (scene.imageData as any).count || 4;
              generatedImages = await this.generateMultipleImagesWithNanoBanana(
                imageGenData, 
                numberOfImages, 
                orientation,
                videoId
              );
              
              // Cache the generated images for reuse in other scenes
              this.imageCache.set(cacheKey, generatedImages);
              
              logger.debug({ 
                generatedCount: generatedImages.length,
                sceneIndex: index,
                cacheStored: true
              }, "NANO BANANA: Generated and cached multiple images for consistency");
            }
            
            // Select appropriate image for this scene
            const imageIndex = index % generatedImages.length;
            generatedImage = generatedImages[imageIndex];
            
            logger.debug({ 
              sceneIndex: index,
              imageIndex,
              totalImages: generatedImages.length
            }, "NANO BANANA: Selected image for scene");
          } else {
            // Single image generation
            generatedImage = await this.generateImageWithNanoBanana(imageGenData, orientation, videoId, index);
          }
          
          // Create static video from generated image using FFmpeg
          const staticVideo = await this.createStaticVideoFromImage(
            generatedImage,
            audioLength,
            orientation,
            tempVideoPath
          );
          
          // Skip normal video download since we created the video from image
          logger.debug({ sceneIndex: index, videoPath: tempVideoPath }, "Static video created from generated image");
          video = { url: tempVideoPath, width: orientation === OrientationEnum.portrait ? 1080 : 1920, height: orientation === OrientationEnum.portrait ? 1920 : 1080, id: tempId };
        } catch (error) {
          logger.error(error, "Failed to generate image or create static video, falling back to Pexels");
          // Fall back to Pexels if image generation fails
          video = await this.pexelsApi.findVideo(
            scene.searchTerms,
            audioLength,
            excludeVideoIds,
            orientation,
          );
        }
      } else
      
      if (videoSource === "veo" && this.googleVeoApi) {
        try {
          // Check if we need NANO BANANA → VEO3 workflow
          if (scene.needsImageGeneration && scene.imageData && !scene.video) {
            logger.debug({ sceneIndex: index }, "VEO3 mode: executing NANO BANANA → VEO3 workflow");
            
            // Step 1: Generate image(s) using NANO BANANA
            const imageGenData = {
              prompt: scene.imageData.prompt || scene.text,
              style: scene.imageData.style || "cinematic", 
              mood: scene.imageData.mood || "dynamic"
            };
            
            // Create cache key for image generation
            // For NANO BANANA-only mode (FFmpeg), include scene index to ensure unique images per scene
            const isNanoBananaOnly = config.videoSource === "ffmpeg";
            const cacheKey = JSON.stringify({
              prompt: imageGenData.prompt,
              style: imageGenData.style,
              mood: imageGenData.mood,
              orientation,
              sceneIndex: isNanoBananaOnly ? index : undefined // Add scene index for NANO BANANA-only mode
            });
            
            // Check if consistency mode is enabled (generate multiple images)
            logger.debug({ 
              useConsistency: (scene.imageData as any).useConsistency,
              generateMultiple: (scene.imageData as any).generateMultiple,
              metadataUseConsistency: metadata?.useConsistency,
              cacheKey: cacheKey.substring(0, 100) + "..."
            }, "Checking consistency mode flags and cache");
            
            const useConsistencyMode = (scene.imageData as any).useConsistency || 
                                       (scene.imageData as any).generateMultiple || 
                                       metadata?.useConsistency;
            let generatedImage;
            
            if (useConsistencyMode) {
              let generatedImages = this.imageCache.get(cacheKey);
              
              if (generatedImages) {
                logger.debug({ 
                  generatedCount: generatedImages.length,
                  sceneIndex: index,
                  cacheHit: true
                }, "Found cached images for consistency mode");
              } else {
                logger.debug("Using consistency mode: generating multiple images");
                const numberOfImages = (scene.imageData as any).numberOfImages || 
                                       (scene.imageData as any).count || 4;
                generatedImages = await this.generateMultipleImagesWithNanoBanana(
                  imageGenData, 
                  numberOfImages, 
                  orientation
                );
                
                // Cache the generated images for reuse in other scenes
                this.imageCache.set(cacheKey, generatedImages);
                
                logger.debug({ 
                  generatedCount: generatedImages.length,
                  sceneIndex: index,
                  cacheStored: true
                }, "Generated and cached multiple images for consistency");
              }
              
              // Smart image selection: use different image for each scene in multi-scene videos
              const imageIndex = index % generatedImages.length;
              generatedImage = generatedImages[imageIndex];
              
              logger.debug({ 
                generatedCount: generatedImages.length,
                sceneIndex: index,
                selectedImageIndex: imageIndex,
                totalScenes: inputScenes.length
              }, "Selected image based on scene index from cached/generated set");
            } else {
              generatedImage = await this.generateImageWithNanoBanana(imageGenData, orientation, videoId, index);
            }
            
            // Step 2: Generate video from generated image using VEO3
            const veoVideo = await this.generateVideoFromImage(
              generatedImage,
              scene.videoPrompt || scene.text,
              orientation
            );
            
            video = veoVideo;
            logger.debug({ sceneIndex: index, videoUrl: veoVideo.url }, "Video generated via NANO BANANA → VEO3 workflow");
          } else {
            // Standard VEO text-to-video or image-to-video generation
            video = await this.googleVeoApi.findVideo(
              scene.searchTerms,
              audioLength,
              excludeVideoIds,
              orientation,
              defaultTimeoutMs,
              0,
              scene.imageData?.data && scene.imageData?.mimeType ? scene.imageData as { data: string; mimeType: string } : undefined, // Pass image data if available
            );
          }
        } catch (error) {
          logger.warn(error, "Veo API failed, falling back to Pexels");
          video = await this.pexelsApi.findVideo(
            scene.searchTerms,
            audioLength,
            excludeVideoIds,
            orientation,
          );
        }
      } else if (videoSource === "leonardo" && this.leonardoApi) {
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
      } else if (videoSource === "both" && Math.random() > 0.5) {
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
                defaultTimeoutMs,
                0,
                scene.imageData?.data && scene.imageData?.mimeType ? scene.imageData as { data: string; mimeType: string } : undefined,
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
              defaultTimeoutMs,
              0,
              scene.imageData?.data && scene.imageData?.mimeType ? scene.imageData as { data: string; mimeType: string } : undefined,
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
        const downloadUrl = video.url.startsWith("http://") ? http : https;
        
        downloadUrl
          .get(video.url, (response: http.IncomingMessage) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302 || 
                response.statusCode === 303 || response.statusCode === 307 || 
                response.statusCode === 308) {
              const redirectUrl = response.headers.location;
              if (redirectUrl) {
                logger.debug(`Following redirect to: ${redirectUrl}`);
                fileStream.close();
                fs.unlinkSync(tempVideoPath);
                
                // Recursively follow the redirect
                const redirectProtocol = redirectUrl.startsWith("http://") ? http : https;
                redirectProtocol.get(redirectUrl, (redirectResponse: http.IncomingMessage) => {
                  if (redirectResponse.statusCode !== 200) {
                    reject(new Error(`Failed to download video: ${redirectResponse.statusCode}`));
                    return;
                  }
                  
                  const newFileStream = fs.createWriteStream(tempVideoPath);
                  redirectResponse.pipe(newFileStream);
                  
                  newFileStream.on("finish", () => {
                    newFileStream.close();
                    logger.debug(`Video downloaded successfully to ${tempVideoPath}`);
                    resolve();
                  });
                }).on("error", (err: Error) => {
                  fs.unlink(tempVideoPath, () => {});
                  logger.error(err, "Error downloading video from redirect:");
                  reject(err);
                });
                return;
              }
            }
            
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
    const hasVeo3Priority = metadata?.channel_config?.veo3_priority === true;
    
    // Use request-specific videoSource if provided, otherwise fall back to global config
    const videoSource = config.videoSource || this.config.videoSource;
    
    const isApiVideo = videoSource === "veo" || videoSource === "leonardo" || 
                      (videoSource === "both" && (this.googleVeoApi || this.leonardoApi));
    const isFFmpegMode = videoSource === "ffmpeg";
    
    // VEO3 mode: requires videoSource="veo" and scenes with image generation
    const hasValidVeo3Data = (videoSource === "veo" || hasVeo3Priority) && 
                           inputScenes.some(scene => scene.needsImageGeneration && scene.imageData);
    
    // Dynamic mode selection
    const shouldUseVeo3 = hasValidVeo3Data && isApiVideo && this.googleVeoApi;
    const shouldUseFallback = hasVeo3Priority && !hasValidVeo3Data;
    
    logger.info({ 
      hasVeo3Priority, 
      hasValidVeo3Data, 
      shouldUseVeo3, 
      shouldUseFallback,
      isFFmpegMode,
      isApiVideo,
      videoSource,
      hasGoogleVeoApi: !!this.googleVeoApi,
      scenesCount: scenes.length 
    }, "🔍 Dynamic mode selection");
    
    if (isFFmpegMode || shouldUseFallback) {
      // FFmpeg 모드 또는 VEO3 실패 시 fallback
      const outputLocation = path.join(this.config.videosDirPath, `${videoId}.mp4`);
      
      if (shouldUseFallback) {
        logger.warn({ videoId }, "VEO3 priority set but invalid data - falling back to FFmpeg mode");
      }
      
      // Check if this is NANO BANANA static video mode even for single scene
      const isNanoBananaMode = metadata?.mode === "nano-banana" || 
                              (config.videoSource === "ffmpeg" && inputScenes.some(s => s.needsImageGeneration));
      
      logger.info({
        isNanoBananaMode,
        metadataMode: metadata?.mode,
        videoSource: config.videoSource,
        hasNeedsImageGeneration: inputScenes.some(s => s.needsImageGeneration),
        sceneCount: scenes.length,
        videoId
      }, "🔍 Checking NANO BANANA mode in createShort");
      
      if (isNanoBananaMode) {
        logger.debug({ videoId, sceneCount: scenes.length }, "Processing NANO BANANA static video with FFmpeg");
        await this.processMultiSceneWithFFmpeg(scenes, outputLocation, orientation, config, metadata, videoId, inputScenes);
      } else if (scenes.length === 1) {
        logger.debug({ videoId }, "Processing single scene with FFmpeg");
        await this.processSingleSceneWithFFmpeg(scenes[0], outputLocation, totalDuration, orientation, config);
      } else {
        logger.debug({ videoId, sceneCount: scenes.length }, "Processing multi-scene video with FFmpeg");
        await this.processMultiSceneWithFFmpeg(scenes, outputLocation, orientation, config, metadata, videoId, inputScenes);
      }
    } else if (shouldUseVeo3 && scenes.length > 1) {
      // VEO3 + NANO BANANA 멀티씬 워크플로우
      logger.debug({ videoId, sceneCount: scenes.length }, "Using VEO3 + NANO BANANA multi-scene workflow");
      const outputLocation = path.join(this.config.videosDirPath, `${videoId}.mp4`);
      await this.processMultiSceneWithFFmpeg(scenes, outputLocation, orientation, config, metadata, videoId, inputScenes);
    } else if (shouldUseVeo3 || (isApiVideo && scenes.length === 1)) {
      // VEO3 + NANO BANANA 워크플로우 또는 API 비디오 단일 씬 처리
      const scene = scenes[0];
      const outputLocation = path.join(this.config.videosDirPath, `${videoId}.mp4`);
      
      if (shouldUseVeo3) {
        logger.debug({ videoId }, "Using VEO3 + NANO BANANA single-scene workflow");
      } else {
        logger.debug({ videoId }, "Using API-generated video directly with FFmpeg audio overlay");
      }
      
      await this.processSingleSceneWithFFmpeg(scene, outputLocation, totalDuration, orientation, config);
    } else {
      // Fallback to FFmpeg for any unsupported configuration
      logger.warn({ videoId }, "Unsupported configuration - falling back to FFmpeg mode");
      const outputLocation = path.join(this.config.videosDirPath, `${videoId}.mp4`);
      
      if (scenes.length === 1) {
        await this.processSingleSceneWithFFmpeg(scenes[0], outputLocation, totalDuration, orientation, config);
      } else {
        await this.processMultiSceneWithFFmpeg(scenes, outputLocation, orientation, config, metadata, videoId, inputScenes);
      }
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
    // Note: NANO BANANA → VEO3 workflow is now handled in createShort() function
    
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
   * NANO BANANA 정적 모드: 모든 이미지를 한번에 생성하고 하나의 정적 비디오로 만듦
   * 일반 모드: 각 씬을 개별적으로 처리한 후 concat으로 결합
   */
  private async processMultiSceneWithFFmpeg(
    scenes: any[],
    outputLocation: string,
    orientation: OrientationEnum,
    config: RenderConfig,
    metadata?: any,
    videoId?: string,
    inputScenes?: SceneInput[]
  ): Promise<void> {
    const sceneVideoPaths: string[] = [];
    const tempFilesToCleanup: string[] = [];
    const allCaptions: any[] = [];
    let cumulativeDuration = 0;

    // Create video-specific temp folder
    const videoTempDir = videoId
      ? path.join(this.config.tempDirPath, videoId)
      : path.join(this.config.tempDirPath, `video_${Date.now()}`);

    // Check if this is NANO BANANA static video mode
    // Use inputScenes if available for proper needsImageGeneration check
    const isNanoBananaStatic = NanoBananaStaticVideoHelper.isNanoBananaStaticVideo(
      config,
      metadata,
      inputScenes || scenes
    );

    try {
      // Ensure video-specific temp directory exists
      await fs.ensureDir(videoTempDir);
      logger.debug({ videoTempDir }, "Created video-specific temp directory");

      logger.info({
        isNanoBananaStatic,
        videoSource: config.videoSource,
        metadataMode: metadata?.mode,
        sceneCount: scenes.length,
        videoId,
        videoTempDir
      }, "🔍 Checking NANO BANANA static mode");

      if (isNanoBananaStatic) {
        // NANO BANANA 정적 비디오 모드: 모든 이미지를 한번에 생성
        logger.info({ videoId, videoTempDir }, "🎬 NANO BANANA static video mode: generating all images at once");

        // Check if imageGenerationService is available
        if (!this.imageGenerationService) {
          logger.error("ImageGenerationService is not initialized for NANO BANANA mode");
          throw new Error("ImageGenerationService is required for NANO BANANA static video mode");
        }

        // Step 1: Generate images for ALL scenes at once with videoId
        const imageDataList = await NanoBananaStaticVideoHelper.generateImagesForAllScenes(
          scenes,
          this.imageGenerationService,
          orientation,
          videoTempDir,  // Use video-specific temp directory
          videoId        // Pass videoId for proper folder structure
        );

        // Step 2: Generate TTS audio for all scenes and update durations
        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          if (!scene.audio && scene.text) {
            logger.debug({ sceneIndex: i }, "Generating TTS audio for scene");
            const audioResult = await this.generateTTSAudio(scene.text, config.voice);
            scene.audio = audioResult;
            imageDataList[i].duration = audioResult.duration;
            logger.debug({ sceneIndex: i, duration: audioResult.duration }, "TTS audio generated");
          }
        }

        // Step 3: Create one static video from all images
        const tempVideoPath = path.join(videoTempDir, `nano_banana_static_${cuid()}.mp4`);
        const dimensions = orientation === OrientationEnum.portrait ? "1080x1920" : "1920x1080";

        await this.ffmpeg.createStaticVideoFromMultipleImages(
          imageDataList,
          tempVideoPath,
          dimensions
        );

        logger.info("✅ Static video created from all NANO BANANA images");

        // Step 4: Combine with audio
        const audioFiles: string[] = [];
        for (const scene of scenes) {
          if (scene.audio?.url) {
            const audioFileName = scene.audio.url.split('/').pop();
            const audioPath = path.join(this.config.tempDirPath, audioFileName);
            if (fs.existsSync(audioPath)) {
              audioFiles.push(audioPath);
            }
          }
        }

        // Concatenate audio files if multiple
        let finalAudioPath: string;
        if (audioFiles.length > 1) {
          finalAudioPath = path.join(this.config.tempDirPath, `combined_audio_${cuid()}.mp3`);
          // TODO: Implement audio concatenation
          finalAudioPath = audioFiles[0]; // Temporary: use first audio
        } else {
          finalAudioPath = audioFiles[0];
        }

        // Combine video with audio and add subtitles
        const totalDuration = imageDataList.reduce((sum, img) => sum + img.duration, 0);
        await this.ffmpeg.combineVideoWithAudioAndCaptions(
          tempVideoPath,
          finalAudioPath,
          allCaptions,
          outputLocation,
          totalDuration,
          orientation,
          config,
          false // Add subtitles
        );

        // Cleanup temp files
        await NanoBananaStaticVideoHelper.cleanupTempImages(
          imageDataList.map(img => img.imagePath)
        );
        if (fs.existsSync(tempVideoPath)) {
          fs.unlinkSync(tempVideoPath);
        }

        logger.info("🎉 NANO BANANA static video processing complete");
        return;
      }

      // 일반 모드: 각 씬을 개별적으로 처리 (기존 로직)
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneVideoPath = path.join(
          videoTempDir,
          `scene_${i}.mp4`  // Simplified naming since we have video-specific folder
        );

        logger.debug({ sceneIndex: i, sceneVideoPath }, `Processing scene ${i + 1}/${scenes.length}`);

        // Check if scene needs image generation
        if (scene.needsImageGeneration && scene.imageData && !scene.video) {
          const isNanoBananaMode = config.videoSource === "ffmpeg" || metadata?.mode === "nano-banana";

          if (isNanoBananaMode) {
            // NANO BANANA static mode: generate image and create static video
            logger.debug({ sceneIndex: i }, "NANO BANANA mode: generating static video from image");

            const imageGenData = {
              prompt: scene.imageData.prompt || scene.text,
              style: scene.imageData.style || "cinematic",
              mood: scene.imageData.mood || "dynamic"
            };
            const generatedImage = await this.generateImageWithNanoBanana(imageGenData, orientation);

            // Create static video from image
            const tempImagePath = path.join(videoTempDir, `scene_${i}_image.png`);
            const tempStaticVideoPath = path.join(videoTempDir, `scene_${i}_static.mp4`);

            // Save image to file
            const imageBuffer = Buffer.from(generatedImage.data, 'base64');
            fs.writeFileSync(tempImagePath, imageBuffer);

            // Create static video with scene duration
            const sceneDuration = scene.audio?.duration || 3;
            const dimensions = orientation === OrientationEnum.portrait ? "1080x1920" : "1920x1080";

            await this.ffmpeg.createStaticVideoFromImage(
              tempImagePath,
              tempStaticVideoPath,
              sceneDuration,
              dimensions
            );

            // Clean up temp image
            if (fs.existsSync(tempImagePath)) {
              fs.unlinkSync(tempImagePath);
            }

            scene.video = tempStaticVideoPath;
            logger.debug({ sceneIndex: i, videoPath: tempStaticVideoPath }, "Static video created from NANO BANANA image");

          } else if (config.videoSource === "veo") {
            // VEO3 mode: generate dynamic video
            logger.debug({ sceneIndex: i }, "VEO3 mode: generating image and dynamic video");

            const imageGenData = {
              prompt: scene.imageData.prompt || scene.text,
              style: scene.imageData.style || "cinematic",
              mood: scene.imageData.mood || "dynamic"
            };
            const generatedImage = await this.generateImageWithNanoBanana(imageGenData, orientation);

            const veoVideo = await this.generateVideoFromImage(
              generatedImage,
              scene.videoPrompt || scene.text,
              orientation
            );

            scene.video = veoVideo.url;
            logger.debug({ sceneIndex: i, videoUrl: veoVideo.url }, "Video generated via VEO3");
          } else {
            logger.warn({ sceneIndex: i }, "Scene needs image generation but no valid video source configured");
          }
        }
        
        // Generate TTS audio if not exists
        if (!scene.audio && scene.text) {
          logger.debug({ sceneIndex: i }, "Generating TTS audio for scene");
          const audioResult = await this.generateTTSAudio(scene.text, config.voice);
          scene.audio = audioResult;
          logger.debug({ sceneIndex: i, duration: audioResult.duration }, "TTS audio generated");
        }
        
        // 개별 씬에 대한 처리 시간 계산 (오디오 길이 기준)
        const sceneDuration = scene.audio?.duration || 3;
        
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
        
        // Use Whisper's actual audio end time instead of TTS estimation for accurate timing
        if (scene.captions && scene.captions.length > 0) {
          const lastCaption = scene.captions[scene.captions.length - 1];
          const actualSceneDuration = lastCaption.endMs / 1000;
          cumulativeDuration += actualSceneDuration;
          
          logger.debug({
            sceneIndex: i,
            ttsEstimated: sceneDuration,
            whisperActual: actualSceneDuration,
            timingDifference: Math.abs(sceneDuration - actualSceneDuration).toFixed(3) + 's',
            cumulativeAccuracy: cumulativeDuration.toFixed(3) + 's'
          }, "Using Whisper-based accurate scene timing");
        } else {
          cumulativeDuration += sceneDuration;  // Fallback to TTS estimation
          logger.debug({ sceneIndex: i, fallbackToTTS: true }, "No captions available, using TTS duration estimate");
        }
        
        logger.debug({ sceneIndex: i, sceneVideoPath }, `Scene ${i + 1} processed successfully`);
      }

      // 모든 씬 비디오를 하나로 결합
      logger.debug({ sceneVideoPaths, outputLocation }, "Concatenating scene videos");
      const tempConcatenatedPath = path.join(videoTempDir, `temp_concat.mp4`);
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

      // Clean up video-specific temp directory (but preserve for NANO BANANA mode)
      try {
        if (fs.existsSync(videoTempDir) && !isNanoBananaStatic) {
          fs.removeSync(videoTempDir);
          logger.debug({ videoTempDir, videoId }, "Cleaned up video-specific temp directory");
        } else if (isNanoBananaStatic) {
          logger.debug({ videoTempDir, videoId }, "Preserving video-specific temp directory for NANO BANANA mode");
        }
      } catch (cleanupError) {
        logger.warn(cleanupError, `Could not clean up video temp directory: ${videoTempDir}`);
      }
    }
  }

  /**
   * Generate multiple images using NANO BANANA service for consistency
   */
  private async generateMultipleImagesWithNanoBanana(
    imageData: { prompt: string; style: string; mood: string },
    numberOfImages: number = 4,
    orientation: OrientationEnum = OrientationEnum.portrait,
    videoId?: string,
    sceneIndex?: number
  ): Promise<Array<{ data: string; mimeType: string }>> {
    try {
      if (!this.imageGenerationService) {
        throw new Error("Image Generation Service not available");
      }

      logger.debug({ 
        prompt: imageData.prompt, 
        style: imageData.style, 
        mood: imageData.mood,
        numberOfImages 
      }, "Generating multiple images with NANO BANANA for consistency");

      // Combine prompt with style and mood for better results
      const enhancedPrompt = `${imageData.prompt}. Style: ${imageData.style}. Mood: ${imageData.mood}`;
      
      // Set aspect ratio based on video orientation
      const aspectRatio = orientation === OrientationEnum.portrait ? "9:16" : "16:9";
      
      const result = await this.imageGenerationService.generateImages({
        prompt: enhancedPrompt,
        numberOfImages: numberOfImages,
        aspectRatio: aspectRatio
      }, videoId);

      if (!result.success || !result.images || result.images.length === 0) {
        throw new Error("No images generated by NANO BANANA");
      }

      // Save all images using the organized folder structure
      const setName = `nano-banana-consistency-set-${Date.now()}`;
      const imageSetResult = await saveImageSet(
        result.images.map((img, index) => ({
          data: img.data,
          filename: img.filename,
          prompt: enhancedPrompt
        })),
        this.config.tempDirPath,
        {
          setName,
          category: 'nano-banana-veo3',
          description: `Generated ${result.images.length} consistent images for VEO3 video`
        }
      );

      logger.info({ 
        folderPath: imageSetResult.folderPath,
        imageCount: result.images.length
      }, "Multiple images saved for VEO3 consistency");

      // Return images as base64 for VEO3
      return result.images.map(img => ({
        data: img.data.toString('base64'), // Convert Buffer to base64
        mimeType: img.mimeType || 'image/png'
      }));
      
    } catch (error) {
      logger.error(error, "Failed to generate multiple images with NANO BANANA");
      throw error;
    }
  }

  /**
   * Generate image using NANO BANANA service
   */
  private async generateImageWithNanoBanana(
    imageData: { prompt: string; style: string; mood: string },
    orientation: OrientationEnum = OrientationEnum.portrait,
    videoId?: string,
    sceneIndex?: number
  ): Promise<{ data: string; mimeType: string }> {
    try {
      if (!this.imageGenerationService) {
        throw new Error("Image Generation Service not available");
      }

      logger.debug({ prompt: imageData.prompt, style: imageData.style, mood: imageData.mood }, 
        "Generating image with NANO BANANA");

      // Combine prompt with style and mood for better results
      const enhancedPrompt = `${imageData.prompt}. Style: ${imageData.style}. Mood: ${imageData.mood}`;
      
      // Set aspect ratio based on video orientation
      const aspectRatio = orientation === OrientationEnum.portrait ? "9:16" : "16:9";
      
      const result = await this.imageGenerationService.generateImages({
        prompt: enhancedPrompt,
        numberOfImages: 1,
        aspectRatio: aspectRatio
      }, videoId, sceneIndex);

      if (!result.success || !result.images || result.images.length === 0) {
        throw new Error("No images generated by NANO BANANA");
      }

      const generatedImage = result.images[0];
      
      logger.debug({ 
        tempDirPath: this.config.tempDirPath,
        generatedImageFilename: generatedImage.filename,
        generatedImageSize: generatedImage.data.length
      }, "🔍 Before saving with organized folder structure");

      // Save to videoId folder if videoId is provided (for VEO3 workflow)
      if (videoId && sceneIndex !== undefined) {
        const videoTempDir = path.join(this.config.tempDirPath, videoId);
        await fs.ensureDir(videoTempDir);
        
        const simpleFilename = `scene_${sceneIndex + 1}_${videoId}.png`;
        const savedImagePath = path.join(videoTempDir, simpleFilename);
        
        logger.debug({
          videoId,
          sceneIndex,
          videoTempDir,
          simpleFilename,
          savedImagePath
        }, "💾 Saving VEO3 image to videoId folder");
        
        await fs.writeFile(savedImagePath, generatedImage.data);
        
        // Verify file was saved 
        const fileExists = await fs.pathExists(savedImagePath);
        const fileStats = fileExists ? await fs.stat(savedImagePath) : null;

        logger.info({
          sceneIndex: sceneIndex + 1,
          imagePath: savedImagePath,
          filename: generatedImage.filename,
          fileExists,
          fileSize: fileStats?.size,
          imageSize: generatedImage.data.length,
          videoTempDir
        }, "✅ VEO3 image generated and saved to videoId folder");
      } else {
        // Save images using the organized folder structure (same as /api/images/generate)
        const setName = `nano-banana-set-${Date.now()}`;
        logger.debug({ setName, category: 'nano-banana' }, "🔍 Calling saveImageSet with parameters");
        
        await saveImageSet(
          [{
            data: generatedImage.data,
            filename: generatedImage.filename,
            prompt: enhancedPrompt
          }],
          this.config.tempDirPath,
          {
            setName,
            category: 'nano-banana',
            description: `Generated image with NANO BANANA for video creation`,
            videoId
          }
        );
        
        logger.debug("🔍 saveImageSet completed successfully");
      }
      
      // Convert Buffer to base64 string
      const imageBase64 = generatedImage.data.toString('base64');
      
      logger.debug({ 
        imageSize: generatedImage.data.length,
        mimeType: generatedImage.mimeType
      }, "✅ Image generated and saved successfully with NANO BANANA in organized folder");

      return {
        data: imageBase64,
        mimeType: generatedImage.mimeType || "image/png"
      };
      
    } catch (error) {
      logger.error(error, "Failed to generate image with NANO BANANA");
      throw new Error(`Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate video from image using Veo API
   */
  private async generateVideoFromImage(
    imageData: { data: string; mimeType: string },
    prompt: string,
    orientation: OrientationEnum
  ): Promise<{ url: string; id: string }> {
    try {
      // Use Veo API to generate video from image
      if (this.googleVeoApi) {
        const video = await this.googleVeoApi.findVideo(
          [prompt], // searchTerms
          5, // minDurationSeconds
          [], // excludeIds
          orientation,
          60000, // timeout
          0, // retryCounter
          imageData // initialImage
        );
        
        return {
          url: video.url,
          id: video.id
        };
      }
      
      throw new Error("Veo API not available for image-to-video generation");
    } catch (error) {
      logger.error(error, "Failed to generate video from image");
      throw new Error(`Video generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate TTS audio for text
   */
  private async generateTTSAudio(
    text: string,
    voice?: Voices
  ): Promise<{ url: string; duration: number }> {
    try {
      // Generate TTS audio - TTSProvider returns {audio: ArrayBuffer, audioLength: number}
      const ttsResult = await this.ttsProvider.generate(text, voice || 'am_adam');
      
      // Save audio to file
      const audioFileName = `tts_${cuid()}.mp3`;
      const audioPath = path.join(this.config.tempDirPath, audioFileName);
      
      // Convert ArrayBuffer to file using FFmpeg
      const finalAudioPath = await this.ffmpeg.saveToMp3(ttsResult.audio, audioPath);
      
      // Create URL for the audio file
      const fileName = path.basename(finalAudioPath);
      const audioUrl = `/api/tmp/${fileName}`;
      
      return {
        url: audioUrl,
        duration: ttsResult.audioLength / 1000 // Convert ms to seconds
      };
    } catch (error) {
      logger.error(error, "Failed to generate TTS audio");
      throw new Error(`TTS generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get duration from audio/video file path
   */
  private async getDurationFromPath(filePath: string): Promise<number> {
    try {
      // For now, use a simple estimate based on file size or return default
      // TODO: Implement actual FFmpeg duration detection
      const stats = fs.statSync(filePath);
      const fileSizeKB = stats.size / 1024;
      
      // Rough estimate: ~16KB per second for typical TTS audio
      const estimatedDuration = Math.max(fileSizeKB / 16, 1);
      
      logger.debug({ filePath, fileSizeKB, estimatedDuration }, "Estimated audio duration from file size");
      return estimatedDuration;
    } catch (error) {
      logger.warn(error, `Could not get duration for ${filePath}, using default`);
      return 3; // Default duration in seconds
    }
  }

  /**
   * Create static video from generated image using FFmpeg
   */
  private async createStaticVideoFromImage(
    imageData: { data: string; mimeType: string },
    duration: number,
    orientation: OrientationEnum,
    outputPath: string
  ): Promise<void> {
    try {
      logger.debug({ duration, orientation, outputPath }, "Creating static video from generated image");

      // Convert base64 image to buffer
      const imageBuffer = Buffer.from(imageData.data, 'base64');
      
      // Save image to temporary file
      const tempImageId = cuid();
      const tempImagePath = path.join(this.config.tempDirPath, `${tempImageId}.png`);
      fs.writeFileSync(tempImagePath, imageBuffer);

      // Use FFmpeg to create static video from image
      const dimensions = orientation === OrientationEnum.portrait ? "1080x1920" : "1920x1080";
      
      await this.ffmpeg.createStaticVideoFromImage(
        tempImagePath,
        outputPath,
        duration,
        dimensions
      );

      // Clean up temporary image file
      if (fs.existsSync(tempImagePath)) {
        fs.unlinkSync(tempImagePath);
      }

      logger.debug({ outputPath }, "Static video created successfully from generated image");
    } catch (error) {
      logger.error(error, "Failed to create static video from image");
      throw new Error(`Static video creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
