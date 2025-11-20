import fs from "fs-extra";
import path from "path";
import { BaseWorkflow, WorkflowContext, WorkflowResult } from "./BaseWorkflow";
import { VideoProcessor } from "../processors/VideoProcessor";
import { GoogleVeoAPI } from "../libraries/GoogleVeo";
import { VIDEO_DIMENSIONS } from "../utils/Constants";
import { logger } from "../../logger";
import { ImageGenerationService } from "../../image-generation/services/ImageGenerationService";
import { ImageModelType } from "../../image-generation/models/imageModels";
import type { Scene, SceneInput } from "../../types/shorts";

/**
 * Consistent Shorts Workflow
 *
 * Inspired by Image_out.ipynb Chat Mode:
 * - Generates images with CHARACTER CONSISTENCY
 * - Uses previous images as references (max 3)
 * - Optional VEO3 I2V conversion
 * - Perfect for storytelling with same character
 *
 * How it works (like Chat Mode in ipynb):
 * Scene 1: Generate character image (no references)
 * Scene 2: Generate with Scene 1 as reference → same character!
 * Scene 3: Generate with Scene 1, 2 as references → same character!
 * Scene 4: Generate with Scene 2, 3 as references (max 3) → same character!
 */
export class ConsistentShortsWorkflow extends BaseWorkflow {
  constructor(
    private videoProcessor: VideoProcessor,
    private imageGenerationService?: ImageGenerationService,
    private veoAPI?: GoogleVeoAPI
  ) {
    super();
  }

