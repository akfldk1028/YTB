import fs from "fs-extra";
import path from "path";
import { BaseWorkflow, WorkflowContext, WorkflowResult } from "./BaseWorkflow";
import { VideoProcessor } from "../processors/VideoProcessor";
import { ImageGenerationService } from "../../image-generation/services/ImageGenerationService";
import { GPTImageHelper } from "../utils/GPTImageHelper";
import { VIDEO_DIMENSIONS } from "../utils/Constants";
import { logger } from "../../logger";
import type { Scene, SceneInput } from "../../types/shorts";

/**
 * GPT Image Static Video Workflow
 * Uses OpenAI's GPT Image model for image generation, then FFmpeg for video composition
 */
export class GPTImageStaticWorkflow extends BaseWorkflow {
  constructor(
    private videoProcessor: VideoProcessor,
    private imageGenerationService?: ImageGenerationService
  ) {
    super();
  }

  async process(
    scenes: Scene[],
    inputScenes: SceneInput[],
    context: WorkflowContext
  ): Promise<WorkflowResult> {
    try {
      logger.info({ videoId: context.videoId, sceneCount: scenes.length }, "🎬 GPT Image static workflow");
      this.validateScenes(scenes);

      const videoTempDir = this.videoProcessor.createVideoTempDir(context.videoId);
      await fs.ensureDir(videoTempDir);

      if (!await fs.pathExists(videoTempDir)) {
        throw new Error(`Failed to create video temp directory: ${videoTempDir}`);
      }

      try {
        // Step 1: Generate images using GPT Image
        if (!this.imageGenerationService) {
          throw new Error("ImageGenerationService not available");
        }

        const imageDataList = await GPTImageHelper.generateImagesForAllScenes(
          inputScenes,
          this.imageGenerationService,
          context.orientation,
          videoTempDir,
          context.videoId
        );

        // Step 2: Update durations from audio data
        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          if (scene.audio?.duration) {
            imageDataList[i].duration = scene.audio.duration;
          }
        }

        // Step 3: Create one static video from all images
        const tempVideoPath = path.join(videoTempDir, `gpt_image_static_${context.videoId}.mp4`);
        const dimensions = context.orientation === "portrait"
          ? VIDEO_DIMENSIONS.PORTRAIT
          : VIDEO_DIMENSIONS.LANDSCAPE;

        await this.videoProcessor.createStaticVideoFromMultipleImages(
          imageDataList,
          tempVideoPath,
          dimensions
        );

        logger.info("✅ Static video created from all GPT images");

        // Step 4: Combine with audio
        const audioFiles: string[] = [];
        for (const scene of scenes) {
          if (scene.audio?.url) {
            const audioFileName = scene.audio.url.split('/').pop();
            const audioPath = this.videoProcessor.createTempPath(audioFileName!);
            if (fs.existsSync(audioPath)) {
              audioFiles.push(audioPath);
            }
          }
        }

        // Concatenate all audio files if multiple scenes
        let finalAudioPath: string;
        const totalDuration = imageDataList.reduce((sum, img) => sum + img.duration, 0);
        const outputPath = this.videoProcessor.createOutputPath(context.videoId);

        if (audioFiles.length > 1) {
          logger.info({ audioFileCount: audioFiles.length }, "Concatenating multiple audio files");
          finalAudioPath = path.join(videoTempDir, `concatenated_audio_${context.videoId}.mp3`);
          await this.videoProcessor.concatenateAudioFiles(audioFiles, finalAudioPath);
          logger.info({ finalAudioPath }, "✅ Audio files concatenated");
        } else {
          finalAudioPath = audioFiles[0];
          logger.debug("Using single audio file (no concatenation needed)");
        }

        // Collect all captions for subtitle overlay
        const allCaptions: any[] = [];
        let cumulativeDuration = 0;

        for (const scene of scenes) {
          if (scene.captions && scene.captions.length > 0) {
            const adjustedCaptions = scene.captions.map((caption: any) => ({
              ...caption,
              startMs: caption.startMs + (cumulativeDuration * 1000),
              endMs: caption.endMs + (cumulativeDuration * 1000),
            }));
            allCaptions.push(...adjustedCaptions);
          }
          cumulativeDuration += scene.audio?.duration || 0;
        }

        // Combine video with audio and add subtitles
        await this.videoProcessor.processSingleScene(
          tempVideoPath,
          finalAudioPath,
          allCaptions,
          totalDuration,
          context.orientation,
          context.config,
          outputPath
        );

        // Clean up temp video (keep images for potential VEO3 processing)
        if (fs.existsSync(tempVideoPath)) {
          fs.unlinkSync(tempVideoPath);
        }

        logger.info(`✅ Keeping GPT images in ${videoTempDir} for potential VEO3 processing`);

        logger.info("🎉 GPT Image static video processing complete");

        return {
          outputPath,
          duration: totalDuration,
          scenes
        };

      } finally {
        // Keep video ID folder for potential VEO3 processing
        logger.debug({ videoTempDir, videoId: context.videoId }, "Keeping video-specific temp directory for potential VEO3 processing");
      }

    } catch (error) {
      logger.error(error, "Failed to process GPT Image static workflow");
      throw new Error(`GPT Image static workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
