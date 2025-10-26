import path from "path";
import { OrientationEnum } from "../types/shorts";
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
import { NanoBananaStaticVideoHelper } from "./nanoBananaStaticVideo";
import { Config } from "../config";
import { logger } from "../logger";
import { MusicManager } from "./music";

// Import new modules
import { VideoQueue } from "./queue/VideoQueue";
import { QueueItem } from "./queue/QueueItem";
import { PexelsVideoSource } from "./video-sources/PexelsVideoSource";
import { VeoVideoSource } from "./video-sources/VeoVideoSource";
import { LeonardoVideoSource } from "./video-sources/LeonardoVideoSource";
import { NanoBananaVideoSource } from "./video-sources/NanoBananaVideoSource";
import { AudioProcessor } from "./processors/AudioProcessor";
import { VideoProcessor } from "./processors/VideoProcessor";
import { SingleSceneWorkflow } from "./workflows/SingleSceneWorkflow";
import { MultiSceneWorkflow } from "./workflows/MultiSceneWorkflow";
import { NanoBananaStaticWorkflow } from "./workflows/NanoBananaStaticWorkflow";
import { StatusManager } from "./managers/StatusManager";
import { CallbackManager } from "./managers/CallbackManager";
import { FileManager } from "./managers/FileManager";
import { ErrorHandler } from "./utils/ErrorHandler";
import { DEFAULT_VOICE } from "./utils/Constants";
import type { WorkflowManager } from "../workflow/WorkflowManager";
import type { WebhookManager } from "../workflow/WebhookManager";
import { VideoWorkflowState } from "../workflow/types";
import type { YouTubeUploader } from "../youtube-upload/services/YouTubeUploader";
import type { N8NYouTubeUploadConfig } from "../server/parsers/N8NInterfaces";
import crypto from "crypto";

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

export class ShortCreatorRefactored {
  private videoQueue!: VideoQueue;
  private statusManager!: StatusManager;
  private callbackManager!: CallbackManager;
  private fileManager!: FileManager;

  // Video Sources
  private pexelsVideoSource!: PexelsVideoSource;
  private veoVideoSource?: VeoVideoSource;
  private leonardoVideoSource?: LeonardoVideoSource;
  private nanoBananaVideoSource?: NanoBananaVideoSource;

  // Processors
  private audioProcessor!: AudioProcessor;
  private videoProcessor!: VideoProcessor;

  // Workflows
  private singleSceneWorkflow!: SingleSceneWorkflow;
  private multiSceneWorkflow!: MultiSceneWorkflow;
  private nanoBananaStaticWorkflow?: NanoBananaStaticWorkflow;

  // Image cache for sharing generated images across scenes
  private imageCache: Map<string, any[]> = new Map();

  // Workflow managers (optional - only available if server provides them)
  private workflowManager?: WorkflowManager;
  private webhookManager?: WebhookManager;
  private youtubeUploader?: YouTubeUploader;

  constructor(
    private config: Config,
    private ttsProvider: GoogleTTS | ElevenLabsTTS | TTSProvider,
    private whisper: Whisper,
    private ffmpeg: FFMpeg,
    private pexelsApi: PexelsAPI,
    private musicManager: MusicManager,
    private googleVeoApi?: GoogleVeoAPI,
    private leonardoApi?: LeonardoAI,
    private imageGenerationService?: ImageGenerationService,
    workflowManager?: WorkflowManager,
    webhookManager?: WebhookManager,
    youtubeUploader?: YouTubeUploader
  ) {
    this.workflowManager = workflowManager;
    this.webhookManager = webhookManager;
    this.youtubeUploader = youtubeUploader;
    this.initializeComponents();
  }

