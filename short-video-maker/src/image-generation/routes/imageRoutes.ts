import express from "express";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { ImageGenerationService } from "../services/ImageGenerationService";
import { ImageModelType, getAllModels, getModelConfig } from "../models/imageModels";
import { ImageGenerationQuery } from "../types/imagen";
import { saveImageToFile, saveImageSet, generateImageFilename, imageToDataUri } from "../utils/imageUtils";
import { runImagenTest } from "../tests/imagenTest";
import { logger } from "../../config";
import { Config } from "../../config";
import path from "path";
import fs from "fs-extra";

export class ImageRoutes {
  public router: express.Router;
  private config: Config;
  private imageService?: ImageGenerationService;

  constructor(config: Config) {
    this.config = config;
    this.router = express.Router();
    
    // Initialize Image Generation service if API key is available
    if (config.googleGeminiApiKey) {
      this.imageService = new ImageGenerationService(config.googleGeminiApiKey, ImageModelType.IMAGEN_4);
    }

    this.setupRoutes();
  }

  private setupRoutes() {
    this.router.use(express.json());

    // Model management
    this.router.get("/models", this.handleGetModels.bind(this));
    this.router.post("/models/switch", this.handleSwitchModel.bind(this));
    this.router.get("/models/current", this.handleGetCurrentModel.bind(this));
    
    // Test endpoint
    this.router.post("/test", this.handleTest.bind(this));
    
    // Generate single image
    this.router.post("/generate", this.handleGenerate.bind(this));
    
    // Generate multiple images with variations
    this.router.post("/generate-batch", this.handleGenerateBatch.bind(this));
    
    // Generate reference image set for character consistency  
    this.router.post("/generate-reference-set", this.handleGenerateReferenceSet.bind(this));
    
    // Generate with style transfer using reference images
    this.router.post("/generate-with-style-transfer", this.handleGenerateWithStyleTransfer.bind(this));
    
    // Compare models
    this.router.post("/compare", this.handleCompareModels.bind(this));
    
    // Health check
    this.router.get("/health", this.handleHealth.bind(this));

    // Get generated image
    this.router.get("/image/:filename", this.handleGetImage.bind(this));
  }

