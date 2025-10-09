import { BaseWorkflow, WorkflowContext, WorkflowResult } from "./BaseWorkflow";
import { VideoProcessor } from "../processors/VideoProcessor";
import { logger } from "../../logger";
import type { Scene, SceneInput } from "../../types/shorts";

export class SingleSceneWorkflow extends BaseWorkflow {
  constructor(private videoProcessor: VideoProcessor) {
    super();
  }

  async process(
    scenes: Scene[],
    inputScenes: SceneInput[],
    context: WorkflowContext
  ): Promise<WorkflowResult> {
    try {
      logger.debug({ videoId: context.videoId }, "Processing single scene workflow");

      this.validateScenes(scenes);
      
      if (scenes.length !== 1) {
        throw new Error("SingleSceneWorkflow expects exactly one scene");
      }

      const scene = scenes[0];
      const totalDuration = this.calculateTotalDuration(scenes);
      const outputPath = this.videoProcessor.createOutputPath(context.videoId);

      // Add padding if configured
      let finalDuration = totalDuration;
      if (context.config.paddingBack) {
        finalDuration += context.config.paddingBack / 1000;
      }

      // Check if this is VEO3 mode
      const isVeo3Mode = context.metadata?.mode === "veo3" ||
                         (context.config.videoSource === "veo" && context.metadata?.veo3_priority);

      // VEO3 mode: Check if we should use TTS audio or native VEO3 audio (from env)
      const useVeo3NativeAudio = context.systemConfig.veo3UseNativeAudio;

      if (isVeo3Mode && useVeo3NativeAudio) {
        // Mode 1: VEO3 native audio (for dialogue/voice-acted content)
        logger.info({ videoId: context.videoId }, "⏭️ VEO3 native audio mode - using VEO3's generated audio");
        const result = await this.videoProcessor.copyVideoAsIs(
          scene.video,
          outputPath
        );
        return {
          outputPath: result.outputPath,
          duration: finalDuration,
          scenes
        };
      } else if (isVeo3Mode) {
        // Mode 2: TTS audio mode (for automated shorts with narrator)
        logger.info({ videoId: context.videoId }, "🎙️ VEO3 TTS mode - replacing VEO3 audio with TTS narration");
        const result = await this.videoProcessor.replaceVeo3AudioWithTTS(
          scene.video,
          scene.audio.url,
          finalDuration,
          outputPath
        );
        return {
          outputPath: result.outputPath,
          duration: result.duration,
          scenes
        };
      }

      // VEO2 or other modes: Standard FFmpeg processing
      const result = await this.videoProcessor.processSingleScene(
        scene.video,
        scene.audio.url,
        scene.captions || [],
        finalDuration,
        context.orientation,
        context.config,
        outputPath
      );

      logger.debug({ videoId: context.videoId, outputPath: result.outputPath }, "Single scene processed successfully");

      return {
        outputPath: result.outputPath,
        duration: result.duration,
        scenes
      };
    } catch (error) {
      logger.error(error, "Failed to process single scene workflow");
      throw new Error(`Single scene workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}