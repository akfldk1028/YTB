/**
 * SceneImageService (구 SceneImageService)
 * 스타일 프로파일 기반 하이브리드 이미지 생성 (NanoBanana primary)
 *
 * v7.0: Ghibli → SceneImageService 리네이밍 (모든 스타일 처리)
 * - narrative/educational/formula 모드별 이미지 전략
 * - StyleProfile 시스템으로 다중 스타일 지원
 *
 * @author Claude (Architecture Agent)
 * @version 7.0.0
 */

import { ImageGenerationService } from '../../../image-generation/services/ImageGenerationService';
import { GPTImageService } from '../../../image-generation/services/GPTImageService';
import { NanoBananaService } from '../../../image-generation/services/NanoBananaService';
import { ImageModelType } from '../../../image-generation/models/imageModels';
import { ImageGenerationResult } from '../../../image-generation/types/imagen';
import { logger } from '../../../config';

/** v9.0: 기본 다이어그램 프리픽스 — dark navy 교육 스타일 (math_character 기본) */
const DIAGRAM_STYLE_PREFIX = `On a dark navy background, draw a clean educational diagram using glowing teal and yellow vector lines. Use icons, arrows, and color-coded shapes to convey meaning. Portrait 9:16 composition, purely visual elements.`;

/** v9.0: 기본 수식 프리픽스 — dark navy 교육 스타일 */
const FORMULA_CONCEPT_PREFIX = `On a dark navy background, illustrate the mathematical concept as a visual metaphor with glowing teal lines and subtle grid patterns. Portrait 9:16 composition using only shapes, lines, and color gradients.`;

/** v9.0: 기본 교육 프리픽스 — dark navy 교육 스타일 */
const EDUCATIONAL_STYLE_PREFIX = `On a dark navy background, create an educational illustration showing the concept through visual metaphors and diagrams with glowing teal and yellow elements. Portrait 9:16 composition using only icons, arrows, and color-coded elements.`;

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
 * 씬 이미지 생성 설정 (모든 스타일 공통)
 */
export interface SceneImageConfig {
  /** 스타일 강도 (0.0 ~ 1.0) */
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
  /** v5.2: 에피소드 전체 스타일 앵커 — 첫 성공 이미지를 기반으로 모든 씬의 시각적 일관성 유지 */
  styleAnchorReference?: { data: Buffer; mimeType: string };
  /** v3.5.1: 외부 스타일 프리픽스 — 설정 시 내부 하드코딩 프리픽스 대신 사용 */
  styleOverridePrefix?: string;
  /** v3.5.1: 외부 compositions 배열 — 설정 시 내부 하드코딩 대신 사용 */
  compositions?: string[];
}

/**
 * SceneImageService
 * NanoBanana 기반 다중 스타일 이미지 생성 (GPT-4o fallback 보존)
 */
