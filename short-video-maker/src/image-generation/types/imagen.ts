/**
 * Google Imagen API Types
 * Based on Google Gemini API documentation
 */

export interface ImagenConfig {
  numberOfImages?: number; // 1-4, default 4
  sampleImageSize?: "1K" | "2K"; // default "1K"
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9"; // default "1:1"
  personGeneration?: "dont_allow" | "allow_adult" | "allow_all"; // default "allow_adult"
}

export interface ImagenRequest {
  prompt: string;
  config?: ImagenConfig;
}

export interface ImagenResponse {
  generatedImages: GeneratedImage[];
}

export interface GeneratedImage {
  image: {
    imageBytes: string; // base64 encoded
  };
}

export interface ImagenAPIRequest {
  instances: Array<{
    prompt: string;
  }>;
  parameters?: {
    sampleCount?: number;
    sampleImageSize?: string;
    aspectRatio?: string;
    personGeneration?: string;
  };
}

export interface ImagenAPIResponse {
  generatedImages: Array<{
    image: {
      imageBytes: string;
    };
  }>;
}

export interface ImageGenerationResult {
  success: boolean;
  images?: Array<{
    data: Buffer;
    filename: string;
    mimeType: string;
  }>;
  error?: string;
  customId?: string; // For batch processing
}

export interface ImageGenerationQuery {
  prompt: string;
  numberOfImages?: number;
  aspectRatio?: ImagenConfig["aspectRatio"];
  size?: ImagenConfig["sampleImageSize"];
  allowPeople?: boolean;
  // Multi-image context for style transfer and character consistency
  referenceImages?: {
    data: Buffer;
    mimeType: string;
  }[];
}

export const IMAGEN_MODELS = {
  IMAGEN_4_GENERATE: "imagen-4.0-generate-001",
} as const;

export type ImagenModel = typeof IMAGEN_MODELS[keyof typeof IMAGEN_MODELS];