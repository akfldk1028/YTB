import { ImagenService } from "./ImagenService";
import { NanoBananaService } from "./NanoBananaService";
import { ImageModelType, getModelConfig } from "../models/imageModels";
import { ImageGenerationQuery, ImageGenerationResult } from "../types/imagen";
import { logger } from "../../config";

/**
 * Unified Image Generation Service
 * Supports multiple AI models for image generation
 */
export class ImageGenerationService {
  private imagenService?: ImagenService;
  private nanoBananaService?: NanoBananaService;
  private currentModel: ImageModelType;

  constructor(apiKey: string, defaultModel: ImageModelType = ImageModelType.IMAGEN_4, tempDirPath?: string) {
    if (!apiKey) {
      throw new Error("API key is required for Image Generation Service");
    }

    this.currentModel = defaultModel;
    
    // Initialize available services
    this.imagenService = new ImagenService(apiKey);
    this.nanoBananaService = new NanoBananaService(apiKey, tempDirPath);
  }

  /**
   * Switch between different image generation models
   */
  setModel(modelType: ImageModelType): void {
    this.currentModel = modelType;
    logger.info({ modelType }, "Switched to image generation model");
  }

  /**
   * Get current model information
   */
  getCurrentModel() {
    return getModelConfig(this.currentModel);
  }

  /**
   * Generate images using the currently selected model
   */
  async generateImages(query: ImageGenerationQuery, videoId?: string, sceneIndex?: number): Promise<ImageGenerationResult> {
    const modelConfig = this.getCurrentModel();
    logger.info({ model: modelConfig.name, prompt: query.prompt.substring(0, 100) }, "Generating images");

    try {
      switch (this.currentModel) {
        case ImageModelType.IMAGEN_4:
          if (!this.imagenService) {
            throw new Error("Imagen service not initialized");
          }
          return await this.imagenService.generateImages(query);

        case ImageModelType.NANO_BANANA:
          if (!this.nanoBananaService) {
            throw new Error("Nano Banana service not initialized");
          }
          return await this.nanoBananaService.generateImages(query, videoId, sceneIndex);

        default:
          throw new Error(`Unsupported model type: ${this.currentModel}`);
      }
    } catch (error) {
      logger.error({ error, model: modelConfig.name }, "Image generation failed");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Compare results from multiple models
   */
  async compareModels(query: ImageGenerationQuery, models: ImageModelType[]): Promise<{
    [key in ImageModelType]?: ImageGenerationResult;
  }> {
    const results: { [key in ImageModelType]?: ImageGenerationResult } = {};
    
    logger.info({ models, prompt: query.prompt.substring(0, 100) }, "Starting model comparison");

    for (const modelType of models) {
      try {
        const originalModel = this.currentModel;
        this.setModel(modelType);
        
        const result = await this.generateImages(query);
        results[modelType] = result;
        
        // Restore original model
        this.setModel(originalModel);
        
        logger.debug({ model: modelType, success: result.success }, "Model comparison result");
      } catch (error) {
        logger.error({ model: modelType, error }, "Model comparison failed");
        results[modelType] = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    return results;
  }

  /**
   * Test connection for current model
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    const modelConfig = this.getCurrentModel();
    
    try {
      switch (this.currentModel) {
        case ImageModelType.IMAGEN_4:
          if (!this.imagenService) {
            throw new Error("Imagen service not initialized");
          }
          return await this.imagenService.testConnection();

        case ImageModelType.NANO_BANANA:
          if (!this.nanoBananaService) {
            throw new Error("Nano Banana service not initialized");
          }
          return await this.nanoBananaService.testConnection();

        default:
          return { success: false, error: `Unsupported model: ${this.currentModel}` };
      }
    } catch (error) {
      logger.error({ model: modelConfig.name, error }, "Connection test failed");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Validate prompt for current model
   */
  validatePrompt(prompt: string): { valid: boolean; error?: string } {
    switch (this.currentModel) {
      case ImageModelType.IMAGEN_4:
        return ImagenService.validatePrompt(prompt);

      case ImageModelType.NANO_BANANA:
        return NanoBananaService.validatePrompt(prompt);

      default:
        return { valid: false, error: `Unknown model: ${this.currentModel}` };
    }
  }

  /**
   * Get model capabilities and limits
   */
  getModelCapabilities() {
    const config = this.getCurrentModel();
    return {
      name: config.name,
      description: config.description,
      maxImages: config.maxImages,
      supportedSizes: config.supportedSizes,
      supportedAspectRatios: config.supportedAspectRatios,
      features: config.features,
      costPerImage: config.costPerImage,
    };
  }

  /**
   * Get direct access to NanoBananaService for advanced features
   */
  getNanoBananaService(): NanoBananaService | undefined {
    return this.nanoBananaService;
  }

  /**
   * Get direct access to ImagenService for advanced features
   */
  getImagenService(): ImagenService | undefined {
    return this.imagenService;
  }
}