export class SceneImageService {
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
    }, 'SceneImageService initialized');
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
   * v6.0: 서술형 프롬프트 빌드 (Google 공식 "describe the scene" 원칙)
   *
   * 구조: [주제 내용(content)] + [스타일 힌트] + [제약사항 1줄]
   * - 주제가 맨 앞에 와서 Gemini가 무엇을 그릴지 먼저 이해
   * - 스타일은 보조 역할로 뒤에 배치
   * - "NO/CRITICAL/MUST" 반복 제거 → 긍정 서술 1줄
   */
  private buildStyledPrompt(
    basePrompt: string,
    isDiagram: boolean,
    config?: SceneImageConfig
  ): string {
    const imageMode = config?.imageMode || 'narrative';

    // 1. 스타일 힌트 선택 (기존 로직 유지)
    let styleHint: string;
    if (config?.styleOverridePrefix) {
      styleHint = config.styleOverridePrefix;
    } else if (imageMode === 'educational') {
      styleHint = EDUCATIONAL_STYLE_PREFIX;
    } else if (imageMode === 'formula') {
      styleHint = FORMULA_CONCEPT_PREFIX;
    } else {
      const isFormulaConcept = this.isFormulaConceptPrompt(basePrompt);
      styleHint = isFormulaConcept ? FORMULA_CONCEPT_PREFIX
        : isDiagram ? DIAGRAM_STYLE_PREFIX
        : EDUCATIONAL_STYLE_PREFIX;
    }

    // 2. Ghibli narrative 무드/시간대 (styleOverride 없을 때만)
    const isNarrative = imageMode === 'narrative';
    const hasStyleOverride = !!config?.styleOverridePrefix;
    let moodHint = '';
    if (isNarrative && !isDiagram && !hasStyleOverride) {
      const moodParts: string[] = [];
      if (config?.mood) {
        const moodDescriptions: Record<string, string> = {
          nostalgic: 'with warm nostalgic atmosphere',
          whimsical: 'with magical and whimsical elements',
          peaceful: 'in serene and peaceful setting',
          adventurous: 'with exciting adventure spirit'
        };
        moodParts.push(moodDescriptions[config.mood] || '');
      }
      if (config?.timeOfDay) {
        const timeDescriptions: Record<string, string> = {
          dawn: 'in soft morning light',
          day: 'in bright daylight',
          sunset: 'in warm sunset glow',
          night: 'under moonlit starry sky'
        };
        moodParts.push(timeDescriptions[config.timeOfDay] || '');
      }
      if (config?.characterDescription) {
        moodParts.push(`featuring ${config.characterDescription}`);
      }
      moodHint = moodParts.filter(Boolean).join(' ');
    }

    // 3. content에서 잔여 label/text 키워드 정리 (ContentPlanner 잔여물 대비)
    let cleanedContent = basePrompt
      .replace(/\blabeled?\s*\w*/gi, '')
      .replace(/\b(?:clear\s+)?text\s*\w*/gi, '')
      .replace(/\bwith\s+(?:labels?|text)\b/gi, '')
      .replace(/\blabels?\b/gi, '')
      .replace(/,\s*,/g, ',')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // 4. 서술형 프롬프트 조합: "주제(content) → 스타일 → 제약" 순서
    //    주제를 맨 앞에 두어 Gemini가 무엇을 그릴지 먼저 파악
    // 각 요소의 끝 마침표를 제거 후 join → ".." 방지
    const prompt = [
      cleanedContent,
      moodHint,
      styleHint,
    ].filter(Boolean).map(s => s.replace(/[.\s]+$/, '')).join('. ');

    return `${prompt}. Purely visual — use shapes, colors, icons, and arrows only.`;
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
    config?: SceneImageConfig,
    videoId?: string
  ): Promise<SceneImageResult> {
    const imageMode = config?.imageMode || 'narrative';
    const isFirstScene = sceneIndex === 0;
    const isDiagram = this.isDiagramPrompt(prompt);
    const baseStyledPrompt = this.buildStyledPrompt(prompt, isDiagram, config);

    // v3.5.1: 외부 compositions가 있으면 사용, 없으면 기본 하드코딩 배열
    const compositions = config?.compositions || [
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
    const styleAnchorRef = config?.styleAnchorReference;
    const isEducational = imageMode === 'educational' || imageMode === 'formula';

    logger.info({
      sceneIndex,
      isFirstScene,
      isDiagram,
      imageMode,
      forceGpt,
      hasEducationalRef: !!educationalRef,
      hasStyleAnchor: !!styleAnchorRef,
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
            // v3.5.2: 교육 이미지도 전체 히스토리에 추가 (스타일 일관성)
            this.generatedImages.push({
              data: result.images[0].data,
              mimeType: result.images[0].mimeType,
              sceneIndex
            });

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

        // v5.2: 스타일 앵커 + 교육 reference 조합 (스타일 일관성 최우선)
        const eduRefImages: Array<{ data: Buffer; mimeType: string }> = [];
        if (styleAnchorRef) {
          eduRefImages.push({ data: styleAnchorRef.data, mimeType: styleAnchorRef.mimeType });
        }
        if (educationalRef) {
          eduRefImages.push({ data: educationalRef.data, mimeType: educationalRef.mimeType });
        }

        logger.info({
          sceneIndex,
          referencesUsed: eduRefImages.length,
          hasStyleAnchor: !!styleAnchorRef,
          hasEducationalRef: !!educationalRef,
          imageMode
        }, 'Using NanoBanana with style reference for educational scene');

        // v6.0: NanoBananaService의 style anchor instruction이 배경/색상 일관성을 처리하므로
        // 여기서 추가 지시문 불필요 (중복 제거)
        let eduPrompt = styledPrompt;

        result = await this.nanoBananaService!.generateImages({
          prompt: eduPrompt,
          numberOfImages: 1,
          aspectRatio,
          referenceImages: eduRefImages.length > 0 ? eduRefImages : undefined,
          referenceMode: 'style'  // v3.5.0: 스타일만 참조, 캐릭터 아님
        }, videoId, sceneIndex);

        if (result.success && result.images?.[0]) {
          // v3.5.2: 교육 이미지도 전체 히스토리에 추가 (스타일 일관성)
          this.generatedImages.push({
            data: result.images[0].data,
            mimeType: result.images[0].mimeType,
            sceneIndex
          });

          logger.info({
            sceneIndex,
            imageSize: result.images[0].data.length,
            referencesUsed: eduRefImages.length,
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
      // Narrative 모드 — NanoBanana only (v3.8.0: GPT-4o 제거)
      // v5.2: styleAnchor가 있으면 style 모드로 일관성 유지
      // ============================================================
      const narrativeRefs: Array<{ data: Buffer; mimeType: string }> = [];
      // v5.2: 스타일 앵커를 첫 번째 참조로 항상 포함
      if (styleAnchorRef) {
        narrativeRefs.push({ data: styleAnchorRef.data, mimeType: styleAnchorRef.mimeType });
      }
      // 기존 히스토리 참조도 추가 (최대 2개)
      const historyRefs = this.getReferenceImages(2);
      if (historyRefs) {
        for (const ref of historyRefs) {
          narrativeRefs.push(ref);
        }
      }
      const referenceImages = narrativeRefs.length > 0 ? narrativeRefs.slice(0, 3) : undefined;

      logger.info({
        sceneIndex,
        hasStyleAnchor: !!styleAnchorRef,
        hasReference: !!this.referenceImage,
        referencesUsed: referenceImages?.length || 0,
        previousImageCount: this.generatedImages.length
      }, 'Using NanoBanana with style anchor + character reference images');

      result = await this.nanoBananaService!.generateImages({
        prompt: styledPrompt,
        numberOfImages: 1,
        aspectRatio,
        referenceImages,
        referenceMode: 'character'  // narrative는 항상 character 모드 (스타일 앵커는 참조 이미지로만 제공)
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
    scenes: Array<{ prompt: string; config?: SceneImageConfig }>,
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
    logger.info('SceneImageService state reset');
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