  async process(
    scenes: Scene[],
    inputScenes: SceneInput[],
    context: WorkflowContext
  ): Promise<WorkflowResult> {
    try {
      logger.info({
        videoId: context.videoId,
        sceneCount: scenes.length,
        mode: "consistent-shorts"
      }, "✨ Processing CONSISTENT SHORTS workflow (character consistency mode)");

      this.validateScenes(scenes);

      if (!this.imageGenerationService) {
        throw new Error("ImageGenerationService is required for Consistent Shorts mode");
      }

      // Create video-specific temp folder
      const videoTempDir = this.videoProcessor.createVideoTempDir(context.videoId);
      await fs.ensureDir(videoTempDir);
      logger.info({ videoTempDir, videoId: context.videoId }, "✅ Created video-specific temp directory");

      const folderExists = await fs.pathExists(videoTempDir);
      if (!folderExists) {
        throw new Error(`Failed to create video temp directory: ${videoTempDir}`);
      }

      try {
        // Step 1: Generate images with CHARACTER CONSISTENCY
        logger.info({
          videoId: context.videoId,
          sceneCount: inputScenes.length
        }, "🎨 Starting CONSISTENT image generation (like Chat Mode in ipynb)");

        const imageDataList: Array<{
          imagePath: string;
          duration: number;
          sceneText: string;
          imageBuffer: Buffer;
        }> = [];

        // Track previous images for reference (like Chat history)
        const previousImages: Array<{
          data: Buffer;
          mimeType: string;
          sceneIndex: number;
        }> = [];

        for (let i = 0; i < inputScenes.length; i++) {
          const scene = inputScenes[i];

          logger.info({
            sceneIndex: i + 1,
            totalScenes: inputScenes.length,
            hasPreviousImages: previousImages.length > 0,
            referenceImageCount: Math.min(previousImages.length, 3)
          }, "📸 Generating image for scene with character consistency");

          if (!scene.imageData) {
            scene.imageData = {
              prompt: scene.text,
              style: "cinematic",
              mood: "dynamic"
            };
          }

          // Set NANO BANANA model (best for character consistency)
          this.imageGenerationService.setModel(ImageModelType.NANO_BANANA);

          // Enhanced prompt with character consistency
          const enhancedPrompt = `${scene.imageData.prompt || scene.text}. Style: ${scene.imageData.style || "cinematic"}. Mood: ${scene.imageData.mood || "dynamic"}. Maintain consistent character appearance.`;
          const aspectRatio = context.orientation === "portrait" ? "9:16" : "16:9";

          // ⭐ KEY FEATURE: Use previous images as references (max 3)
          // This is like Chat Mode in ipynb - maintains character consistency!
          const referenceImages = i > 0
            ? previousImages.slice(-3).map(img => ({
                data: img.data,
                mimeType: img.mimeType
              }))
            : undefined;

          logger.debug({
            sceneIndex: i,
            referenceImageCount: referenceImages?.length || 0,
            prompt: enhancedPrompt.substring(0, 100)
          }, "🔗 Using reference images for consistency");

          // Generate image with references
          const result = await this.imageGenerationService.generateImages({
            prompt: enhancedPrompt,
            numberOfImages: 1,
            aspectRatio: aspectRatio as "9:16" | "16:9",
            referenceImages: referenceImages // ⭐ Chat Mode magic!
          }, context.videoId, i);

          if (!result.success || !result.images || result.images.length === 0) {
            throw new Error(`Failed to generate consistent image for scene ${i + 1}`);
          }

          const generatedImage = result.images[0];

          // Save image
          const simpleFilename = `consistent_scene_${i + 1}_${context.videoId}.png`;
          const savedImagePath = path.join(videoTempDir, simpleFilename);

          await fs.writeFile(savedImagePath, generatedImage.data);

          // Verify save
          const fileExists = await fs.pathExists(savedImagePath);
          const fileStats = fileExists ? await fs.stat(savedImagePath) : null;

          logger.info({
            sceneIndex: i + 1,
            imagePath: savedImagePath,
            filename: simpleFilename,
            fileExists,
            fileSize: fileStats?.size,
            usedReferences: referenceImages?.length || 0
          }, "✅ Consistent character image generated and saved");

          // ⭐ Add to previous images for next scene reference
          previousImages.push({
            data: generatedImage.data,
            mimeType: generatedImage.mimeType || "image/png",
            sceneIndex: i
          });

          imageDataList.push({
            imagePath: savedImagePath,
            duration: 3, // Will be updated with actual audio length
            sceneText: scene.text,
            imageBuffer: generatedImage.data
          });
        }

        logger.info({
          totalImages: imageDataList.length,
          characterConsistent: true
        }, "🎉 All images generated with consistent character!");

        // Step 2: Update durations from audio data
        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          if (scene.audio?.duration) {
            imageDataList[i].duration = scene.audio.duration;
          }
        }

        // Step 3A: VEO3 I2V conversion (if enabled)
        logger.info({
          hasGenerateVideosFlag: !!context.metadata?.generateVideos,
          generateVideosValue: context.metadata?.generateVideos,
          hasVeoAPI: !!this.veoAPI,
          willUseVEO3: !!(context.metadata?.generateVideos && this.veoAPI)
        }, "🔍 Checking VEO3 I2V condition");

        if (context.metadata?.generateVideos && this.veoAPI) {
          logger.info("🎬 Converting consistent images to videos with VEO3 I2V");

          const videoClips: string[] = [];

          for (let i = 0; i < imageDataList.length; i++) {
            const imageData = imageDataList[i];
            const scene = inputScenes[i];

            logger.info({
              sceneIndex: i + 1,
              duration: imageData.duration
            }, "🔄 Converting image to video with VEO3");

            // Convert image to base64 for VEO3
            const imageBase64 = imageData.imageBuffer.toString('base64');

            // VEO3 I2V generation
            const videoPrompt = scene.videoPrompt || scene.text || `Scene ${i + 1}`;
            const duration = imageData.duration || scenes[i]?.audio?.duration || 8;

            const video = await this.veoAPI.findVideo(
              [videoPrompt],
              duration,          // minDurationSeconds (number)
              [],                // excludeIds
              context.orientation, // orientation
              300000,            // timeout (5 minutes)
              0,                 // retryCounter
              {                  // initialImage for I2V
                data: imageBase64,
                mimeType: "image/png"
              }
            );

            // Download VEO3 video
            const videoPath = path.join(videoTempDir, `veo3_scene_${i + 1}_${context.videoId}.mp4`);
            await this.videoProcessor.downloadVideo(video.url, videoPath);

            videoClips.push(videoPath);

            logger.info({
              sceneIndex: i + 1,
              videoPath
            }, "✅ VEO3 video generated from consistent image");
          }

          // Combine VEO3 clips
          logger.info({
            clipCount: videoClips.length,
            clips: videoClips
          }, "🎬 Combining VEO3 video clips");

          const tempVideoPath = path.join(videoTempDir, `veo3_combined_${context.videoId}.mp4`);
          await this.videoProcessor.combineVideoClips(videoClips, tempVideoPath);

          logger.info({
            clipCount: videoClips.length,
            outputPath: tempVideoPath
          }, "✅ VEO3 videos combined");

          // Step 3B: Combine with audio
          const audioFiles: string[] = [];
          for (const scene of scenes) {
            if (scene.audio?.url) {
              const audioFileName = scene.audio.url.split('/').pop();
              if (audioFileName) {
                audioFiles.push(path.join(this.videoProcessor.getConfig().tempDirPath, audioFileName));
              }
            }
          }

          const tempFinalPath = path.join(videoTempDir, `final_${context.videoId}.mp4`);
          await this.videoProcessor.combineVideoWithAudio(
            tempVideoPath,
            audioFiles,
            tempFinalPath
          );

          // Copy final video to standard location for GCS upload
          const standardVideoPath = path.join(
            this.videoProcessor.getConfig().videosDirPath,
            `${context.videoId}.mp4`
          );

          await fs.promises.copyFile(tempFinalPath, standardVideoPath);
          logger.info({
            from: tempFinalPath,
            to: standardVideoPath
          }, "✅ Final video copied to standard location for GCS upload");

          // Calculate total duration
          const totalDuration = this.calculateTotalDuration(scenes);

          return {
            outputPath: standardVideoPath,
            duration: totalDuration,
            scenes
          };

        } else {
          // Step 3B: Static video from images (no VEO3)
          logger.info("🎞️ Creating static video from consistent images");

          const tempVideoPath = path.join(videoTempDir, `consistent_static_${context.videoId}.mp4`);
          const dimensions = context.orientation === "portrait"
            ? VIDEO_DIMENSIONS.PORTRAIT
            : VIDEO_DIMENSIONS.LANDSCAPE;

          await this.videoProcessor.createStaticVideoFromMultipleImages(
            imageDataList,
            tempVideoPath,
            dimensions
          );

          logger.info("✅ Static video created from consistent character images");

          // Step 4: Combine with audio
          const audioFiles: string[] = [];
          for (const scene of scenes) {
            if (scene.audio?.url) {
              const audioFileName = scene.audio.url.split('/').pop();
              if (audioFileName) {
                audioFiles.push(path.join(this.videoProcessor.getConfig().tempDirPath, audioFileName));
              }
            }
          }

          const tempFinalPath = path.join(videoTempDir, `final_${context.videoId}.mp4`);
          await this.videoProcessor.combineVideoWithAudio(
            tempVideoPath,
            audioFiles,
            tempFinalPath
          );

          // Copy final video to standard location for GCS upload
          const standardVideoPath = path.join(
            this.videoProcessor.getConfig().videosDirPath,
            `${context.videoId}.mp4`
          );

          await fs.promises.copyFile(tempFinalPath, standardVideoPath);
          logger.info({
            from: tempFinalPath,
            to: standardVideoPath
          }, "✅ Final video copied to standard location for GCS upload");

          // Calculate total duration
          const totalDuration = this.calculateTotalDuration(scenes);

          return {
            outputPath: standardVideoPath,
            duration: totalDuration,
            scenes
          };
        }

      } catch (error) {
        logger.error({ error, videoId: context.videoId }, "❌ Consistent Shorts workflow failed");
        throw error;
      }

    } catch (error) {
      logger.error({ error }, "Failed to process Consistent Shorts workflow");
      throw error;
    }
  }
}
