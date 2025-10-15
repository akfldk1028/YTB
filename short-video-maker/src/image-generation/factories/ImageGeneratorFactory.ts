import { IImageGenerator } from '../interfaces/IImageGenerator';
import { NanoBananaGenerator } from '../generators/NanoBananaGenerator';
import { GPTImageGenerator } from '../generators/GPTImageGenerator';
import { logger } from '../../logger';

/**
 * 지원하는 이미지 생성 모델 타입
 */
export type ImageModelType = 'nano-banana' | 'gpt-image';

/**
 * Image Generator Factory
 * 환경 설정에 따라 적절한 이미지 생성 모델을 반환
 */
export class ImageGeneratorFactory {
  /**
   * 이미지 생성기 생성
   * @param modelType 모델 타입 ('nano-banana' | 'gpt-image')
   * @param apiKey API 키 (Gemini or OpenAI)
   * @param tempDir 임시 디렉토리
   */
  static create(
    modelType: ImageModelType,
    apiKey: string,
    tempDir: string
  ): IImageGenerator {
    logger.info({ modelType, tempDir }, 'Creating image generator');

    switch (modelType) {
      case 'nano-banana':
        return new NanoBananaGenerator(apiKey, tempDir);

      case 'gpt-image':
        return new GPTImageGenerator(apiKey, tempDir);

      default:
        throw new Error(`Unsupported image model type: ${modelType}`);
    }
  }

  /**
   * 환경 변수 기반으로 이미지 생성기 생성
   * @param config Config 객체
   */
  static createFromConfig(config: {
    imageModel: ImageModelType;
    geminiApiKey?: string;
    openaiApiKey?: string;
    tempDirPath: string;
  }): IImageGenerator {
    const { imageModel, geminiApiKey, openaiApiKey, tempDirPath } = config;

    // 모델에 맞는 API 키 선택
    let apiKey: string;

    if (imageModel === 'nano-banana') {
      if (!geminiApiKey) {
        throw new Error('Gemini API key is required for Nano Banana model');
      }
      apiKey = geminiApiKey;
    } else if (imageModel === 'gpt-image') {
      if (!openaiApiKey) {
        throw new Error('OpenAI API key is required for GPT Image model');
      }
      apiKey = openaiApiKey;
    } else {
      throw new Error(`Invalid image model: ${imageModel}`);
    }

    return this.create(imageModel, apiKey, tempDirPath);
  }

  /**
   * 사용 가능한 모델 목록 반환
   */
  static getAvailableModels(): ImageModelType[] {
    return ['nano-banana', 'gpt-image'];
  }

  /**
   * 모델이 유효한지 확인
   */
  static isValidModel(modelType: string): modelType is ImageModelType {
    return this.getAvailableModels().includes(modelType as ImageModelType);
  }
}
