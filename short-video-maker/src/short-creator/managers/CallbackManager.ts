import fs from "fs-extra";
import { logger } from "../../logger";
import { ErrorHandler } from "../utils/ErrorHandler";
import { GoogleCloudStorageService } from "../../storage/GoogleCloudStorageService";
import type { SceneInput, RenderConfig } from "../../types/shorts";

export interface CallbackData {
  videoId: string;
  sceneInput: SceneInput[];
  config: RenderConfig;
  originalMetadata?: any;
  status: 'completed' | 'failed' | 'processing';
  error?: unknown;
  errorType?: string;
  gcsUrl?: string;
  gcsSignedUrl?: string;
}

export interface CallbackConfig {
  port: number;
  videosDirPath: string;
  tempDirPath: string;
  musicDirPath: string;
  videoSource: string;
  ttsProvider: string;
  [key: string]: any;
}

export class CallbackManager {
  constructor(
    private config: CallbackConfig,
    private gcsService?: GoogleCloudStorageService
  ) {}

  async sendCompletionCallback(
    callbackUrl: string,
    data: CallbackData
  ): Promise<void> {
    try {
      const videoPath = this.getVideoPath(data.videoId);
      const videoStats = fs.existsSync(videoPath) ? fs.statSync(videoPath) : null;

      // GCS URLs are now passed from processVideo method via CallbackData
      const gcsUrl = data.gcsUrl;
      const gcsSignedUrl = data.gcsSignedUrl;

      const result = this.buildCallbackPayload(data, videoStats, gcsUrl, gcsSignedUrl);

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

      logger.info({ videoId: data.videoId, callbackUrl }, "Successfully sent completion callback to N8N");
    } catch (callbackError: unknown) {
      logger.error(callbackError, "Failed to send completion callback to N8N");
    }
  }

  private buildCallbackPayload(
    data: CallbackData,
    videoStats: fs.Stats | null,
    gcsUrl?: string,
    gcsSignedUrl?: string
  ): any {
    const usedParameters = {
      videoId: data.videoId,
      scenes: data.sceneInput.map((scene, index) => ({
        sceneNumber: index + 1,
        text: scene.text,
        searchTerms: scene.searchTerms,
        voiceConfig: (scene as any).voiceConfig || { voice: 'af_heart' },
        duration: (scene as any).duration || null,
        videoPrompt: (scene as any).videoPrompt || null,
        textOverlays: (scene as any).textOverlays || null
      })),
      config: {
        orientation: data.config.orientation,
        musicTag: (data.config as any).musicTag || 'happy',
        quality: (data.config as any).quality || '1080p',
        style: (data.config as any).style || null,
        soundtrack: (data.config as any).soundtrack || null,
        paddingBack: data.config.paddingBack,
        music: data.config.music,
        captionPosition: data.config.captionPosition,
        captionBackgroundColor: data.config.captionBackgroundColor,
        voice: data.config.voice,
        musicVolume: data.config.musicVolume
      },
      processing: {
        totalScenes: data.sceneInput.length,
        totalDuration: data.sceneInput.reduce((sum, scene) => sum + ((scene as any).duration || 0), 0),
        videoSource: this.config.videoSource,
        ttsProvider: this.config.ttsProvider,
        devMode: this.config.devMode,
        concurrency: this.config.concurrency,
        port: this.config.port
      },
      api_keys: {
        pexels: !!this.config.pexelsApiKey,
        googleVeo: !!this.config.googleVeoApiKey,
        leonardo: !!this.config.leonardoApiKey,
        googleGemini: !!this.config.googleGeminiApiKey,
        googleTts: !!this.config.googleTtsApiKey
      },
      paths: {
        videosDirPath: this.config.videosDirPath,
        tempDirPath: this.config.tempDirPath,
        musicDirPath: this.config.musicDirPath
      }
    };

    return {
      status: data.status,
      videoId: data.videoId,
      videoUrl: data.status === 'completed' ? `${this.getBaseUrl()}/api/short-video/${data.videoId}` : null,
      filePath: data.status === 'completed' ? this.getVideoPath(data.videoId) : null,
      fileSize: videoStats?.size || 0,
      gcsUrl: gcsUrl || null,
      gcsSignedUrl: gcsSignedUrl || null,
      createdAt: new Date().toISOString(),
      parameters: usedParameters,
      metadata: data.originalMetadata,
      error: data.status === 'failed' ? {
        type: data.errorType || ErrorHandler.categorizeError(data.error),
        message: data.error instanceof Error ? data.error.message : String(data.error),
        stack: data.error instanceof Error ? data.error.stack : undefined,
        timestamp: new Date().toISOString()
      } : null,
      processing_info: {
        server_url: this.getBaseUrl(),
        video_storage_path: this.config.videosDirPath,
        temp_path: this.config.tempDirPath,
        video_source: this.config.videoSource,
        tts_provider: this.config.ttsProvider,
        gcs_enabled: !!this.gcsService
      }
    };
  }

  private getBaseUrl(): string {
    return `http://localhost:${this.config.port}`;
  }

  private getVideoPath(videoId: string): string {
    return `${this.config.videosDirPath}/${videoId}.mp4`;
  }
}