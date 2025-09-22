import { logger } from "../../config";
import { ImageGenerationResult, ImageGenerationQuery } from "../types/imagen";

/**
 * Nano Banana (Gemini 2.5 Flash Image) Service
 * Advanced image generation with editing capabilities
 */
export class NanoBananaService {
  private apiKey: string;
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  private modelId = "gemini-2.5-flash-image-preview";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Google Gemini API key is required for Nano Banana service");
    }
    this.apiKey = apiKey;
  }

  /**
   * Generate images using Nano Banana (Gemini 2.5 Flash Image)
   */
  async generateImages(query: ImageGenerationQuery): Promise<ImageGenerationResult> {
    try {
      logger.debug({ query }, "Generating images with Nano Banana API");

      const numberOfImages = query.numberOfImages || 1;
      const images = [];
      
      // Generate images sequentially (Nano Banana doesn't support batch generation)
      for (let i = 0; i < numberOfImages; i++) {
        logger.debug({ imageIndex: i + 1, totalImages: numberOfImages }, "Generating image");
        
        const request = this.buildNanoBananaRequest(query);
        const response = await this.callNanoBananaAPI(request);

        if (!response.candidates || response.candidates.length === 0) {
          logger.warn(`No images generated in response for image ${i + 1}`);
          continue;
        }

        for (let candidateIndex = 0; candidateIndex < response.candidates.length; candidateIndex++) {
          const candidate = response.candidates[candidateIndex];
          if (candidate.content && candidate.content.parts) {
            for (let partIndex = 0; partIndex < candidate.content.parts.length; partIndex++) {
              const part = candidate.content.parts[partIndex];
              if (part.inlineData && part.inlineData.data) {
                const imageData = Buffer.from(part.inlineData.data, "base64");
                images.push({
                  data: imageData,
                  filename: `nano-banana-${Date.now()}-${i + 1}.png`,
                  mimeType: part.inlineData.mimeType || "image/png",
                });
              }
            }
          }
        }

        // Add delay between requests to avoid rate limiting (except for last request)
        if (i < numberOfImages - 1) {
          logger.debug("Adding delay between requests to avoid rate limiting");
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (images.length === 0) {
        throw new Error("No valid images found in any response");
      }

      logger.debug(
        { 
          promptLength: query.prompt.length,
          imageCount: images.length,
          totalSize: images.reduce((acc, img) => acc + img.data.length, 0)
        },
        "Images generated successfully with Nano Banana"
      );

      return {
        success: true,
        images,
      };
    } catch (error) {
      logger.error({ error, query }, "Failed to generate images with Nano Banana");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Build Nano Banana API request with multi-image support
   */
  private buildNanoBananaRequest(query: ImageGenerationQuery) {
    const config: any = {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    };

    // Note: candidateCount not supported by gemini-2.5-flash-image-preview
    // Each API call generates exactly 1 image

    const parts: any[] = [
      {
        text: query.prompt
      }
    ];

    // Add reference images for multi-image context (up to 3 images supported)
    if (query.referenceImages && query.referenceImages.length > 0) {
      const maxReferenceImages = Math.min(query.referenceImages.length, 3);
      logger.debug({ referenceImageCount: maxReferenceImages }, "Adding reference images to request");
      
      for (let i = 0; i < maxReferenceImages; i++) {
        const refImage = query.referenceImages[i];
        parts.push({
          inlineData: {
            mimeType: refImage.mimeType,
            data: refImage.data.toString('base64')
          }
        });
      }
    }

    return {
      contents: [
        {
          parts
        }
      ],
      generationConfig: config
    };
  }

  /**
   * Make HTTP request to Nano Banana API
   */
  private async callNanoBananaAPI(request: any): Promise<any> {
    const url = `${this.baseUrl}/models/${this.modelId}:generateContent`;

    logger.debug({ url, requestBody: request }, "Calling Nano Banana API");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { 
          status: response.status, 
          statusText: response.statusText, 
          errorText 
        },
        "Nano Banana API request failed"
      );
      throw new Error(
        `Nano Banana API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result = await response.json();
    logger.debug({ result }, "Nano Banana API raw response received");
    
    return result;
  }

  /**
   * Test API connection and authentication
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const testQuery: ImageGenerationQuery = {
        prompt: "A simple red circle on white background",
        numberOfImages: 1,
      };

      const result = await this.generateImages(testQuery);
      
      if (result.success) {
        logger.info("Nano Banana API connection test successful");
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error }, "Nano Banana API connection test failed");
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Generate reference image set for character consistency
   * Following the recommended routine for maintaining character/style consistency
   */
  async generateReferenceSet(
    baseCharacter: string,
    count: number = 12,
    variations = {
      angles: ["front view", "45 degree angle", "side profile", "three-quarter view"],
      expressions: ["neutral expression", "gentle smile", "focused expression", "determined look"],
      compositions: ["upper body shot", "full body shot", "close-up portrait"],
      lighting: ["soft lighting", "dramatic lighting", "natural lighting", "backlit"]
    }
  ): Promise<{
    success: boolean;
    images?: Array<{
      data: Buffer;
      filename: string;
      mimeType: string;
      prompt: string;
      variations: {
        angle: string;
        expression: string;
        composition: string;
        lighting: string;
      };
    }>;
    error?: string;
  }> {
    try {
      logger.info({ baseCharacter, count }, "Generating reference image set for character consistency");

      const { angles, expressions, compositions, lighting } = variations;
      const images = [];

      for (let i = 0; i < count; i++) {
        // Systematically cycle through variations for maximum coverage
        const angle = angles[i % angles.length];
        const expression = expressions[Math.floor(i / angles.length) % expressions.length];
        const composition = compositions[Math.floor(i / (angles.length * expressions.length)) % compositions.length];
        const lightingStyle = lighting[Math.floor(i / (angles.length * expressions.length * compositions.length)) % lighting.length];
        
        // Create "성경(bible)" prompt with fixed character attributes
        const variationPrompt = `${baseCharacter}, ${angle}, ${expression}, ${composition}, ${lightingStyle}, consistent character design, same person, maintain exact appearance`;
        
        logger.debug({ 
          imageIndex: i + 1, 
          totalImages: count,
          variations: { angle, expression, composition, lighting: lightingStyle }
        }, "Generating reference image");

        const query: ImageGenerationQuery = {
          prompt: variationPrompt,
          numberOfImages: 1,
          aspectRatio: "1:1",
        };

        const result = await this.generateImages(query);
        
        if (result.success && result.images && result.images.length > 0) {
          const image = result.images[0];
          images.push({
            ...image,
            filename: `ref-${i + 1}-${image.filename}`,
            prompt: variationPrompt,
            variations: {
              angle,
              expression,
              composition,
              lighting: lightingStyle
            }
          });
        } else {
          logger.warn({ imageIndex: i + 1, error: result.error }, "Failed to generate reference image");
        }

        // Add delay between requests to avoid rate limiting
        if (i < count - 1) {
          logger.debug("Adding delay between reference image requests");
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      if (images.length === 0) {
        return {
          success: false,
          error: "No reference images were generated successfully"
        };
      }

      logger.info({ 
        baseCharacter, 
        totalGenerated: images.length, 
        requestedCount: count 
      }, "Reference image set generation completed");

      return {
        success: true,
        images
      };

    } catch (error) {
      logger.error({ error, baseCharacter }, "Failed to generate reference image set");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  }

  /**
   * Generate image with style transfer using reference images
   * Implements multi-image context for character consistency
   */
  async generateWithStyleTransfer(
    prompt: string,
    referenceImages: { data: Buffer; mimeType: string; }[],
    options: {
      aspectRatio?: string;
      styleStrength?: "subtle" | "moderate" | "strong";
    } = {}
  ): Promise<ImageGenerationResult> {
    try {
      const { aspectRatio = "1:1", styleStrength = "moderate" } = options;
      
      // Enhance prompt for style transfer
      const stylePrompts = {
        subtle: "lightly inspired by the reference style",
        moderate: "following the reference style and character design",
        strong: "exactly matching the reference style and character appearance"
      };
      
      const enhancedPrompt = `${prompt}, ${stylePrompts[styleStrength]}, maintain character consistency, same art style`;
      
      logger.info({ 
        prompt: enhancedPrompt, 
        referenceImageCount: referenceImages.length,
        styleStrength 
      }, "Generating image with style transfer");

      const query: ImageGenerationQuery = {
        prompt: enhancedPrompt,
        numberOfImages: 1,
        aspectRatio: aspectRatio as "9:16" | "16:9" | "1:1" | "3:4" | "4:3",
        referenceImages
      };

      return await this.generateImages(query);

    } catch (error) {
      logger.error({ error, prompt }, "Failed to generate image with style transfer");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  }

  /**
   * Validate prompt for Nano Banana requirements
   */
  static validatePrompt(prompt: string): { valid: boolean; error?: string } {
    if (!prompt || prompt.trim().length === 0) {
      return { valid: false, error: "Prompt cannot be empty" };
    }

    if (prompt.length > 4000) {
      return { valid: false, error: "Prompt is too long (max 4000 characters for Nano Banana)" };
    }

    return { valid: true };
  }
}