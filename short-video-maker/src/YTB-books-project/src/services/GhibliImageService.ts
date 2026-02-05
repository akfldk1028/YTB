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

/** v3.3.0: 수식 개념 시각화 Scene용 프리픽스 */
const FORMULA_CONCEPT_PREFIX = `Educational concept illustration,
children's book watercolor style, warm pastel colors,
visual metaphor for mathematical concept,
portrait 9:16, soft hand-painted texture.
NO TEXT, NO FORMULAS, NO NUMBERS in the image.
Focus on the VISUAL METAPHOR only.`;

/** v3.5.0: 교육 콘텐츠 씬용 프리픽스 (캐릭터 없음, 내용 기반 시각화) */
const EDUCATIONAL_STYLE_PREFIX = `Educational illustration for YouTube Shorts,
portrait 9:16, soft watercolor style, visual metaphors and diagrams,
warm pastel colors, NO characters or people, NO text or labels,
clean composition with clear visual hierarchy,
children's book illustration quality.`;

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
  /** v3.5.0: 이미지 모드 — narrative(캐릭터), educational(교육), formula(수식) */
  imageMode?: 'narrative' | 'educational' | 'formula';
  /** v3.5.0: GPT-4o 강제 사용 (주제 변경 시 새 교육 이미지 생성) */
  forceGpt?: boolean;
  /** v3.5.0: 교육 씬용 참조 이미지 (스타일 참조용, 캐릭터 아님) */
  educationalReference?: { data: Buffer; mimeType: string };
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
   * v3.3.0: 프롬프트가 수식 개념 비유 요청인지 감지
   */
  private isFormulaConceptPrompt(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    const formulaKeywords = [
      'educational concept illustration', 'visual metaphor for math',
      'concept illustration', 'mathematical concept',
      'comparing', 'magnifying glass', 'measuring',
      'loss function', 'reconstruction', 'encoder', 'decoder',
      'formula concept', 'equation concept'
    ];
    return formulaKeywords.some(kw => lower.includes(kw));
  }

  /**
   * 프롬프트에 맞는 스타일 프리픽스 선택 + 빌드
   * v3.5.0: imageMode 파라미터로 educational/formula 모드 지원
   */
  private buildStyledPrompt(
    basePrompt: string,
    isDiagram: boolean,
    config?: GhibliStyleConfig
  ): string {
    const imageMode = config?.imageMode || 'narrative';

    // v3.5.0: imageMode에 따라 프리픽스 선택
    let prefix: string;
    if (imageMode === 'educational') {
      prefix = EDUCATIONAL_STYLE_PREFIX;
    } else if (imageMode === 'formula') {
      prefix = FORMULA_CONCEPT_PREFIX;
    } else {
      // narrative 모드: 기존 로직 유지
      const isFormulaConcept = this.isFormulaConceptPrompt(basePrompt);
      prefix = isFormulaConcept ? FORMULA_CONCEPT_PREFIX
        : isDiagram ? DIAGRAM_STYLE_PREFIX
        : GHIBLI_STYLE_PREFIX;
    }
    const parts: string[] = [prefix];

    // narrative 모드에서만 무드/시간대/캐릭터 추가
    const isNarrative = imageMode === 'narrative';
    if (isNarrative && !isDiagram) {
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
   * v3.5.0 전략 (imageMode 분기):
   * - narrative: 첫 씬 GPT-4o → 이후 NanoBanana + characterReference (캐릭터 일관성)
   * - educational: forceGpt=true → GPT-4o 새 이미지, educationalReference → NanoBanana 스타일 참조 (캐릭터 없음)
   * - formula: educational과 동일하지만 FORMULA_CONCEPT_PREFIX 사용
   */
  async generateSceneImage(
    prompt: string,
    sceneIndex: number,
    aspectRatio: '1:1' | '9:16' | '16:9' = '9:16',
    config?: GhibliStyleConfig,
    videoId?: string
  ): Promise<SceneImageResult> {
    const imageMode = config?.imageMode || 'narrative';
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

    // v3.5.0: 교육/수식 모드에서 GPT 강제 사용 여부 결정
    const forceGpt = config?.forceGpt === true;
    const educationalRef = config?.educationalReference;
    const isEducational = imageMode === 'educational' || imageMode === 'formula';

    logger.info({
      sceneIndex,
      isFirstScene,
      isDiagram,
      imageMode,
      forceGpt,
      hasEducationalRef: !!educationalRef,
      strategy: isEducational
        ? (forceGpt ? 'GPT-4o Educational (new topic)' : 'NanoBanana Style Reference (same topic)')
        : (isFirstScene ? 'GPT-4o Ghibli' : 'NanoBanana + Character Reference'),
      prompt: prompt.substring(0, 80),
      videoId
    }, 'Generating scene image with hybrid strategy');

    try {
      let result: ImageGenerationResult;

      // ============================================================
      // v3.5.0: Educational/Formula 모드 — 캐릭터 없는 교육 이미지
      // ============================================================
      if (isEducational) {
        if (forceGpt && this.gptService) {
          // 주제 변경 → GPT-4o로 새 교육 이미지 생성
          logger.info({ sceneIndex, imageMode }, 'Using GPT-4o for educational scene (new topic)');
          result = await this.gptService.generateImages({
            prompt: styledPrompt,
            numberOfImages: 1,
            aspectRatio
          }, videoId, sceneIndex);

          if (result.success && result.images?.[0]) {
            logger.info({
              sceneIndex,
              imageSize: result.images[0].data.length,
              generator: 'gpt',
              imageMode
            }, 'GPT educational image generated');

            return {
              sceneIndex,
              success: true,
              imageBuffer: result.images[0].data,
              mimeType: result.images[0].mimeType,
              generator: 'gpt'
            };
          }
          // GPT 실패 시 NanoBanana fallback (아래로)
          logger.warn({ sceneIndex, error: result.error }, 'GPT failed for educational, falling back to NanoBanana');
        }

        // 동일 주제 또는 GPT 실패 → NanoBanana + 교육 reference (스타일 참조)
        const eduRefImages = educationalRef
          ? [{ data: educationalRef.data, mimeType: educationalRef.mimeType }]
          : undefined;

        logger.info({
          sceneIndex,
          hasEducationalRef: !!eduRefImages,
          imageMode
        }, 'Using NanoBanana with style reference for educational scene');

        result = await this.nanoBananaService!.generateImages({
          prompt: styledPrompt,
          numberOfImages: 1,
          aspectRatio,
          referenceImages: eduRefImages,
          referenceMode: 'style'  // v3.5.0: 스타일만 참조, 캐릭터 아님
        }, videoId, sceneIndex);

        if (result.success && result.images?.[0]) {
          logger.info({
            sceneIndex,
            imageSize: result.images[0].data.length,
            usedEducationalRef: !!eduRefImages,
            generator: 'nano-banana',
            imageMode
          }, 'NanoBanana educational image generated');

          return {
            sceneIndex,
            success: true,
            imageBuffer: result.images[0].data,
            mimeType: result.images[0].mimeType,
            generator: 'nano-banana'
          };
        }

        throw new Error(result.error || 'Educational image generation failed');
      }

      // ============================================================
      // Narrative 모드 — 기존 캐릭터 기반 로직 (변경 없음)
      // ============================================================
      if (isFirstScene && this.gptService) {
        // 첫 씬: GPT-4o
        if (isDiagram) {
          logger.info({ sceneIndex }, 'Using GPT-4o for first scene (Diagram style)');
          result = await this.gptService.generateImages({
            prompt: styledPrompt,
            numberOfImages: 1,
            aspectRatio
          }, videoId, sceneIndex);
        } else {
          logger.info({ sceneIndex }, 'Using GPT-4o for first scene (Ghibli style)');
          result = await this.gptService.generateGhibliImage(
            prompt,
            aspectRatio,
            videoId,
            sceneIndex
          );
        }

        if (result.success && result.images?.[0]) {
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

        logger.warn({ sceneIndex, error: result.error }, 'GPT failed, falling back to NanoBanana');
      }

      // 이후 narrative 씬: NanoBanana + character reference
      logger.info({
        sceneIndex,
        hasReference: !!this.referenceImage,
        previousImageCount: this.generatedImages.length
      }, 'Using NanoBanana with character reference images');

      const referenceImages = this.getReferenceImages(3);

      result = await this.nanoBananaService!.generateImages({
        prompt: styledPrompt,
        numberOfImages: 1,
        aspectRatio,
        referenceImages,
        referenceMode: 'character'  // v3.5.0: 명시적으로 character 모드
      }, videoId, sceneIndex);

      if (result.success && result.images?.[0]) {
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
        generator: 'nano-banana'
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
