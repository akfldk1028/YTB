import fs from "fs-extra";
import path from "path";
import { logger } from "../../logger";
import { OrientationEnum } from "../../types/shorts";
import { ImageGenerationService } from "../../image-generation/services/ImageGenerationService";
import { ImageModelType } from "../../image-generation/models/imageModels";
import type { SceneInput } from "../../types/shorts";

/**
 * GPT Image Generation Helper
 * Handles image generation using OpenAI's GPT Image model
 */
export class GPTImageHelper {
  /**
   * Generate images for all scenes using GPT Image
   */
  static async generateImagesForAllScenes(
    scenes: SceneInput[],
    imageGenerationService: ImageGenerationService,
    orientation: OrientationEnum,
    videoTempDir: string,
    videoId: string
  ): Promise<Array<{ imagePath: string; duration: number; sceneText: string }>> {
    logger.info({ sceneCount: scenes.length, orientation }, "🎬 Starting GPT Image generation");

    // Force IMAGEN_4 model (previously called GPT_IMAGE)
    imageGenerationService.setModel(ImageModelType.IMAGEN_4);

    const imageDataList = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      logger.info({ sceneIndex: i + 1, totalScenes: scenes.length }, "📸 Generating GPT image");

      const imageData = scene.imageData || {
        prompt: scene.text,
        style: "cinematic",
        mood: "dynamic"
      };

      const enhancedPrompt = `${imageData.prompt || scene.text}. Style: ${imageData.style || "cinematic"}. Mood: ${imageData.mood || "dynamic"}`;
      const aspectRatio = orientation === OrientationEnum.portrait ? "9:16" : "16:9";

      const result = await imageGenerationService.generateImages({
        prompt: enhancedPrompt,
        numberOfImages: 1,
        aspectRatio: aspectRatio as "9:16" | "16:9"
      }, videoId, i);

      if (!result.success || !result.images || result.images.length === 0) {
        throw new Error(`Failed to generate GPT image for scene ${i + 1}`);
      }

      const generatedImage = result.images[0];
      const simpleFilename = `gpt_scene_${i + 1}_${videoId}.png`;
      const savedImagePath = path.join(videoTempDir, simpleFilename);

      await fs.writeFile(savedImagePath, generatedImage.data);

      const fileExists = await fs.pathExists(savedImagePath);
      const fileStats = fileExists ? await fs.stat(savedImagePath) : null;

      logger.info({
        sceneIndex: i + 1,
        imagePath: savedImagePath,
        fileExists,
        fileSize: fileStats?.size
      }, "✅ GPT Image saved");

      imageDataList.push({
        imagePath: savedImagePath,
        duration: 3,
        sceneText: scene.text
      });
    }

    logger.info({ totalImages: imageDataList.length }, "🎉 All GPT images generated");
    return imageDataList;
  }
}
