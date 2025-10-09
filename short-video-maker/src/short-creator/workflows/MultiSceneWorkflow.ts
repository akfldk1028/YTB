import fs from "fs-extra";
import path from "path";
import { BaseWorkflow, WorkflowContext, WorkflowResult } from "./BaseWorkflow";
import { VideoProcessor } from "../processors/VideoProcessor";
import { logger } from "../../logger";
import type { Scene, SceneInput } from "../../types/shorts";

export class MultiSceneWorkflow extends BaseWorkflow {
  constructor(private videoProcessor: VideoProcessor) {
    super();
  }

  async process(
    scenes: Scene[],
    inputScenes: SceneInput[],
    context: WorkflowContext
  ): Promise<WorkflowResult> {
    try {
      logger.debug({ 
        videoId: context.videoId, 
        sceneCount: scenes.length 
      }, "Processing multi-scene workflow");

      this.validateScenes(scenes);

      const sceneVideoPaths: string[] = [];
      const tempFilesToCleanup: string[] = [];
      const allCaptions: any[] = [];
      let cumulativeDuration = 0;

      // Create video-specific temp folder
      const videoTempDir = this.videoProcessor.createVideoTempDir(context.videoId);
      await fs.ensureDir(videoTempDir);

      try {
        // Check if this is VEO3 mode
        const isVeo3Mode = context.metadata?.mode === "veo3" ||
                           (context.config.videoSource === "veo" && context.metadata?.veo3_priority);

        // VEO3 mode: Check if we should use TTS audio or native VEO3 audio (from env)
        const useVeo3NativeAudio = context.systemConfig.veo3UseNativeAudio;

        // Process each scene individually
        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          const sceneVideoPath = path.join(videoTempDir, `scene_${i}.mp4`);
          const sceneDuration = scene.audio?.duration || 3;

          logger.debug({ sceneIndex: i, sceneVideoPath }, `Processing scene ${i + 1}/${scenes.length}`);

          if (isVeo3Mode && useVeo3NativeAudio) {
            // Mode 1: VEO3 native audio (for dialogue/voice-acted content)
            logger.debug({ sceneIndex: i }, "VEO3 native audio mode: copying video as-is");
            await this.videoProcessor.copyVideoToScene(scene.video, sceneVideoPath);
          } else if (isVeo3Mode) {
            // Mode 2: TTS audio mode (for automated shorts with narrator)
            logger.debug({ sceneIndex: i }, "VEO3 TTS mode: replacing VEO3 audio with TTS narration");
            await this.videoProcessor.replaceVeo3AudioWithTTS(
              scene.video,
              scene.audio.url,
              sceneDuration,
              sceneVideoPath
            );
          } else {
            // VEO2/Pexels: Process individual scene with FFmpeg (skip subtitles for now)
            await this.videoProcessor.processSingleScene(
              scene.video,
              scene.audio.url,
              scene.captions || [],
              sceneDuration,
              context.orientation,
              context.config,
              sceneVideoPath,
              true // skipSubtitles = true
            );
          }

          // Collect captions with time offset
          if (scene.captions && scene.captions.length > 0) {
            const adjustedCaptions = scene.captions.map((caption: any) => ({
              ...caption,
              startMs: caption.startMs + (cumulativeDuration * 1000),
              endMs: caption.endMs + (cumulativeDuration * 1000),
            }));
            allCaptions.push(...adjustedCaptions);
            
            logger.debug({ 
              sceneIndex: i, 
              captionCount: adjustedCaptions.length, 
              timeOffset: cumulativeDuration 
            }, "Collected scene captions with time offset");
          }

          sceneVideoPaths.push(sceneVideoPath);
          tempFilesToCleanup.push(sceneVideoPath);

          // Update cumulative duration using Whisper timing if available
          if (scene.captions && scene.captions.length > 0) {
            const lastCaption = scene.captions[scene.captions.length - 1];
            const actualSceneDuration = lastCaption.endMs / 1000;
            cumulativeDuration += actualSceneDuration;
            
            logger.debug({
              sceneIndex: i,
              ttsEstimated: sceneDuration,
              whisperActual: actualSceneDuration,
              timingDifference: Math.abs(sceneDuration - actualSceneDuration).toFixed(3) + 's'
            }, "Using Whisper-based accurate scene timing");
          } else {
            cumulativeDuration += sceneDuration;
            logger.debug({ sceneIndex: i, fallbackToTTS: true }, "No captions available, using TTS duration estimate");
          }

          logger.debug({ sceneIndex: i, sceneVideoPath }, `Scene ${i + 1} processed successfully`);
        }

        // Concatenate all scene videos
        const outputPath = this.videoProcessor.createOutputPath(context.videoId);
        const tempConcatenatedPath = path.join(videoTempDir, `temp_concat.mp4`);
        
        logger.debug({ sceneVideoPaths, tempConcatenatedPath }, "Concatenating scene videos");
        await this.videoProcessor.concatenateScenes(sceneVideoPaths, tempConcatenatedPath);

        // Apply synchronized subtitles to final video
        if (allCaptions.length > 0) {
          logger.debug({ captionCount: allCaptions.length }, "Applying synchronized subtitles to final video");
          await this.videoProcessor.addSubtitlesToVideo(
            tempConcatenatedPath,
            outputPath,
            allCaptions,
            context.orientation
          );
          
          // Clean up temp concatenated file
          if (fs.existsSync(tempConcatenatedPath)) {
            fs.unlinkSync(tempConcatenatedPath);
            logger.debug({ tempFile: tempConcatenatedPath }, "Cleaned up temporary concatenated video");
          }
        } else {
          // No subtitles, move concatenated video to final location
          fs.renameSync(tempConcatenatedPath, outputPath);
          logger.debug("No subtitles to apply, moved concatenated video to final location");
        }

        logger.debug({ 
          videoId: context.videoId, 
          outputPath,
          totalDuration: cumulativeDuration,
          sceneCount: scenes.length
        }, "Multi-scene workflow completed successfully");

        return {
          outputPath,
          duration: cumulativeDuration,
          scenes
        };

      } finally {
        // DISABLED: Keep temp files for debugging/verification
        // Cleanup temp scene videos
        // for (const tempFile of tempFilesToCleanup) {
        //   try {
        //     if (fs.existsSync(tempFile)) {
        //       fs.unlinkSync(tempFile);
        //       logger.debug({ tempFile }, "Cleaned up temporary scene video");
        //     }
        //   } catch (cleanupError) {
        //     logger.warn(cleanupError, `Could not clean up temporary file: ${tempFile}`);
        //   }
        // }

        // DISABLED: Keep temp directory for debugging/verification
        // Clean up video-specific temp directory
        // try {
        //   if (fs.existsSync(videoTempDir)) {
        //     fs.removeSync(videoTempDir);
        //     logger.debug({ videoTempDir, videoId: context.videoId }, "Cleaned up video-specific temp directory");
        //   }
        // } catch (cleanupError) {
        //   logger.warn(cleanupError, `Could not clean up video temp directory: ${videoTempDir}`);
        // }

        logger.debug({ videoTempDir, videoId: context.videoId }, "✅ Temp files preserved for verification");
      }

    } catch (error) {
      logger.error(error, "Failed to process multi-scene workflow");
      throw new Error(`Multi-scene workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}