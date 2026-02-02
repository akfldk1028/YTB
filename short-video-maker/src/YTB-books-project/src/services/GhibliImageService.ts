/**
 * GhibliImageService
 * GPT → NanoBanana 하이브리드 이미지 생성 전략
 *
 * Architecture.md 섹션 4.5 구현:
 * - 첫 씬: GPT-4o로 고품질 Ghibli 이미지 생성
 * - 이후 씬: NanoBanana + 첫 이미지 reference로 일관성 유지
 *
 * @author Claude (Architecture Agent)
 * @version 1.0.0
 */

import { ImageGenerationService } from '../../../image-generation/services/ImageGenerationService';
import { GPTImageService, GHIBLI_STYLE_PREFIX } from '../../../image-generation/services/GPTImageService';
import { NanoBananaService } from '../../../image-generation/services/NanoBananaService';
import { ImageModelType } from '../../../image-generation/models/imageModels';
import { ImageGenerationResult } from '../../../image-generation/types/imagen';
import { logger } from '../../../config';

/** infographic/diagram Scene용 프리픽스 (캐릭터 대신 다이어그램 중심) */
const DIAGRAM_STYLE_PREFIX = `Educational illustration, clean infographic layout,
soft pastel color palette, portrait 9:16 composition,
high contrast on white or light background, no characters, technical accuracy.
IMPORTANT: NO TEXT, NO LABELS, NO LETTERS, NO WORDS in the image. Use only icons, arrows, colors, and shapes to convey meaning.`;

/**
 * 씬 이미지 생성 결과
 */
export interface SceneImageResult {
  sceneIndex: number;
  success: boolean;
  imageBuffer?: Buffer;
  mimeType?: string;
  generator: 'gpt' | 'nano-banana';
  error?: string;
}

/**
 * 지브리 스타일 설정
 */
export interface GhibliStyleConfig {
  /** 지브리 스타일 강도 (0.0 ~ 1.0) */
  styleIntensity?: number;
  /** 무드 (nostalgic, whimsical, peaceful, adventurous) */
  mood?: 'nostalgic' | 'whimsical' | 'peaceful' | 'adventurous';
  /** 시간대 (dawn, day, sunset, night) */
  timeOfDay?: 'dawn' | 'day' | 'sunset' | 'night';
  /** 캐릭터 설명 */
  characterDescription?: string;
}

/**
 * GhibliImageService
 * GPT-4o와 NanoBanana를 결합한 하이브리드 이미지 생성
 */
export class GhibliImageService {
  private imageService: ImageGenerationService;
  private gptService?: GPTImageService;
  private nanoBananaService?: NanoBananaService;

  /** 첫 씬에서 생성된 레퍼런스 이미지 */
  private referenceImage?: { data: Buffer; mimeType: string };

  /** 생성된 모든 이미지 (일관성 추적용) */
  private generatedImages: Array<{ data: Buffer; mimeType: string; sceneIndex: number }> = [];

  constructor(
    googleApiKey: string,
    openAiApiKey: string,
    tempDirPath?: string
  ) {
    // ImageGenerationService 초기화 (GPT 포함)
    this.imageService = new ImageGenerationService(
      googleApiKey,
      ImageModelType.NANO_BANANA,
      tempDirPath,
      openAiApiKey
    );

    this.gptService = this.imageService.getGPTImageService();
    this.nanoBananaService = this.imageService.getNanoBananaService();

    if (!this.gptService) {
      logger.warn('GPT Image Service not available - will use NanoBanana only');
    }
    if (!this.nanoBananaService) {
      throw new Error('NanoBanana Service is required');
    }

    logger.info({
      hasGPT: !!this.gptService,
      hasNanoBanana: !!this.nanoBananaService
    }, 'GhibliImageService initialized');
  }

  /**
   * 프롬프트가 다이어그램/인포그래픽 요청인지 감지
   */
  private isDiagramPrompt(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    const diagramKeywords = [
      'infographic', 'diagram', 'flowchart', 'architecture diagram',
      'comparison chart', 'comparison infographic', 'timeline infographic',
      'whiteboard', 'blackboard', 'educational infographic',
      'technical diagram', 'matrix visualization', 'pipeline flowchart',
      'step-by-step flowchart', 'labeled diagram', 'labeled sections',
      'control panels', 'data flow', 'flat vector infographic'
    ];
    return diagramKeywords.some(kw => lower.includes(kw));
  }

