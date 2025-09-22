import { logger } from "../../config";
import {
  ImagenRequest,
  ImagenResponse,
  ImagenAPIRequest,
  ImagenAPIResponse,
  ImageGenerationResult,
  ImageGenerationQuery,
  IMAGEN_MODELS,
  ImagenModel,
} from "../types/imagen";

export class ImagenService {
  private apiKey: string;
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Google Gemini API key is required for Imagen service");
    }
    this.apiKey = apiKey;
  }

  /**
   * Generate images using Google Imagen API
   */
  async generateImages(query: ImageGenerationQuery): Promise<ImageGenerationResult> {
    try {
      logger.debug({ query }, "Generating images with Imagen API");

      const request = this.buildImagenRequest(query);
      const response = await this.callImagenAPI(request);
      
      if (!response.generatedImages || response.generatedImages.length === 0) {
        throw new Error("No images generated in response");
      }

      const images = response.generatedImages.map((img, index) => ({
        data: Buffer.from(img.image.imageBytes, "base64"),
        filename: `imagen-${Date.now()}-${index}.png`,
        mimeType: "image/png",
      }));

      logger.debug(
        { 
          promptLength: query.prompt.length,
          imageCount: images.length,
          totalSize: images.reduce((acc, img) => acc + img.data.length, 0)
        },
        "Images generated successfully"
      );

      return {
        success: true,
        images,
      };
    } catch (error) {
      logger.error({ error, query }, "Failed to generate images with Imagen");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Build Imagen API request from query
   */
  private buildImagenRequest(query: ImageGenerationQuery): ImagenAPIRequest {
    const parameters: ImagenAPIRequest["parameters"] = {};

    if (query.numberOfImages !== undefined) {
      parameters.sampleCount = Math.min(Math.max(query.numberOfImages, 1), 4);
    }

    if (query.aspectRatio) {
      parameters.aspectRatio = query.aspectRatio;
    }

    if (query.size) {
      parameters.sampleImageSize = query.size;
    }

    if (query.allowPeople !== undefined) {
      parameters.personGeneration = query.allowPeople ? "allow_adult" : "dont_allow";
    }

    return {
      instances: [{ prompt: query.prompt }],
      ...(Object.keys(parameters).length > 0 && { parameters }),
    };
  }

  /**
   * Make HTTP request to Imagen API
   */
  private async callImagenAPI(request: ImagenAPIRequest): Promise<ImagenAPIResponse> {
    const model = IMAGEN_MODELS.IMAGEN_4_GENERATE;
    const url = `${this.baseUrl}/models/${model}:predict`;

    logger.debug({ url, requestBody: request }, "Calling Imagen API");

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
        "Imagen API request failed"
      );
      throw new Error(
        `Imagen API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result = await response.json();
    logger.debug({ result }, "Imagen API raw response received");
    
    // Handle different response formats
    if (result.predictions && Array.isArray(result.predictions)) {
      // Convert predictions format to expected format
      const convertedResult: ImagenAPIResponse = {
        generatedImages: result.predictions.map((pred: any) => ({
          image: {
            imageBytes: pred.image?.inlineData?.data || pred.bytesBase64Encoded || "",
          },
        })),
      };
      logger.debug({ imageCount: convertedResult.generatedImages?.length }, "Converted predictions response");
      return convertedResult;
    }
    
    if (result.generatedImages) {
      logger.debug({ imageCount: result.generatedImages?.length }, "Standard response format");
      return result as ImagenAPIResponse;
    }
    
    logger.error({ result }, "Unexpected API response format");
    throw new Error("Unexpected API response format");  
  }

  /**
   * Validate prompt for Imagen requirements
   */
  static validatePrompt(prompt: string): { valid: boolean; error?: string } {
    if (!prompt || prompt.trim().length === 0) {
      return { valid: false, error: "Prompt cannot be empty" };
    }

    if (prompt.length > 2000) {
      return { valid: false, error: "Prompt is too long (max 2000 characters)" };
    }

    // Basic content filtering (you can expand this)
    const forbiddenWords = ["violence", "gore", "explicit"];
    const lowerPrompt = prompt.toLowerCase();
    
    for (const word of forbiddenWords) {
      if (lowerPrompt.includes(word)) {
        return { valid: false, error: `Prompt contains forbidden content: ${word}` };
      }
    }

    return { valid: true };
  }

  /**
   * Test API connection and authentication
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const testQuery: ImageGenerationQuery = {
        prompt: "A simple red circle",
        numberOfImages: 1,
        aspectRatio: "1:1",
      };

      const result = await this.generateImages(testQuery);
      
      if (result.success) {
        logger.info("Imagen API connection test successful");
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error }, "Imagen API connection test failed");
      return { success: false, error: errorMessage };
    }
  }
}