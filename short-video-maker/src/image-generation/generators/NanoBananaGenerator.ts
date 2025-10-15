import { IImageGenerator, ImageGenerationOptions, ImageGenerationResult } from '../interfaces/IImageGenerator';
import { NanoBananaService } from '../services/NanoBananaService';
import { ImageGenerationQuery } from '../types/imagen';
import { logger } from '../../logger';

/**
 * NANO BANANA Generator (Gemini 2.5 Flash Image Adapter)
 * 기존 NanoBananaService를 IImageGenerator 인터페이스에 맞게 감싸는 어댑터
 * Buffer만 반환, 파일 저장하지 않음 (메모리 효율적)
 */
export class NanoBananaGenerator implements IImageGenerator {
  readonly modelName = 'Nano-Banana';
  private service: NanoBananaService;

  constructor(apiKey: string, tempDir: string) {
    this.service = new NanoBananaService(apiKey, tempDir);
    logger.info({ model: this.modelName }, 'Nano Banana Generator initialized');
  }

  /**
   * 모델 사용 가능 여부 확인
   */
  async isAvailable(): Promise<boolean> {
    try {
      // API 키가 있는지 확인
      return true; // NanoBananaService 초기화 성공하면 사용 가능
    } catch (error) {
      logger.error({ error, model: this.modelName }, 'Nano Banana model not available');
      return false;
    }
  }

  /**
   * 단일 이미지 생성 (Buffer 반환, 파일 저장 안함)
   */
  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    try {
      // IImageGenerator 옵션을 NanoBanana 쿼리로 변환
      const query = this.convertToNanoBananaQuery(options);

      // 기존 서비스 호출 (returns Buffers)
      const result = await this.service.generateImages(query);

      // 결과가 성공적이고 이미지가 있으면
      if (result.success && result.images && result.images.length > 0) {
        // Buffer만 반환 (파일 저장 안함!)
        return {
          success: true,
          buffer: result.images[0].data,
          model: this.modelName,
          timestamp: Date.now()
        };
      }

      return {
        success: false,
        error: result.error || 'No images generated',
        model: this.modelName,
        timestamp: Date.now()
      };

    } catch (error: any) {
      logger.error({ error: error.message, model: this.modelName }, 'Image generation failed');
      return {
        success: false,
        error: error.message,
        model: this.modelName,
        timestamp: Date.now()
      };
    }
  }

  /**
   * 여러 이미지 생성 (Buffer 반환, 파일 저장 안함)
   */
  async generateImages(options: ImageGenerationOptions): Promise<ImageGenerationResult[]> {
    const numberOfImages = options.numberOfImages || 1;
    const results: ImageGenerationResult[] = [];

    try {
      // IImageGenerator 옵션을 NanoBanana 쿼리로 변환
      const query = this.convertToNanoBananaQuery(options);

      // 기존 서비스 호출 (returns Buffers)
      const result = await this.service.generateImages(query);

      // 각 이미지를 개별 결과로 변환
      if (result.success && result.images) {
        for (const imageBuffer of result.images) {
          // Buffer만 반환 (파일 저장 안함!)
          results.push({
            success: true,
            buffer: imageBuffer.data,
            model: this.modelName,
            timestamp: Date.now()
          });
        }
      } else {
        // 실패한 경우 에러 결과 추가
        results.push({
          success: false,
          error: result.error || 'Image generation failed',
          model: this.modelName,
          timestamp: Date.now()
        });
      }

      return results;

    } catch (error: any) {
      logger.error({ error: error.message, model: this.modelName }, 'Multiple image generation failed');
      return [{
        success: false,
        error: error.message,
        model: this.modelName,
        timestamp: Date.now()
      }];
    }
  }

  /**
   * IImageGenerator 옵션을 NanoBanana 쿼리로 변환
   */
  private convertToNanoBananaQuery(options: ImageGenerationOptions): ImageGenerationQuery {
    let prompt = options.prompt;

    // 스타일과 무드를 프롬프트에 추가
    if (options.style) {
      prompt += `. Style: ${options.style}`;
    }
    if (options.mood) {
      prompt += `. Mood: ${options.mood}`;
    }

    return {
      prompt,
      numberOfImages: options.numberOfImages || 1,
      // NanoBanana는 size를 직접 지원하지 않음 (프롬프트로 조절)
    };
  }
}