  /**
   * Get available models
   */
  private async handleGetModels(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const models = getAllModels();
      res.json({
        success: true,
        models,
      });
    } catch (error) {
      logger.error({ error }, "Failed to get models");
      res.status(500).json({
        error: "Failed to get models",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Switch to different model
   */
  private async handleSwitchModel(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      if (!this.imageService) {
        res.status(400).json({
          error: "Image service not available",
          message: "Google Gemini API key not configured",
        });
        return;
      }

      const { model } = req.body;

      if (!model || !Object.values(ImageModelType).includes(model)) {
        res.status(400).json({
          error: "Invalid model",
          message: `Please provide a valid model: ${Object.values(ImageModelType).join(", ")}`,
        });
        return;
      }

      this.imageService.setModel(model);
      const currentModel = this.imageService.getCurrentModel();

      res.json({
        success: true,
        message: `Switched to ${currentModel.name}`,
        model: currentModel,
      });

    } catch (error) {
      logger.error({ error }, "Failed to switch model");
      res.status(500).json({
        error: "Failed to switch model",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Get current model info
   */
  private async handleGetCurrentModel(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      if (!this.imageService) {
        res.status(400).json({
          error: "Image service not available",
          message: "Google Gemini API key not configured",
        });
        return;
      }

      const currentModel = this.imageService.getCurrentModel();
      const capabilities = this.imageService.getModelCapabilities();

      res.json({
        success: true,
        model: currentModel,
        capabilities,
      });

    } catch (error) {
      logger.error({ error }, "Failed to get current model");
      res.status(500).json({
        error: "Failed to get current model",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Compare multiple models
   */
  private async handleCompareModels(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      if (!this.imageService) {
        res.status(400).json({
          error: "Image service not available",
          message: "Google Gemini API key not configured",
        });
        return;
      }

      const { prompt, models = [ImageModelType.IMAGEN_4, ImageModelType.NANO_BANANA] } = req.body;

      if (!prompt) {
        res.status(400).json({
          error: "Missing prompt",
          message: "Please provide a text prompt for comparison",
        });
        return;
      }

      const query: ImageGenerationQuery = {
        prompt,
        numberOfImages: 1,
        aspectRatio: "1:1",
      };

      logger.info({ prompt, models }, "Starting model comparison");
      const results = await this.imageService.compareModels(query, models);

      // Save images and create response
      const comparisonResults = [];
      
      for (const [modelType, result] of Object.entries(results)) {
        if (result && result.success && result.images) {
          const savedImages = [];
          
          for (const image of result.images) {
            const filename = `${modelType}-${image.filename}`;
            const filePath = await saveImageToFile(
              image.data,
              filename,
              this.config.tempDirPath
            );

            savedImages.push({
              filename,
              url: `/api/images/image/${filename}`,
              dataUri: imageToDataUri(image.data),
              size: image.data.length,
            });
          }

          comparisonResults.push({
            model: modelType,
            modelName: getModelConfig(modelType as ImageModelType).name,
            success: true,
            images: savedImages,
          });
        } else {
          comparisonResults.push({
            model: modelType,
            modelName: getModelConfig(modelType as ImageModelType).name,
            success: false,
            error: result?.error || "Unknown error",
          });
        }
      }

      res.json({
        success: true,
        prompt,
        results: comparisonResults,
      });

    } catch (error) {
      logger.error({ error }, "Model comparison failed");
      res.status(500).json({
        error: "Model comparison failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Test API functionality
   */
  private async handleTest(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      if (!this.config.googleGeminiApiKey) {
        res.status(400).json({
          error: "Google Gemini API key not configured",
          message: "Please set GOOGLE_GEMINI_API_KEY in environment variables",
        });
        return;
      }

      logger.info("Starting Imagen API test...");

      const outputDir = path.join(this.config.tempDirPath, "imagen-test");
      await runImagenTest(this.config.googleGeminiApiKey, outputDir);

      res.json({
        success: true,
        message: "Imagen API test completed successfully",
        outputDir,
      });

    } catch (error) {
      logger.error({ error }, "Imagen API test failed");
      res.status(500).json({
        error: "Test failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Generate a single image
   */
  private async handleGenerate(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      if (!this.imageService) {
        res.status(400).json({
          error: "Image service not available",
          message: "Google Gemini API key not configured",
        });
        return;
      }

      const { prompt, numberOfImages = 1, aspectRatio = "1:1", size = "1K", allowPeople = false, model } = req.body;

      // Set model if specified
      if (model) {
        if (model === "nano-banana") {
          this.imageService.setModel(ImageModelType.NANO_BANANA);
        } else if (model === "imagen-4") {
          this.imageService.setModel(ImageModelType.IMAGEN_4);
        } else {
          res.status(400).json({
            error: "Invalid model",
            message: `Unsupported model: ${model}. Use 'nano-banana' or 'imagen-4'`,
          });
          return;
        }
      }

      if (!prompt) {
        res.status(400).json({
          error: "Missing prompt",
          message: "Please provide a text prompt for image generation",
        });
        return;
      }

      // Validate prompt
      const validation = this.imageService.validatePrompt(prompt);
      if (!validation.valid) {
        res.status(400).json({
          error: "Invalid prompt",
          message: validation.error,
        });
        return;
      }

      const currentModel = this.imageService.getCurrentModel();
      const maxImages = Math.min(numberOfImages, currentModel.maxImages);

      const query: ImageGenerationQuery = {
        prompt,
        numberOfImages: maxImages,
        aspectRatio,
        size,
        allowPeople,
      };

      logger.info({ query, model: currentModel.name }, "Generating image");

      const result = await this.imageService.generateImages(query);

      if (!result.success) {
        res.status(500).json({
          error: "Image generation failed",
          message: result.error,
        });
        return;
      }

      // Save images and create response
      const savedImages = [];
      if (result.images) {
        if (result.images.length > 1) {
          // Use saveImageSet for multiple images to ensure they go in the same folder
          const setName = `landscape-set-${Date.now()}`;
          const imageSetResult = await saveImageSet(
            result.images.map(img => ({
              data: img.data,
              filename: img.filename,
              prompt: query.prompt
            })),
            this.config.tempDirPath,
            {
              setName,
              category: 'landscapes',
              description: `Generated ${result.images.length} landscape images`
            }
          );

          // Create response for all images in the set
          for (const savedImage of imageSetResult.savedImages) {
            savedImages.push({
              filename: savedImage.filename,
              url: `/api/images/image/${savedImage.filename}`,
              dataUri: imageToDataUri(result.images.find(img => img.filename === savedImage.filename)?.data || Buffer.alloc(0)),
              size: savedImage.size,
              folderPath: imageSetResult.folderPath,
            });
          }
        } else {
          // Single image - save individually
          for (const image of result.images) {
            const filePath = await saveImageToFile(
              image.data,
              image.filename,
              this.config.tempDirPath,
              {
                category: 'landscapes'
              }
            );

            savedImages.push({
              filename: image.filename,
              url: `/api/images/image/${image.filename}`,
              dataUri: imageToDataUri(image.data),
              size: image.data.length,
            });
          }
        }
      }

      res.json({
        success: true,
        prompt,
        model: currentModel.name,
        images: savedImages,
      });

    } catch (error) {
      logger.error({ error }, "Image generation failed");
      res.status(500).json({
        error: "Image generation failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Generate multiple images with different parameters
   */
  private async handleGenerateBatch(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      if (!this.imageService) {
        res.status(400).json({
          error: "Image service not available",
          message: "Google Gemini API key not configured",
        });
        return;
      }

      const { basePrompt, variations = [] } = req.body;

      if (!basePrompt) {
        res.status(400).json({
          error: "Missing basePrompt",
          message: "Please provide a base text prompt for batch generation",
        });
        return;
      }

      const results = [];

      // Generate base image
      const baseQuery: ImageGenerationQuery = {
        prompt: basePrompt,
        numberOfImages: 1,
        aspectRatio: "1:1",
      };

      const baseResult = await this.imageService.generateImages(baseQuery);
      if (baseResult.success && baseResult.images) {
        for (const image of baseResult.images) {
          const filePath = await saveImageToFile(
            image.data,
            `base-${image.filename}`,
            this.config.tempDirPath
          );

          results.push({
            type: "base",
            filename: `base-${image.filename}`,
            url: `/api/images/image/base-${image.filename}`,
            prompt: basePrompt,
          });
        }
      }

      // Generate variations
      for (let i = 0; i < variations.length; i++) {
        const variation = variations[i];
        const variationPrompt = `${basePrompt}, ${variation.modifier || ""}`;
        
        const variationQuery: ImageGenerationQuery = {
          prompt: variationPrompt,
          numberOfImages: 1,
          aspectRatio: variation.aspectRatio || "1:1",
          size: variation.size || "1K",
        };

        const variationResult = await this.imageService.generateImages(variationQuery);
        if (variationResult.success && variationResult.images) {
          for (const image of variationResult.images) {
            const filename = `variation-${i}-${image.filename}`;
            const filePath = await saveImageToFile(
              image.data,
              filename,
              this.config.tempDirPath
            );

            results.push({
              type: "variation",
              filename,
              url: `/api/images/image/${filename}`,
              prompt: variationPrompt,
              variationIndex: i,
            });
          }
        }
      }

      res.json({
        success: true,
        basePrompt,
        totalImages: results.length,
        images: results,
      });

    } catch (error) {
      logger.error({ error }, "Batch image generation failed");
      res.status(500).json({
        error: "Batch generation failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Generate reference image set for character consistency
   */
  private async handleGenerateReferenceSet(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      if (!this.imageService) {
        res.status(400).json({
          error: "Image service not available",
          message: "Google Gemini API key not configured",
        });
        return;
      }

      const { 
        basePrompt,
        baseCharacter, 
        count = 12,
        variations = {
          angles: ["front view", "45 degree angle", "side profile", "three-quarter view"],
          expressions: ["neutral expression", "gentle smile", "focused expression"],
          compositions: ["upper body shot", "full body shot"],
          lighting: ["soft lighting", "dramatic lighting", "natural lighting"]
        }
      } = req.body;

      // Support both basePrompt and baseCharacter for flexibility
      const promptToUse = basePrompt || baseCharacter;

      if (!promptToUse) {
        res.status(400).json({
          error: "Missing basePrompt or baseCharacter",
          message: "Please provide a base prompt description",
        });
        return;
      }

      // Use NanoBananaService for optimized reference set generation
      const currentModel = this.imageService.getCurrentModel();
      if (currentModel.id !== "nano-banana") {
        res.status(400).json({
          error: "Reference set generation requires Nano Banana model",
          message: "Please switch to nano-banana model first",
        });
        return;
      }

      logger.info({ basePrompt: promptToUse, count }, "Generating reference image set with Nano Banana");

      const nanoBananaService = this.imageService.getNanoBananaService();
      if (!nanoBananaService) {
        res.status(500).json({
          error: "Nano Banana service not available",
          message: "Failed to access Nano Banana service",
        });
        return;
      }

      const result = await nanoBananaService.generateReferenceSet(
        promptToUse,
        count,
        variations
      );

      if (!result.success) {
        res.status(500).json({
          error: "Reference set generation failed",
          message: result.error,
        });
        return;
      }

      // Save images and create response
      const results = [];
      if (result.images) {
        for (const image of result.images) {
          const filePath = await saveImageToFile(
            image.data,
            image.filename,
            this.config.tempDirPath
          );

          results.push({
            filename: image.filename,
            url: `/api/images/image/${image.filename}`,
            dataUri: imageToDataUri(image.data),
            prompt: image.prompt,
            variations: image.variations,
            size: image.data.length,
          });
        }
      }

      res.json({
        success: true,
        basePrompt: promptToUse,
        totalImages: results.length,
        requestedCount: count,
        images: results,
        usage: "Use these reference images to maintain consistency in Veo 3 I2V generation",
        variations,
      });

    } catch (error) {
      logger.error({ error }, "Reference set generation failed");
      res.status(500).json({
        error: "Reference set generation failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Generate image with style transfer using reference images
   */
  private async handleGenerateWithStyleTransfer(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      if (!this.imageService) {
        res.status(400).json({
          error: "Image service not available",
          message: "Google Gemini API key not configured",
        });
        return;
      }

      const { prompt, referenceImages = [], aspectRatio = "1:1", styleStrength = "moderate" } = req.body;

      if (!prompt) {
        res.status(400).json({
          error: "Missing prompt",
          message: "Please provide a text prompt for style transfer",
        });
        return;
      }

      if (!referenceImages || referenceImages.length === 0) {
        res.status(400).json({
          error: "Missing reference images",
          message: "Please provide at least one reference image for style transfer",
        });
        return;
      }

      // Use only Nano Banana for style transfer
      const currentModel = this.imageService.getCurrentModel();
      if (currentModel.id !== "nano-banana") {
        res.status(400).json({
          error: "Style transfer requires Nano Banana model",
          message: "Please switch to nano-banana model first",
        });
        return;
      }

      const nanoBananaService = this.imageService.getNanoBananaService();
      if (!nanoBananaService) {
        res.status(500).json({
          error: "Nano Banana service not available",
          message: "Failed to access Nano Banana service",
        });
        return;
      }

      // Convert base64 reference images to Buffer format
      const processedReferenceImages = referenceImages.map((refImg: any) => ({
        data: Buffer.from(refImg.data, 'base64'),
        mimeType: refImg.mimeType || 'image/png'
      }));

      logger.info({ 
        prompt: prompt.substring(0, 100), 
        referenceImageCount: processedReferenceImages.length,
        styleStrength 
      }, "Generating image with style transfer");

      const result = await nanoBananaService.generateWithStyleTransfer(
        prompt,
        processedReferenceImages,
        { aspectRatio, styleStrength }
      );

      if (!result.success) {
        res.status(500).json({
          error: "Style transfer generation failed",
          message: result.error,
        });
        return;
      }

      // Save images and create response
      const savedImages = [];
      if (result.images) {
        for (const image of result.images) {
          const filename = `style-transfer-${image.filename}`;
          const filePath = await saveImageToFile(
            image.data,
            filename,
            this.config.tempDirPath
          );

          savedImages.push({
            filename,
            url: `/api/images/image/${filename}`,
            dataUri: imageToDataUri(image.data),
            size: image.data.length,
          });
        }
      }

      res.json({
        success: true,
        prompt,
        styleStrength,
        referenceImageCount: processedReferenceImages.length,
        images: savedImages,
        usage: "Image generated with character/style consistency from reference images",
      });

    } catch (error) {
      logger.error({ error }, "Style transfer generation failed");
      res.status(500).json({
        error: "Style transfer generation failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Health check endpoint
   */
  private async handleHealth(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    const currentModel = this.imageService?.getCurrentModel();
    
    const status = {
      service: "Image Generation",
      currentModel: currentModel?.name || "None",
      status: "unknown",
      apiKeyConfigured: !!this.config.googleGeminiApiKey,
      timestamp: new Date().toISOString(),
    };

    if (!this.imageService) {
      status.status = "unavailable";
      res.status(503).json(status);
      return;
    }

    try {
      const testResult = await this.imageService.testConnection();
      status.status = testResult.success ? "healthy" : "unhealthy";
      
      if (testResult.success) {
        res.json({
          ...status,
          capabilities: this.imageService.getModelCapabilities(),
        });
      } else {
        res.status(503).json({
          ...status,
          error: testResult.error,
        });
      }
    } catch (error) {
      status.status = "error";
      res.status(503).json({
        ...status,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Serve generated images
   */
  private async handleGetImage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const { filename } = req.params;
      
      if (!filename) {
        res.status(400).json({ error: "Filename is required" });
        return;
      }

      const imagePath = path.join(this.config.tempDirPath, filename);
      
      // Check if file exists
      const fs = require("fs-extra");
      if (!await fs.pathExists(imagePath)) {
        res.status(404).json({ error: "Image not found" });
        return;
      }

      // Serve the image
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400"); // 24 hours
      
      const imageStream = fs.createReadStream(imagePath);
      imageStream.pipe(res);

    } catch (error) {
      logger.error({ error }, "Failed to serve image");
      res.status(500).json({
        error: "Failed to serve image",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}