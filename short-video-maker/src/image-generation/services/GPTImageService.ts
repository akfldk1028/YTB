/**
 * GPT Image Service
 * OpenAI GPT-4o 기반 이미지 생성 서비스
 * ImageGenerationService와 호환되는 인터페이스 제공
 *
 * 🔥 지브리 스타일 이미지 생성에 특화
 */
import { GPTImageGenerator } from '../generators/GPTImageGenerator';
import { ImageGenerationQuery, ImageGenerationResult } from '../types/imagen';
import { logger } from '../../config';

// 🔥 지브리 스타일 프롬프트 프리픽스 (OpenAI 모더레이션 통과)
// Note: "Ghibli-style" OK, but "Studio Ghibli" or "Hayao Miyazaki" are blocked
// Reference: https://docs.aihubmix.com/en/api/GPT-Image-1
export const GHIBLI_STYLE_PREFIX = `Ghibli-style animation, hand-painted aesthetic,
soft watercolor textures, warm nostalgic lighting, whimsical dreamlike atmosphere,
detailed natural environments, expressive character design.`;

export class GPTImageService {
  private generator: GPTImageGenerator;

  constructor(apiKey: string, tempDirPath?: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required for GPT Image Service');
    }
    this.generator = new GPTImageGenerator(apiKey, tempDirPath || './temp');
    logger.info({ service: 'GPTImageService' }, 'GPT Image Service initialized');
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const available = await this.generator.isAvailable();
      return { success: available };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 프롬프트 검증
   */
  static validatePrompt(prompt: string): { valid: boolean; error?: string } {
    if (!prompt || prompt.trim().length === 0) {
      return { valid: false, error: 'Prompt is required' };
    }
    if (prompt.length > 4000) {
      return { valid: false, error: 'Prompt exceeds maximum length of 4000 characters' };
    }
    return { valid: true };
  }

  /**
   * 이미지 생성 (ImageGenerationService 호환 인터페이스)
   */
  async generateImages(
    query: ImageGenerationQuery,
    videoId?: string,
    sceneIndex?: number
  ): Promise<ImageGenerationResult> {
    const startTime = Date.now();

    try {
      // Aspect ratio → size 변환 (GPT API는 다양한 사이즈 지원)
      const size = this.aspectRatioToSize(query.aspectRatio) as any;

      logger.info({
        service: 'GPTImageService',
        prompt: query.prompt.substring(0, 100),
        aspectRatio: query.aspectRatio,
        size,
        numberOfImages: query.numberOfImages || 1,
        videoId,
        sceneIndex
      }, '🎨 Starting GPT image generation');

      const results = await this.generator.generateImages({
        prompt: query.prompt,
        numberOfImages: query.numberOfImages || 1,
        size,
        quality: 'high'
      });

      // 성공한 결과만 필터링
      const successfulResults = results.filter(r => r.success && r.buffer);

      if (successfulResults.length === 0) {
        const errorMsg = results[0]?.error || 'All image generations failed';
        logger.error({ error: errorMsg }, 'GPT image generation failed');
        return {
          success: false,
          error: errorMsg
        };
      }

      // ImageGenerationResult 형식으로 변환
      const images = successfulResults.map((result, idx) => ({
        data: result.buffer!,
        filename: `gpt_image_${videoId || 'unknown'}_${sceneIndex ?? idx}_${Date.now()}.png`,
        mimeType: 'image/png'
      }));

      const duration = Date.now() - startTime;
      logger.info({
        service: 'GPTImageService',
        imageCount: images.length,
        duration: `${duration}ms`,
        videoId,
        sceneIndex
      }, '✅ GPT images generated successfully');

      return {
        success: true,
        images
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`,
        videoId,
        sceneIndex
      }, '❌ GPT image generation failed');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 지브리 스타일 이미지 생성 (특화 메서드)
   */
  async generateGhibliImage(
    prompt: string,
    aspectRatio: ImageGenerationQuery['aspectRatio'] = '9:16',
    videoId?: string,
    sceneIndex?: number
  ): Promise<ImageGenerationResult> {
    // 지브리 스타일 프리픽스 추가
    const ghibliPrompt = `${GHIBLI_STYLE_PREFIX}\n\n${prompt}`;

    logger.info({
      service: 'GPTImageService',
      method: 'generateGhibliImage',
      originalPrompt: prompt.substring(0, 80),
      videoId,
      sceneIndex
    }, '🏔️ Generating Ghibli-style image');

    return this.generateImages({
      prompt: ghibliPrompt,
      numberOfImages: 1,
      aspectRatio
    }, videoId, sceneIndex);
  }

  /**
   * Aspect ratio → size 변환
   * 🔥 GPT Image 모델 지원 사이즈: 1024x1024, 1536x1024, 1024x1536, auto
   */
  private aspectRatioToSize(aspectRatio?: string): '1024x1024' | '1536x1024' | '1024x1536' {
    switch (aspectRatio) {
      case '16:9':
        return '1536x1024';  // landscape
      case '9:16':
        return '1024x1536';  // portrait (Shorts용)
      case '1:1':
      default:
        return '1024x1024';  // square
    }
  }
}