  private initializeComponents(): void {
    // Initialize managers
    this.fileManager = new FileManager(this.config.tempDirPath);
    this.callbackManager = new CallbackManager(this.config);

    // Initialize queue
    this.videoQueue = new VideoQueue(this.processVideo.bind(this));
    this.statusManager = new StatusManager(this.videoQueue, this.config.videosDirPath);

    // Initialize video sources
    this.pexelsVideoSource = new PexelsVideoSource(this.pexelsApi);
    if (this.googleVeoApi) {
      this.veoVideoSource = new VeoVideoSource(this.googleVeoApi);
    }
    if (this.leonardoApi) {
      this.leonardoVideoSource = new LeonardoVideoSource(this.leonardoApi);
    }
    if (this.imageGenerationService) {
      this.nanoBananaVideoSource = new NanoBananaVideoSource(this.imageGenerationService);
    }

    // Initialize processors  
    this.audioProcessor = new AudioProcessor(
      this.ttsProvider as TTSProvider,
      this.whisper,
      this.ffmpeg,
      {
        tempDirPath: this.config.tempDirPath,
        port: this.config.port
      }
    );

    this.videoProcessor = new VideoProcessor(
      this.ffmpeg,
      {
        tempDirPath: this.config.tempDirPath,
        videosDirPath: this.config.videosDirPath
      }
    );

    // Initialize workflows
    this.singleSceneWorkflow = new SingleSceneWorkflow(this.videoProcessor);
    this.multiSceneWorkflow = new MultiSceneWorkflow(this.videoProcessor);
    if (this.nanoBananaVideoSource) {
      this.nanoBananaStaticWorkflow = new NanoBananaStaticWorkflow(
        this.videoProcessor,
        this.nanoBananaVideoSource,
        this.imageGenerationService
      );
    }
  }

  public status(id: string): VideoStatus {
    return this.statusManager.getStatus(id);
  }

  public addToQueue(
    sceneInput: SceneInput[],
    config: RenderConfig,
    callbackUrl?: string,
    metadata?: any
  ): string {
    const videoId = this.videoQueue.addToQueue(sceneInput, config, callbackUrl, metadata);

    // Auto-register webhook for N8N integration
    if (callbackUrl && this.webhookManager) {
      try {
        this.webhookManager.registerWebhook(
          callbackUrl,
          ['video.completed', 'video.failed'],
          'n8n-auto-registered'
        );
        logger.info({ videoId, callbackUrl }, '🔔 Webhook auto-registered for video');
      } catch (error) {
        logger.warn({ videoId, callbackUrl, error }, '⚠️ Failed to auto-register webhook');
      }
    }

    return videoId;
  }

  public getDetailedStatus(videoId: string): any {
    return this.statusManager.getDetailedStatus(videoId);
  }

  public deleteVideo(videoId: string): void {
    this.statusManager.deleteVideo(videoId);
  }

  public getVideo(videoId: string): Buffer {
    return this.statusManager.getVideo(videoId);
  }

  public listAllVideos(): { id: string; status: VideoStatus }[] {
    return this.statusManager.listAllVideos();
  }

  public ListAvailableMusicTags(): MusicTag[] {
    const tags = new Set<MusicTag>();
    this.musicManager.musicList().forEach((music) => {
      tags.add(music.mood as MusicTag);
    });
    return Array.from(tags.values());
  }

  public ListAvailableVoices(): string[] {
    return this.ttsProvider.listAvailableVoices();
  }

  public getVideoPath(videoId: string): string {
    return this.statusManager.getVideoPath(videoId);
  }

