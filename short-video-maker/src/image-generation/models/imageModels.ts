/**
 * Image Generation Models Configuration
 * Support for multiple AI image generation models
 */

export enum ImageModelType {
  IMAGEN_4 = "imagen-4",
  NANO_BANANA = "nano-banana",
}

export interface ImageModelConfig {
  id: string;
  name: string;
  description: string;
  apiEndpoint: string;
  modelId: string;
  maxImages: number;
  supportedSizes: string[];
  supportedAspectRatios: string[];
  costPerImage?: string;
  features: string[];
}

export const IMAGE_MODELS: Record<ImageModelType, ImageModelConfig> = {
  [ImageModelType.IMAGEN_4]: {
    id: "imagen-4",
    name: "Google Imagen 4.0",
    description: "High-quality image generation with precise control",
    apiEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    modelId: "imagen-4.0-generate-001",
    maxImages: 4,
    supportedSizes: ["1K", "2K"],
    supportedAspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    costPerImage: "Low",
    features: [
      "Text-to-image generation",
      "High resolution output",
      "Multiple aspect ratios",
      "Person generation control"
    ]
  },
  [ImageModelType.NANO_BANANA]: {
    id: "nano-banana", 
    name: "Gemini 2.5 Flash Image (Nano Banana)",
    description: "Advanced image generation with style consistency and editing capabilities",
    apiEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    modelId: "gemini-2.5-flash-image-preview",
    maxImages: 2,
    supportedSizes: ["1024x1024", "1792x1024", "1024x1792"],
    supportedAspectRatios: ["1:1", "16:9", "9:16"],
    costPerImage: "Medium ($30 per 1M tokens)",
    features: [
      "Text-to-image generation",
      "Image editing and modification", 
      "Multi-image composition",
      "Style transfer",
      "Character consistency",
      "Mask-free editing",
      "SynthID watermarking"
    ]
  }
};

export const DEFAULT_MODEL = ImageModelType.IMAGEN_4;

export function getModelConfig(modelType: ImageModelType): ImageModelConfig {
  return IMAGE_MODELS[modelType];
}

export function getAllModels(): ImageModelConfig[] {
  return Object.values(IMAGE_MODELS);
}

export function getModelByName(name: string): ImageModelConfig | undefined {
  return Object.values(IMAGE_MODELS).find(model => 
    model.name.toLowerCase().includes(name.toLowerCase()) ||
    model.id === name
  );
}