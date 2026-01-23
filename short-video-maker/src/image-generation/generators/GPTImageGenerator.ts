import { IImageGenerator, ImageGenerationOptions, ImageGenerationResult } from '../interfaces/IImageGenerator';
import { logger } from '../../logger';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';

/**
 * OpenAI GPT Image Generator (gpt-image-1.5)
 * 🔥 2026-01: gpt-image-1 → gpt-image-1.5 업그레이드
 * - 4x 빠른 생성 속도
 * - 20% 저렴한 가격
 * - facial likeness consistent across edits (얼굴 일관성 유지 개선)
 * - 더 정확한 instruction following
 */
export class GPTImageGenerator implements IImageGenerator {
  readonly modelName = 'GPT-Image-1.5';
  private apiKey: string;
  private tempDir: string;
  private baseURL = 'https://api.openai.com/v1/images/generations';

  constructor(apiKey: string, tempDir: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required for GPT Image Generator');
    }
    this.apiKey = apiKey;
    this.tempDir = tempDir;
    logger.info({ model: this.modelName }, 'GPT Image Generator initialized');
  }

  /**
   * 모델 사용 가능 여부 확인
   */
  async isAvailable(): Promise<boolean> {
    try {
      // API 키 유효성 검사 (간단한 요청)
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      logger.error({ error, model: this.modelName }, 'GPT Image model not available');
      return false;
    }
  }

  /**
   * 단일 이미지 생성 (Buffer 반환, 파일 저장 안함)
   */
  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const startTime = Date.now();

    try {
      logger.info({
        model: this.modelName,
        prompt: options.prompt,
        size: options.size || '1024x1024',
        quality: options.quality || 'high'
      }, 'Starting GPT image generation');

      // OpenAI API 요청 (gpt-image-1.5)
      // 🔥 GPT Image 모델은 b64_json으로 응답 (기본값)
      const response = await axios.post(
        this.baseURL,
        {
          model: 'gpt-image-1.5',
          prompt: this.buildPrompt(options),
          size: options.size || '1024x1024',
          quality: options.quality || 'high',
          n: 1
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60초 타임아웃 (gpt-image-1.5는 4x 빠름)
        }
      );

      // gpt-image-1.5 returns base64-encoded image, not URL
      const base64Data = response.data.data[0].b64_json;

      if (!base64Data) {
        throw new Error('No b64_json in response from gpt-image-1.5 API');
      }

      // Convert base64 to Buffer
      const imageBuffer = Buffer.from(base64Data, 'base64');

      const duration = Date.now() - startTime;
      logger.info({
        model: this.modelName,
        bufferSize: imageBuffer.length,
        duration: `${duration}ms`
      }, 'GPT image generated successfully (as Buffer)');

      return {
        success: true,
        buffer: imageBuffer,
        model: this.modelName,
        timestamp: Date.now()
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Log detailed error information from OpenAI API
      const errorDetails: any = {
        message: error.message,
        model: this.modelName,
        duration: `${duration}ms`
      };

      // Include response data if available
      if (error.response) {
        errorDetails.status = error.response.status;
        errorDetails.statusText = error.response.statusText;
        errorDetails.data = error.response.data;
      }

      logger.error(errorDetails, 'GPT image generation failed');

      return {
        success: false,
        error: error.message,
        model: this.modelName,
        timestamp: Date.now()
      };
    }
  }

  /**
   * 여러 이미지 생성 (Buffer 반환)
   */
  async generateImages(options: ImageGenerationOptions): Promise<ImageGenerationResult[]> {
    const numberOfImages = options.numberOfImages || 1;
    const results: ImageGenerationResult[] = [];

    logger.info({
      model: this.modelName,
      count: numberOfImages
    }, 'Generating multiple images');

    // 순차적으로 생성 (병렬로 하면 rate limit 걸릴 수 있음)
    for (let i = 0; i < numberOfImages; i++) {
      const result = await this.generateImage(options);
      results.push(result);

      // 다음 요청 전 약간의 딜레이 (rate limit 방지)
      if (i < numberOfImages - 1) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * 프롬프트 빌드 (스타일, 무드 포함)
   */
  private buildPrompt(options: ImageGenerationOptions): string {
    let prompt = options.prompt;

    if (options.style) {
      prompt += `. Style: ${options.style}`;
    }

    if (options.mood) {
      prompt += `. Mood: ${options.mood}`;
    }

    return prompt;
  }

  /**
   * 이미지 다운로드 (Buffer로만, 파일 저장 안함)
   */
  private async downloadImageAsBuffer(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const buffer = Buffer.from(response.data);
    logger.debug({ size: buffer.length }, 'Image downloaded as Buffer');

    return buffer;
  }

  /**
   * 딜레이 유틸
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
