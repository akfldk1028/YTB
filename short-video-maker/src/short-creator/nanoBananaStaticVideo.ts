import { logger } from "../logger";
import cuid from "cuid";
import path from "path";
import fs from "fs-extra";
import { OrientationEnum } from "../types/shorts";
import type { SceneInput, RenderConfig } from "../types/shorts";

/**
 * Helper for NANO BANANA static video generation
 * Generates images for all scenes and combines them into one static video
 */
export class NanoBananaStaticVideoHelper {
  /**
   * Process all scenes for NANO BANANA static video
   * @returns Array of generated image paths with durations
   */
  static async generateImagesForAllScenes(
    scenes: SceneInput[],
    imageGenerationService: any,
    orientation: OrientationEnum,
    tempDirPath: string,
    videoId?: string
  ): Promise<Array<{ imagePath: string; duration: number; sceneText: string }>> {
    logger.info({
      sceneCount: scenes.length,
      orientation
    }, "🎬 Starting NANO BANANA static video: generating images for all scenes");

    const imageDataList = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      logger.info({
        sceneIndex: i + 1,
        totalScenes: scenes.length,
        text: scene.text ? scene.text.substring(0, 50) : 'No text'
      }, "📸 Generating image for scene");

      try {
        // Prepare image generation data
        const imageData = {
          prompt: scene.imageData?.prompt || scene.text,
          style: scene.imageData?.style || "cinematic",
          mood: scene.imageData?.mood || "dynamic"
        };

        // Generate enhanced prompt
        const enhancedPrompt = `${imageData.prompt}. Style: ${imageData.style}. Mood: ${imageData.mood}`;
        const aspectRatio = orientation === OrientationEnum.portrait ? "9:16" : "16:9";

        // Generate image using NANO BANANA with videoId for proper folder structure
        const result = await imageGenerationService.generateImages({
          prompt: enhancedPrompt,
          numberOfImages: 1,
          aspectRatio: aspectRatio
        }, videoId, i);

        if (!result.success || !result.images || result.images.length === 0) {
          throw new Error(`Failed to generate image for scene ${i + 1}`);
        }

        const generatedImage = result.images[0];

        // Now WE save the image with proper scene-based filename
        // Ensure the videoId folder exists
        await fs.ensureDir(tempDirPath);
        
        // Use simple scene-based filename since tempDirPath already includes videoId
        const simpleFilename = `scene_${i + 1}_${videoId}.png`;
        const savedImagePath = path.join(tempDirPath, simpleFilename);
        
        logger.debug({
          tempDirPath,
          originalFilename: generatedImage.filename,
          simpleFilename,
          savedImagePath,
          videoId,
          sceneIndex: i
        }, "💾 Saving image to videoId folder");
        
        await fs.writeFile(savedImagePath, generatedImage.data);

        // Verify file was saved 
        const fileExists = await fs.pathExists(savedImagePath);
        const fileStats = fileExists ? await fs.stat(savedImagePath) : null;

        logger.info({
          sceneIndex: i + 1,
          imagePath: savedImagePath,
          filename: generatedImage.filename,
          fileExists,
          fileSize: fileStats?.size,
          imageSize: generatedImage.data.length,
          tempDirPath
        }, "✅ Image generated and saved for scene");

        // Calculate scene duration (will be set later with audio)
        imageDataList.push({
          imagePath: savedImagePath,
          duration: 3, // Default duration, will be updated with actual audio length
          sceneText: scene.text
        });

      } catch (error) {
        logger.error({
          sceneIndex: i + 1,
          error: error instanceof Error ? error.message : error
        }, "❌ Failed to generate image for scene");
        throw error;
      }
    }

    logger.info({
      totalImages: imageDataList.length,
      totalScenes: scenes.length
    }, "🎉 All images generated successfully for NANO BANANA static video");

    return imageDataList;
  }

  /**
   * Check if this is a NANO BANANA static video request
   */
  static isNanoBananaStaticVideo(
    config: RenderConfig,
    metadata: any,
    scenes: SceneInput[]
  ): boolean {
    // Force NANO BANANA static mode if endpoint specifically requests it
    const isNanoBananaEndpoint = metadata?.mode === "nano-banana";
    const isFFmpegMode = config.videoSource === "ffmpeg";
    const isNanoBanana = isNanoBananaEndpoint || isFFmpegMode;
    // Note: VEO3 mode is NOT included here - it uses dynamic video generation, not static

    const allScenesNeedImages = scenes.every(scene =>
      scene.needsImageGeneration || scene.imageData
    );

    logger.info({
      videoSource: config.videoSource,
      metadataMode: metadata?.mode,
      isNanoBananaEndpoint,
      isFFmpegMode,
      isNanoBanana,
      allScenesNeedImages,
      sceneCount: scenes.length,
      scenesDetail: scenes.map(s => ({ needsImageGeneration: s.needsImageGeneration, hasImageData: !!s.imageData })),
      result: isNanoBanana && allScenesNeedImages && scenes.length > 0
    }, "🔍 NANO BANANA static video mode detection");

    // Force activation for nano-banana endpoint only
    if (isNanoBananaEndpoint) {
      logger.info("🚨 FORCING NANO BANANA static video mode for nano-banana endpoint");
      return true;
    }

    // VEO3 endpoint is handled separately in ShortCreatorRefactored, not here

    return isNanoBanana && allScenesNeedImages && scenes.length > 0;
  }

  /**
   * Clean up temporary image files
   */
  static async cleanupTempImages(imagePaths: string[]): Promise<void> {
    for (const imagePath of imagePaths) {
      try {
        if (await fs.pathExists(imagePath)) {
          await fs.unlink(imagePath);
          logger.debug({ imagePath }, "Cleaned up temp image");
        }
      } catch (error) {
        logger.warn({ imagePath, error }, "Failed to clean up temp image");
      }
    }
  }
}