  /**
   * 프롬프트에 맞는 스타일 프리픽스 선택 + 빌드
   */
  private buildStyledPrompt(
    basePrompt: string,
    isDiagram: boolean,
    config?: GhibliStyleConfig
  ): string {
    const prefix = isDiagram ? DIAGRAM_STYLE_PREFIX : GHIBLI_STYLE_PREFIX;
    const parts: string[] = [prefix];

    if (!isDiagram) {
      // Ghibli 스타일일 때만 무드/시간대/캐릭터 추가
      if (config?.mood) {
        const moodDescriptions: Record<string, string> = {
          nostalgic: 'warm nostalgic atmosphere, memories of childhood',
          whimsical: 'magical and whimsical, playful fantasy elements',
          peaceful: 'serene and peaceful, gentle nature harmony',
          adventurous: 'exciting adventure spirit, vast open world'
        };
        parts.push(moodDescriptions[config.mood]);
      }

      if (config?.timeOfDay) {
        const timeDescriptions: Record<string, string> = {
          dawn: 'soft morning light, golden hour, misty atmosphere',
          day: 'bright daylight, clear blue sky, vibrant colors',
          sunset: 'warm sunset glow, orange and pink sky, long shadows',
          night: 'moonlit scene, starry sky, soft shadows'
        };
        parts.push(timeDescriptions[config.timeOfDay]);
      }

      if (config?.characterDescription) {
        parts.push(`Character: ${config.characterDescription}`);
      }
    }

    // v3.2.0: 프롬프트에서 텍스트/라벨 관련 키워드 완전 제거 (AI가 한글 렌더링 못함)
    let cleanedPrompt = basePrompt
      .replace(/\blabeled?\s*\w*/gi, '')            // "labeled X" 모든 패턴
      .replace(/\b(?:clear\s+)?text\s*\w*/gi, '')   // "text labels", "text annotations"
      .replace(/\bwith\s+(?:labels?|text)\b/gi, '') // "with labels"
      .replace(/\blabels?\b/gi, '')                  // 단독 "label", "labels"
      .replace(/,\s*,/g, ',')
      .replace(/\s{2,}/g, ' ');

    parts.push(cleanedPrompt);

    // v3.1.4: 모든 이미지에 텍스트 금지
    parts.push('CRITICAL: Do NOT include ANY text, words, labels, letters, numbers, or characters in the image. No Korean, no English, no any language text. Use only visual elements (icons, arrows, shapes, colors) to express concepts.');

    return parts.join('\n\n');
  }

  /**
   * 하이브리드 이미지 생성 (핵심 메서드)
   *
   * 전략:
   * - 첫 씬 (sceneIndex === 0): GPT-4o로 고품질 지브리 이미지 생성
   * - 이후 씬: NanoBanana + 이전 이미지 references로 일관성 유지
   */
  async generateSceneImage(
    prompt: string,
    sceneIndex: number,
    aspectRatio: '1:1' | '9:16' | '16:9' = '9:16',
    config?: GhibliStyleConfig,
    videoId?: string
  ): Promise<SceneImageResult> {
    const isFirstScene = sceneIndex === 0;
    const isDiagram = this.isDiagramPrompt(prompt);
    const baseStyledPrompt = this.buildStyledPrompt(prompt, isDiagram, config);

    // v3.2.3: 씬별 구도 변화 — NanoBanana 결과 다양성 확보
    const compositions = [
      'slightly zoomed in perspective',
      'wide establishing shot',
      'close-up detail view',
      'bird\'s eye view from above',
      'three-quarter angle view',
      'soft bokeh background',
      'atmospheric layered depth',
      'centered symmetrical composition',
      'rule of thirds off-center',
      'dramatic low angle perspective'
    ];
    const compositionHint = compositions[sceneIndex % compositions.length];
    const styledPrompt = `${baseStyledPrompt}\n\nCamera composition: ${compositionHint}`;

    logger.info({
      sceneIndex,
      isFirstScene,
      isDiagram,
      strategy: isDiagram ? 'Diagram/Infographic' : (isFirstScene ? 'GPT-4o Ghibli' : 'NanoBanana + Reference'),
      prompt: prompt.substring(0, 80),
      videoId
    }, 'Generating scene image with hybrid strategy');

    try {
      let result: ImageGenerationResult;

      if (isFirstScene && this.gptService) {
        // 첫 씬: GPT-4o
        if (isDiagram) {
          // 다이어그램 씬: Ghibli prefix 대신 diagram prefix 사용
          logger.info({ sceneIndex }, 'Using GPT-4o for first scene (Diagram style)');
          result = await this.gptService.generateImages({
            prompt: styledPrompt,  // DIAGRAM_STYLE_PREFIX 적용됨
            numberOfImages: 1,
            aspectRatio
          }, videoId, sceneIndex);
        } else {
          // 일반 씬: Ghibli 스타일
          logger.info({ sceneIndex }, 'Using GPT-4o for first scene (Ghibli style)');
          result = await this.gptService.generateGhibliImage(
            prompt,
            aspectRatio,
            videoId,
            sceneIndex
          );
        }

        if (result.success && result.images?.[0]) {
          // 항상 reference로 저장 (동일성 유지)
          this.referenceImage = {
            data: result.images[0].data,
            mimeType: result.images[0].mimeType
          };

          this.generatedImages.push({
            data: result.images[0].data,
            mimeType: result.images[0].mimeType,
            sceneIndex
          });

          logger.info({
            sceneIndex,
            imageSize: result.images[0].data.length,
            generator: 'gpt',
            isDiagram
          }, 'GPT image generated');

          return {
            sceneIndex,
            success: true,
            imageBuffer: result.images[0].data,
            mimeType: result.images[0].mimeType,
            generator: 'gpt'
          };
        }

        // GPT 실패 시 NanoBanana로 fallback
        logger.warn({ sceneIndex, error: result.error }, 'GPT failed, falling back to NanoBanana');
      }

      // 이후 씬 또는 GPT 실패: NanoBanana + reference
      logger.info({
        sceneIndex,
        hasReference: !!this.referenceImage,
        previousImageCount: this.generatedImages.length
      }, 'Using NanoBanana with reference images');

      // Reference 이미지 항상 사용 (스타일 일관성 유지, isDiagram은 프리픽스만 전환)
      const referenceImages = this.getReferenceImages(3);

      result = await this.nanoBananaService!.generateImages({
        prompt: styledPrompt,
        numberOfImages: 1,
        aspectRatio,
        referenceImages
      }, videoId, sceneIndex);

      if (result.success && result.images?.[0]) {
        // 항상 reference로 저장 (동일성 유지)
        if (sceneIndex === 0 && !this.referenceImage) {
          this.referenceImage = {
            data: result.images[0].data,
            mimeType: result.images[0].mimeType
          };
          logger.info({ sceneIndex }, 'First scene saved as reference (NanoBanana fallback)');
        }

        this.generatedImages.push({
          data: result.images[0].data,
          mimeType: result.images[0].mimeType,
          sceneIndex
        });

        logger.info({
          sceneIndex,
          imageSize: result.images[0].data.length,
          usedReferences: referenceImages?.length || 0,
          generator: 'nano-banana'
        }, 'NanoBanana image generated');

        return {
          sceneIndex,
          success: true,
          imageBuffer: result.images[0].data,
          mimeType: result.images[0].mimeType,
          generator: 'nano-banana'
        };
      }

      // 모든 방법 실패
      throw new Error(result.error || 'Image generation failed');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({
        sceneIndex,
        error: errorMsg,
        videoId
      }, 'Scene image generation failed');

      return {
        sceneIndex,
        success: false,
        error: errorMsg,
        generator: 'nano-banana'  // 마지막 시도한 generator
      };
    }
  }

