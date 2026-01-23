/**
 * Image Generation Models Configuration
 * Support for multiple AI image generation models
 */

export enum ImageModelType {
  IMAGEN_4 = "imagen-4",
  NANO_BANANA = "nano-banana",
  GPT_IMAGE_1 = "gpt-image-1.5",  // 🔥 2026-01: gpt-image-1 → gpt-image-1.5 (4x faster, facial consistency)
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
    modelId: "gemini-2.5-flash-image",  // 🔥 2026-01-17: preview → production
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
  },
  // 🔥 2026-01: gpt-image-1 → gpt-image-1.5 업그레이드
  [ImageModelType.GPT_IMAGE_1]: {
    id: "gpt-image-1.5",
    name: "OpenAI GPT Image 1.5",
    description: "Latest GPT image model with 4x faster generation, facial likeness consistency across edits",
    apiEndpoint: "https://api.openai.com/v1/images/generations",
    modelId: "gpt-image-1.5",
    maxImages: 10,  // 최대 10개 지원 (per API call)
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536", "auto"],  // GPT Image 지원 사이즈
    supportedAspectRatios: ["1:1", "16:9", "9:16"],
    costPerImage: "Medium (~$0.03 per image, 20% cheaper than 1.0)",
    features: [
      "Text-to-image generation",
      "4x faster generation speed",
      "Facial likeness consistency across edits",  // 🔥 핵심!
      "Better instruction following",
      "Improved text rendering",
      "Base64 direct output",
      "Artistic style excellence (Ghibli, Pixar, etc.)"
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