  private async processVideo(item: QueueItem): Promise<void> {
    try {
      await this.createShort(item.id, item.sceneInput, item.config, item.metadata);
      logger.debug({ id: item.id }, "Video created successfully");

      // Send success callback
      if (item.callbackUrl) {
        await this.callbackManager.sendCompletionCallback(item.callbackUrl, {
          videoId: item.id,
          sceneInput: item.sceneInput,
          config: item.config,
          originalMetadata: item.metadata,
          status: 'completed'
        });
      }

      // YouTube auto-upload if enabled
      const youtubeUpload = item.metadata?.youtubeUpload as N8NYouTubeUploadConfig | undefined;
      if (youtubeUpload?.enabled && this.youtubeUploader) {
        await this.handleYouTubeUpload(item.id, youtubeUpload, item.metadata);
      }
    } catch (error: unknown) {
      logger.error(error, "Error creating video");

      // Update workflow: Failed
      if (this.workflowManager) {
        this.workflowManager.updateWorkflowState(item.id, VideoWorkflowState.FAILED, {
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          }
        });

        // Trigger failure webhook
        if (this.webhookManager) {
          await this.webhookManager.triggerWebhook({
            eventId: `evt_${crypto.randomBytes(16).toString('hex')}`,
            eventType: 'video.failed',
            timestamp: new Date().toISOString(),
            data: {
              videoId: item.id,
              error: {
                message: error instanceof Error ? error.message : String(error)
              }
            }
          });
        }
      }

      // Send error callback
      if (item.callbackUrl) {
        const errorType = ErrorHandler.categorizeError(error);
        await this.callbackManager.sendCompletionCallback(item.callbackUrl, {
          videoId: item.id,
          sceneInput: item.sceneInput,
          config: item.config,
          originalMetadata: item.metadata,
          status: 'failed',
          error,
          errorType
        });
      }
      throw error; // Re-throw for queue handling
    }
  }

  private async createShort(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig,
    metadata?: any,
  ): Promise<string> {
    logger.debug({ inputScenes, config }, "Creating short video");

    // Create workflow tracking
    if (this.workflowManager) {
      this.workflowManager.createWorkflow(videoId, {
        videoSource: config?.videoSource || this.config.videoSource,
        ttsProvider: this.config.ttsProvider,
        orientation: config.orientation,
        sceneCount: inputScenes.length
      });
    }

    const scenes: Scene[] = [];
    const excludeVideoIds: string[] = [];
    const tempFiles: string[] = [];

    // Clear image cache for new video creation
    this.imageCache.clear();

    const orientation: OrientationEnum = config.orientation || OrientationEnum.portrait;

    // Process each scene
    for (let index = 0; index < inputScenes.length; index++) {
      const scene = inputScenes[index];

      // Update workflow: Generating TTS
      if (this.workflowManager) {
        this.workflowManager.updateWorkflowState(videoId, VideoWorkflowState.GENERATING_TTS, {
          progress: Math.round((index / inputScenes.length) * 15),
          details: `Generating TTS for scene ${index + 1}/${inputScenes.length}`
        });
      }

      // Always generate TTS audio first (for controlled narration)
      const audioResult = await this.audioProcessor.generateTTSAudio(
        scene.text,
        config.voice ?? DEFAULT_VOICE
      );

      // Update workflow: Transcribing
      if (this.workflowManager) {
        this.workflowManager.updateWorkflowState(videoId, VideoWorkflowState.TRANSCRIBING, {
          progress: Math.round((index / inputScenes.length) * 30),
          details: `Transcribing audio for scene ${index + 1}/${inputScenes.length}`
        });
      }

      // Update workflow: Searching video
      if (this.workflowManager) {
        this.workflowManager.updateWorkflowState(videoId, VideoWorkflowState.SEARCHING_VIDEO, {
          progress: Math.round(((index / inputScenes.length) * 45) + 30),
          details: `Searching video for scene ${index + 1}/${inputScenes.length}`
        });
      }

      // Determine video source and generate video
      const video = await this.generateVideoForScene(
        scene,
        audioResult.duration,
        excludeVideoIds,
        orientation,
        config,
        metadata,
        videoId,
        index
      );

      // Update workflow: Generating video
      if (this.workflowManager) {
        this.workflowManager.updateWorkflowState(videoId, VideoWorkflowState.GENERATING_VIDEO, {
          progress: Math.round(((index / inputScenes.length) * 60) + 40),
          details: `Generating video for scene ${index + 1}/${inputScenes.length}`
        });
      }

      // NANO BANANA static mode: Add scene without video download
      if (video.url.startsWith('nano-banana://')) {
        logger.debug({ sceneIndex: index, videoId }, "NANO BANANA static mode: adding scene without video download");

        scenes.push({
          captions: audioResult.captions || [],
          video: video.url, // Keep the nano-banana:// URL
          audio: audioResult,
        });
      } else {
        // Download video for VEO/Pexels modes
        const tempVideoPath = this.videoProcessor.createTempPath(`${videoId}_scene_${index}.mp4`);

        logger.info({
          sceneIndex: index,
          videoId,
          videoUrl: video.url.substring(0, 100) + "...",
          tempVideoPath
        }, "⬇️ Downloading video from VEO API");

        const downloadStartTime = Date.now();
        await this.fileManager.downloadFile(video.url, tempVideoPath);
        const downloadTimeSeconds = Math.floor((Date.now() - downloadStartTime) / 1000);

        const videoStats = await this.fileManager.getFileStats(tempVideoPath);

        logger.info({
          sceneIndex: index,
          videoId,
          tempVideoPath,
          videoSize: videoStats?.size || 0,
          downloadTimeSeconds
        }, `✅ Video downloaded successfully (${(videoStats?.size || 0) / 1024} KB in ${downloadTimeSeconds}s)`);

        tempFiles.push(tempVideoPath);

        scenes.push({
          captions: audioResult.captions || [],
          video: `http://localhost:${this.config.port}/api/tmp/${tempVideoPath.split('/').pop()}`,
          audio: audioResult,
        });
      }

      excludeVideoIds.push(video.id);
    }

    // Update workflow: Processing video
    if (this.workflowManager) {
      this.workflowManager.updateWorkflowState(videoId, VideoWorkflowState.PROCESSING_VIDEO, {
        progress: 80,
        details: 'Processing final video with FFmpeg'
      });
    }

    // Choose appropriate workflow
    const workflowContext = {
      videoId,
      orientation,
      config,
      systemConfig: this.config, // Pass full Config object for VEO3 settings
      metadata
    };

    let result;
    if (this.shouldUseNanoBananaStaticWorkflow(config, metadata, inputScenes)) {
      if (!this.nanoBananaStaticWorkflow) {
        throw new Error("NANO BANANA static workflow not available");
      }
      result = await this.nanoBananaStaticWorkflow.process(scenes, inputScenes, workflowContext);
    } else if (scenes.length === 1) {
      result = await this.singleSceneWorkflow.process(scenes, inputScenes, workflowContext);
    } else {
      result = await this.multiSceneWorkflow.process(scenes, inputScenes, workflowContext);
    }

    // DISABLED: Keep temp files for debugging/verification
    // Cleanup temp files
    // await this.fileManager.cleanupFiles(tempFiles);
    logger.debug({ tempFiles, count: tempFiles.length }, "✅ Temp files preserved for verification");

    // Update workflow: Completed
    if (this.workflowManager) {
      this.workflowManager.updateWorkflowState(videoId, VideoWorkflowState.COMPLETED, {
        progress: 100,
        details: 'Video generation completed successfully'
      });

      // Move to history
      this.workflowManager.completeWorkflow(videoId);

      // Trigger webhook
      if (this.webhookManager) {
        const videoPath = this.getVideoPath(videoId);
        await this.webhookManager.triggerWebhook({
          eventId: `evt_${crypto.randomBytes(16).toString('hex')}`,
          eventType: 'video.completed',
          timestamp: new Date().toISOString(),
          data: {
            videoId,
            videoPath,
            metadata: {
              sceneCount: inputScenes.length,
              orientation: config.orientation,
              videoSource: config?.videoSource || this.config.videoSource
            }
          }
        });
      }
    }

    return videoId;
  }

  private async generateVideoForScene(
    scene: SceneInput,
    audioLength: number,
    excludeVideoIds: string[],
    orientation: OrientationEnum,
    config: RenderConfig,
    metadata?: any,
    videoId?: string,
    sceneIndex?: number
  ): Promise<{ url: string; width: number; height: number; id: string }> {
    const videoSource = config?.videoSource || this.config.videoSource;

    // Handle VEO3 mode: NanoBanana image generation → VEO3 image-to-video
    if (metadata?.mode === "veo3" && this.imageGenerationService && this.veoVideoSource) {
      logger.info({
        sceneIndex,
        videoId,
        mode: metadata.mode,
        audioLength
      }, "🎬 VEO3 mode: generating image with NanoBanana then video with VEO2/3");

      // 1. Generate image with NanoBanana
      const imageData = scene.imageData || {
        prompt: scene.text,
        style: "cinematic",
        mood: "dynamic"
      };

      const enhancedPrompt = `${imageData.prompt || scene.text}. Style: ${imageData.style || "cinematic"}. Mood: ${imageData.mood || "dynamic"}`;
      const aspectRatio = orientation === OrientationEnum.portrait ? "9:16" : "16:9";

      logger.debug({
        sceneIndex,
        videoId,
        enhancedPrompt,
        aspectRatio
      }, "📝 Step 1/4: Preparing NANO BANANA image generation");

      this.imageGenerationService.setModel(ImageModelType.NANO_BANANA);

      const imageResult = await this.imageGenerationService.generateImages({
        prompt: enhancedPrompt,
        numberOfImages: 1,
        aspectRatio: aspectRatio as "9:16" | "16:9"
      }, videoId, sceneIndex);

      if (!imageResult.success || !imageResult.images || imageResult.images.length === 0) {
        throw new Error("Failed to generate image with NanoBanana for VEO3");
      }

      const generatedImage = imageResult.images[0];
      logger.info({
        sceneIndex,
        imageSize: generatedImage.data.length,
        mimeType: generatedImage.mimeType
      }, "✅ Step 2/4: NANO BANANA image generated successfully");

      // IMPORTANT: Save image to temp folder (videoId folder) for later use
      const videoTempDir = this.videoProcessor.createVideoTempDir(videoId!);
      await this.fileManager.ensureDir(videoTempDir);

      const simpleFilename = `scene_${(sceneIndex ?? 0) + 1}_${videoId}.png`;
      const savedImagePath = path.join(videoTempDir, simpleFilename);

      await this.fileManager.writeFile(savedImagePath, generatedImage.data);

      logger.info({
        sceneIndex,
        savedImagePath,
        videoTempDir,
        fileSize: generatedImage.data.length
      }, "✅ Step 3/4: Image saved to temp folder");

      // Create motion prompt for VEO2/3 image-to-video
      // Priority: scene.imagePrompt (from N8N) > videoPrompt > imageData.prompt > scene.searchTerms
      const motionPrompt = (scene as any).imagePrompt  // N8N sends image_prompt field
        || scene.videoPrompt
        || imageData.prompt
        || (scene.searchTerms && scene.searchTerms.length > 0 ? scene.searchTerms.join(' ') : 'smooth camera movement with cinematic depth');

      logger.info({
        sceneIndex,
        videoId,
        audioLength,
        orientation,
        imageBase64Length: generatedImage.data.toString('base64').length,
        motionPromptLength: motionPrompt.length,
        motionPromptPreview: motionPrompt.substring(0, 100) + "...",
        hasImagePrompt: !!(scene as any).imagePrompt
      }, "🎬 Step 4/4: Starting VEO2/3 image-to-video conversion with motion prompt");

      // 2. Generate video from image using VEO3
      const veoResult = await this.veoVideoSource.findVideo({
        searchTerms: [motionPrompt], // Use motion prompt instead of empty searchTerms
        minDurationSeconds: audioLength,
        excludeVideoIds,
        orientation,
        initialImage: {
          data: generatedImage.data.toString('base64'),
          mimeType: generatedImage.mimeType || 'image/png'
        }
      });

      logger.info({
        sceneIndex,
        videoId,
        videoUrl: veoResult.url,
        videoWidth: veoResult.width,
        videoHeight: veoResult.height
      }, "✅ Step 4/4: VEO2/3 video generated successfully");

      return veoResult;
    }

    // Handle NANO BANANA mode (static video)
    if (this.shouldUseNanoBanana(scene, config, metadata)) {
      if (!this.nanoBananaVideoSource) {
        throw new Error("NANO BANANA video source not available");
      }

      const imageData = scene.imageData || {
        prompt: scene.text,
        style: "cinematic",
        mood: "dynamic"
      };

      const nanoBananaParams = {
        searchTerms: scene.searchTerms,
        minDurationSeconds: audioLength,
        excludeVideoIds,
        orientation,
        imageData: {
          prompt: imageData.prompt || scene.text,
          style: imageData.style || "cinematic",
          mood: imageData.mood || "dynamic"
        },
        videoId,
        sceneIndex
      };

      return await this.nanoBananaVideoSource.generateStaticVideo(nanoBananaParams);
    }

    // Handle other video sources
    const searchParams = {
      searchTerms: scene.searchTerms,
      minDurationSeconds: audioLength,
      excludeVideoIds,
      orientation,
      initialImage: scene.imageData?.data && scene.imageData?.mimeType 
        ? scene.imageData as { data: string; mimeType: string } 
        : undefined
    };

    if (videoSource === "veo" && this.veoVideoSource) {
      try {
        return await this.veoVideoSource.findVideo(searchParams);
      } catch (error) {
        logger.warn(error, "Veo API failed, falling back to Pexels");
        return await this.pexelsVideoSource.findVideo(searchParams);
      }
    } else if (videoSource === "leonardo" && this.leonardoVideoSource) {
      try {
        return await this.leonardoVideoSource.findVideo(searchParams);
      } catch (error) {
        logger.warn(error, "Leonardo API failed, falling back to Pexels");
        return await this.pexelsVideoSource.findVideo(searchParams);
      }
    } else {
      // Default to Pexels
      return await this.pexelsVideoSource.findVideo(searchParams);
    }
  }

  private shouldUseNanoBanana(
    scene: SceneInput,
    config: RenderConfig,
    metadata?: any
  ): boolean {
    return (config.videoSource === "ffmpeg" && scene.needsImageGeneration && scene.imageData && !scene.video) ||
           (metadata?.mode === "nano-banana");
    // Note: VEO3 mode is handled separately in generateVideoForScene()
  }

  private shouldUseNanoBananaStaticWorkflow(
    config: RenderConfig,
    metadata?: any,
    inputScenes?: SceneInput[]
  ): boolean {
    logger.info({
      hasInputScenes: !!inputScenes,
      sceneCount: inputScenes?.length || 0,
      videoSource: config.videoSource,
      metadataMode: metadata?.mode,
      metadata
    }, "🔍 DEBUGGING shouldUseNanoBananaStaticWorkflow");
    
    if (!inputScenes) {
      logger.info("❌ No input scenes, returning false");
      return false;
    }
    
    const result = NanoBananaStaticVideoHelper.isNanoBananaStaticVideo(config, metadata, inputScenes);
    logger.info({ result }, "🔍 NanoBananaStaticVideoHelper.isNanoBananaStaticVideo returned");
    return result;
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

  /**
   * Handle YouTube upload with auto-title generation
   */
  private async handleYouTubeUpload(
    videoId: string,
    youtubeUpload: N8NYouTubeUploadConfig,
    metadata?: any
  ): Promise<void> {
    try {
      if (!this.youtubeUploader) {
        logger.warn({ videoId }, 'YouTube uploader not available, skipping auto-upload');
        return;
      }

      // Check if channel is authenticated
      if (!this.youtubeUploader.isChannelAuthenticated(youtubeUpload.channelName)) {
        logger.warn(
          { videoId, channelName: youtubeUpload.channelName },
          'Channel not authenticated, skipping auto-upload'
        );

        // Trigger webhook: youtube.failed
        if (this.webhookManager) {
          await this.webhookManager.triggerWebhook({
            eventId: `evt_${crypto.randomBytes(16).toString('hex')}`,
            eventType: 'youtube.failed',
            timestamp: new Date().toISOString(),
            data: {
              videoId,
              channelName: youtubeUpload.channelName,
              error: {
                message: 'Channel not authenticated'
              }
            }
          });
        }
        return;
      }

      logger.info(
        { videoId, channelName: youtubeUpload.channelName },
        '📤 Starting YouTube auto-upload'
      );

      // Generate title if "{{auto}}" or not provided
      let title = youtubeUpload.title || '{{auto}}';
      if (title === '{{auto}}') {
        title = metadata?.title || `Video ${videoId}`;
      }

      // Prepare metadata
      const uploadMetadata = {
        title,
        description: youtubeUpload.description || '',
        tags: youtubeUpload.tags || [],
        privacyStatus: (youtubeUpload.privacy || 'private') as 'private' | 'unlisted' | 'public',
        categoryId: youtubeUpload.categoryId || '22'
      };

      // Update workflow: YouTube uploading
      if (this.workflowManager) {
        this.workflowManager.createYouTubeUpload(videoId, youtubeUpload.channelName);
        this.workflowManager.updateYouTubeUploadState(
          videoId,
          youtubeUpload.channelName,
          'uploading' as any
        );
      }

      // Upload to YouTube
      const youtubeVideoId = await this.youtubeUploader.uploadVideo(
        videoId,
        youtubeUpload.channelName,
        uploadMetadata,
        false // notifySubscribers
      );

      const videoUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

      logger.info(
        { videoId, youtubeVideoId, videoUrl },
        '✅ YouTube upload completed successfully'
      );

      // Update workflow: YouTube uploaded
      if (this.workflowManager) {
        this.workflowManager.updateYouTubeUploadState(
          videoId,
          youtubeUpload.channelName,
          'uploaded' as any,
          {
            youtubeVideoId,
            youtubeUrl: videoUrl
          }
        );
      }

      // Trigger webhook: youtube.uploaded
      if (this.webhookManager) {
        await this.webhookManager.triggerWebhook({
          eventId: `evt_${crypto.randomBytes(16).toString('hex')}`,
          eventType: 'youtube.uploaded',
          timestamp: new Date().toISOString(),
          data: {
            videoId,
            youtubeVideoId,
            youtubeUrl: videoUrl,
            channelName: youtubeUpload.channelName,
            metadata: {
              title: uploadMetadata.title
            }
          }
        });
      }
    } catch (error: unknown) {
      logger.error(
        { error, videoId, channelName: youtubeUpload.channelName },
        '❌ YouTube upload failed'
      );

      // Update workflow: YouTube failed
      if (this.workflowManager) {
        this.workflowManager.updateYouTubeUploadState(
          videoId,
          youtubeUpload.channelName,
          'failed' as any,
          {
            error: {
              message: error instanceof Error ? error.message : String(error),
              retryable: false
            }
          }
        );
      }

      // Trigger webhook: youtube.failed
      if (this.webhookManager) {
        await this.webhookManager.triggerWebhook({
          eventId: `evt_${crypto.randomBytes(16).toString('hex')}`,
          eventType: 'youtube.failed',
          timestamp: new Date().toISOString(),
          data: {
            videoId,
            channelName: youtubeUpload.channelName,
            error: {
              message: error instanceof Error ? error.message : String(error)
            }
          }
        });
      }

      // Note: We don't throw the error here because video creation was successful
      // YouTube upload failure should not mark the entire job as failed
    }
  }
}