  /**
   * 여러 씬 이미지 일괄 생성
   */
  async generateAllSceneImages(
    scenes: Array<{ prompt: string; config?: GhibliStyleConfig }>,
    aspectRatio: '1:1' | '9:16' | '16:9' = '9:16',
    videoId?: string
  ): Promise<SceneImageResult[]> {
    const results: SceneImageResult[] = [];

    logger.info({
      sceneCount: scenes.length,
      aspectRatio,
      videoId
    }, 'Starting batch scene image generation');

    // 순차 생성 (일관성 유지를 위해)
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const result = await this.generateSceneImage(
        scene.prompt,
        i,
        aspectRatio,
        scene.config,
        videoId
      );
      results.push(result);

      // Rate limit 방지
      if (i < scenes.length - 1) {
        await this.delay(500);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const gptCount = results.filter(r => r.generator === 'gpt').length;
    const nanoBananaCount = results.filter(r => r.generator === 'nano-banana').length;

    logger.info({
      total: scenes.length,
      success: successCount,
      failed: scenes.length - successCount,
      gptUsed: gptCount,
      nanoBananaUsed: nanoBananaCount
    }, 'Batch generation complete');

    return results;
  }

  /**
   * Reference 이미지 가져오기 (최근 N개)
   */
  private getReferenceImages(maxCount: number): Array<{ data: Buffer; mimeType: string }> | undefined {
    if (this.generatedImages.length === 0) {
      return undefined;
    }

    // 첫 번째 이미지(GPT) + 최근 이미지들
    const refs: Array<{ data: Buffer; mimeType: string }> = [];

    // 항상 첫 이미지 포함 (GPT로 생성된 원본)
    if (this.referenceImage) {
      refs.push(this.referenceImage);
    }

    // 최근 생성된 이미지 추가 (첫 번째 제외)
    const recentImages = this.generatedImages
      .filter(img => img.sceneIndex > 0)
      .slice(-(maxCount - 1));

    for (const img of recentImages) {
      refs.push({ data: img.data, mimeType: img.mimeType });
    }

    return refs.length > 0 ? refs.slice(0, maxCount) : undefined;
  }

  /**
   * 상태 초기화 (새 비디오 시작 시)
   */
  reset(): void {
    this.referenceImage = undefined;
    this.generatedImages = [];
    logger.info('GhibliImageService state reset');
  }

  /**
   * 현재 상태 정보
   */
  getState(): {
    hasReference: boolean;
    generatedCount: number;
    referenceImageSize?: number;
  } {
    return {
      hasReference: !!this.referenceImage,
      generatedCount: this.generatedImages.length,
      referenceImageSize: this.referenceImage?.data.length
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
