/**
 * EpisodeOrchestrator
 * 에피소드 비디오/이미지 생성 오케스트레이션 (BooksRouter에서 분리)
 *
 * n8n 패턴: Router(라우팅) ↔ Orchestrator(파이프라인 조율) 분리
 * - Router: HTTP 요청 수신/응답, 입력 검증
 * - Orchestrator: 이미지 생성, 비디오 조립, GCS 업로드 파이프라인
 *
 * @version 7.0.0
 */

import { Neo4jService } from '../services/Neo4jService';
import { SceneImageService } from '../services/SceneImageService';
import { getBooksVideoService, BOOKS_PROJECT_CONFIG } from '../services/BooksVideoService';
import { colorizeLatex } from '../utils/latexColorizer';
import { logger, Config } from '../../../config';
import { GoogleCloudStorageService } from '../../../storage/GoogleCloudStorageService';
import { getStyleProfile, getContentPlannerStyleGuide, getMathCharacterDomainExamples, getViralCatDomainExamples, type VideoStyleProfile } from '../styles';
import type { EpisodeWithScenes } from '../types';

// ============================================
// Types
// ============================================

export interface PipelineResult {
  success: boolean;
  videoResult?: any;
  gcsUrl?: string;
  publicUrl?: string;
  error?: string;
  _styleDebug?: any;
}

export interface ImageGenerationResult {
  success: boolean;
  imagePaths?: string[];
  /** v11.0: VEO 모드에서 씬별 키프레임 쌍 */
  keyframePairs?: Array<{ firstFramePath: string; lastFramePath: string }>;
  outputDir?: string;
  results?: Array<{
    sceneIndex: number;
    sceneId: string;
    success: boolean;
    imagePath?: string;
    generator?: string;
    error?: string;
  }>;
  error?: string;
}

// ============================================
// Orchestrator
// ============================================

export class EpisodeOrchestrator {

  // ── Helper: 스타일 프로파일 → ContentPlanner용 가이드 ──

  buildVisualPromptStyleGuide(profile: VideoStyleProfile): string | undefined {
    if (profile.id === 'ghibli') return undefined;
    const baseGuide = getContentPlannerStyleGuide(profile);
    let domainExamples = '';
    if (profile.id === 'math_character') {
      domainExamples = '\n\n' + getMathCharacterDomainExamples();
    } else if (profile.id === 'viral_cat') {
      domainExamples = '\n\n' + getViralCatDomainExamples();
    }
    return `${baseGuide}${domainExamples}`;
  }

  // ── Helper: 씬 타입별 이미지 전략 ──

  getSceneImageStrategy(scene: { type?: string; hasFormula?: boolean; assignedFormula?: string }): 'narrative' | 'educational' | 'formula' {
    const sceneType = scene.type || 'explanation';
    const narrativeTypes = ['hook', 'intro', 'conclusion', 'cta'];
    if (narrativeTypes.includes(sceneType)) return 'narrative';
    if (scene.assignedFormula || scene.hasFormula) return 'formula';
    if (['explanation', 'example', 'data', 'comparison', 'deep_dive', 'problem', 'solution'].includes(sceneType)) {
      return 'educational';
    }
    return 'narrative';
  }

  // ── Helper: 설명 씬 프롬프트 보정 ──

  enhanceExplanationPrompt(prompt: string, sceneType: string, narration: string): string {
    const explanationTypes = ['explanation', 'example', 'data', 'comparison'];
    if (!explanationTypes.includes(sceneType)) return prompt;
    if (/infographic|diagram|flowchart|whiteboard|chart/i.test(prompt)) return prompt;
    const conceptMatch = narration.match(/[가-힣]+\([^)]+\)/g) || [];
    const conceptHint = conceptMatch.length > 0
      ? ` Key concepts: ${conceptMatch.join(', ')}.`
      : '';
    return `${prompt.trim()}${conceptHint}`.trim();
  }

  // ── Helper: LaTeX 변수 색상 코딩 (v12.2: utils/latexColorizer로 추출, thin delegate) ──

  colorizeLatex(latex: string, variableColors: Record<string, string>): string {
    return colorizeLatex(latex, variableColors);
  }

  // ── 씬별 이미지 생성 ──

  async generateSceneImages(
    scenes: Array<{ id: string; type?: string; visualDesc?: string; narration?: string; hasFormula?: boolean; assignedFormula?: string }>,
    imageService: SceneImageService,
    neo4j: Neo4jService,
    tempDir: string,
    config: any,
    episodeId: string,
    styleProfile?: VideoStyleProfile
  ): Promise<{ imagePaths: string[]; failedScene?: number }> {
    const fs = await import('fs-extra');
    const path = await import('path');
    const imagePaths: string[] = [];
    let prevImagePath: string | undefined;

    let lastEducationalTopic = '';
    let educationalRef: { data: Buffer; mimeType: string } | undefined;
    let styleAnchor: { data: Buffer; mimeType: string } | undefined;
    const isNonGhibli = !!(styleProfile && styleProfile.id !== 'ghibli');

    logger.info({
      styleProfileId: styleProfile?.id,
      isNonGhibli,
    }, 'generateSceneImages style config');

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneType = scene.type || 'explanation';
      const strategy = this.getSceneImageStrategy(scene);

      // 근본 해결: 스타일 프로파일의 기본 스타일(ghibli/math_character)과 다른 스타일로 생성 시
      // 커리큘럼의 visualDesc는 다른 스타일로 오염되어 있으므로 narration 기반으로 프롬프트 재구성
      const styleOwnsVisualDesc = !styleProfile || styleProfile.id === 'ghibli' || styleProfile.id === 'math_character';
      let rawPrompt: string;

      if (styleOwnsVisualDesc) {
        // ghibli/math_character: 커리큘럼의 visualDesc를 그대로 사용 (기존 동작)
        rawPrompt = scene.visualDesc || scene.narration || `Scene ${i + 1}`;

        if (isNonGhibli && strategy === 'narrative') {
          const desc = scene.visualDesc || '';
          const topicOnly = desc
            .replace(/\b(A|An|The)\s+(friendly|cute|warm|young|curious|excited)\s+/gi, '')
            .replace(/\b(ghibli-style|ghibli|studio ghibli|hand-painted|whimsical|storybook|anime)\b/gi, '')
            .replace(/Children's book illustration,?\s*/gi, '')
            .replace(/\bsoft watercolor,?\s*/gi, '')
            .replace(/\b(narrator|character|student|girl|woman|person|figure|protagonist|hero|heroine)\b/gi, '')
            .replace(/\b(smiling|gazing)\s*/gi, '')
            .replace(/\b(with|in a|at the)\s+(flowing|brown|long|short|curly|blonde)\s+(hair|dress|outfit)\b/gi, '')
            .replace(/[가-힣]+/g, '')
            .replace(/,\s*,/g, ',').replace(/^\s*[,.\s]+/, '').replace(/[,.\s]+$/, '').replace(/\s{2,}/g, ' ').trim();
          rawPrompt = topicOnly || 'mathematical concept visualization';
        }

        if (isNonGhibli) {
          rawPrompt = rawPrompt
            .replace(/\b(Studio Ghibli|Ghibli|watercolor aesthetic|hand-painted|whimsical dreamlike|storybook|high school student|curious student|girl|woman|young woman|female student)\b/gi, '')
            .replace(/Children's book illustration,?\s*/gi, '')
            .replace(/\bsoft watercolor,?\s*/gi, '')
            .replace(/\bwarm pastel colors?,?\s*/gi, '')
            .replace(/\bportrait 9:16\b/gi, '')
            .replace(/\b(narrator|protagonist|heroine?|figure)\b/gi, '')
            .replace(/\b(brown|long|flowing|short|curly|blonde)\s*(hair|haired)\b/gi, '')
            .replace(/\bwatercolor\b/gi, '')
            .replace(/여학생|소녀/g, '')
            .replace(/,\s*,/g, ',')
            .replace(/^\s*,\s*/, '')
            .replace(/\s*,\s*$/, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
        }
      } else {
        // 다른 스타일 (viral_cat 등): visualDesc 무시, narration + 구도 순환으로 프롬프트 재구성
        // 스타일 프로파일의 prefix가 이미지 스타일을 결정하므로, narration에서 주제만 사용
        const narration = scene.narration || `Scene ${i + 1}`;
        const comps = styleProfile!.compositions || [];
        const sceneComposition = comps.length > 0 ? comps[i % comps.length] : '';
        rawPrompt = sceneComposition
          ? `${narration}. Scene setting: ${sceneComposition}`
          : narration;
      }

      let visualPrompt = this.enhanceExplanationPrompt(rawPrompt, sceneType, scene.narration || '');

      const currentTopic = scene.assignedFormula || sceneType;
      const topicChanged = (strategy !== 'narrative') && (currentTopic !== lastEducationalTopic || !educationalRef);

      logger.info({
        sceneIndex: i,
        sceneId: scene.id,
        strategy,
        topicChanged,
        currentTopic,
        visualPrompt: visualPrompt.substring(0, 50)
      }, `Scene ${i + 1}/${scenes.length} 이미지 생성 중 (${strategy})`);

      let imageResult;

      if (strategy === 'narrative') {
        if (isNonGhibli) {
          const narrativeOverride = styleProfile!.narrativeStylePrefix;
          imageResult = await imageService.generateSceneImage(
            visualPrompt,
            i,
            (config.orientation === 'landscape' ? '16:9' : '9:16'),
            {
              imageMode: 'educational',
              styleOverridePrefix: narrativeOverride,
              compositions: styleProfile?.compositions,
              styleAnchorReference: styleAnchor,
            },
            episodeId
          );
        } else {
          imageResult = await imageService.generateSceneImage(
            visualPrompt,
            i,
            (config.orientation === 'landscape' ? '16:9' : '9:16'),
            {
              mood: config.mood || 'whimsical',
              timeOfDay: config.timeOfDay || 'day',
              characterDescription: config.characterDescription,
              imageMode: 'narrative',
              compositions: styleProfile?.compositions,
              styleAnchorReference: styleAnchor,
            },
            episodeId
          );
        }
      } else {
        const imageMode = strategy === 'formula' ? 'formula' : 'educational';
        const eduStylePrefix = isNonGhibli
          ? (strategy === 'formula' ? styleProfile!.formulaConceptPrefix : styleProfile!.educationalStylePrefix)
          : undefined;

        imageResult = await imageService.generateSceneImage(
          visualPrompt,
          i,
          (config.orientation === 'landscape' ? '16:9' : '9:16'),
          {
            imageMode,
            educationalReference: topicChanged ? undefined : educationalRef,
            styleAnchorReference: styleAnchor,
            styleOverridePrefix: eduStylePrefix,
            compositions: styleProfile?.compositions,
          },
          episodeId
        );

        if (topicChanged && imageResult.success && imageResult.imageBuffer) {
          educationalRef = {
            data: imageResult.imageBuffer,
            mimeType: imageResult.mimeType || 'image/png'
          };
          lastEducationalTopic = currentTopic;
        }
      }

      if (imageResult.success && imageResult.imageBuffer) {
        const imagePath = path.default.join(tempDir, `scene_${i}.png`);
        await fs.default.writeFile(imagePath, imageResult.imageBuffer);
        imagePaths.push(imagePath);
        prevImagePath = imagePath;

        // styleAnchor: ghibli/math_character만 사용. 커스텀 스타일은 구도 순환으로 다양성 확보
        if (!styleAnchor && styleOwnsVisualDesc) {
          styleAnchor = {
            data: imageResult.imageBuffer,
            mimeType: imageResult.mimeType || 'image/png'
          };
          logger.info({
            sceneIndex: i,
            imageSize: imageResult.imageBuffer.length,
          }, 'styleAnchorSet — 첫 성공 이미지를 에피소드 스타일 앵커로 설정');
        }

        await neo4j.updateSceneAssets(scene.id, { imagePath });

        logger.info({
          sceneIndex: i,
          generator: imageResult.generator,
          imageSize: imageResult.imageBuffer.length,
          strategy,
          hasStyleAnchor: !!styleAnchor
        }, `Scene ${i + 1} 이미지 생성 완료`);
      } else if (prevImagePath) {
        const imagePath = path.default.join(tempDir, `scene_${i}.png`);
        await fs.default.copy(prevImagePath, imagePath);
        imagePaths.push(imagePath);
        logger.warn({ sceneIndex: i, error: imageResult.error }, `Scene ${i + 1} 실패 - 이전 이미지 재사용`);
      } else {
        return { imagePaths, failedScene: i };
      }
    }

    return { imagePaths };
  }

  // ── v11.0: VEO 모드 키프레임 쌍 생성 ──

  /**
   * v11.0: VEO 3.1용 키프레임 쌍 생성
   *
   * 각 씬마다 first(시작) + last(종료) 2장의 이미지를 생성한다.
   * VEO 3.1이 이 2장 사이를 AI 보간하여 시네마틱 비디오를 만든다.
   *
   * 프롬프트 우선순위:
   *   firstFramePrompt (AI 생성) → visualDesc → narration → "Scene N start"
   *   lastFramePrompt (AI 생성)  → firstFramePrompt과 동일 (fallback)
   *
   * ⚠️ firstFramePrompt/lastFramePrompt는 커리큘럼 생성 시 useVeo=true로
   *    ContentPlanner를 호출해야 AI가 생성함. 없으면 visualDesc로 대체되어
   *    first/last가 동일 프롬프트 → VEO 보간 효과 감소 (동작은 정상).
   *
   * 반환값:
   *   imagePaths[] — first frame 경로 배열 (Ken Burns fallback용)
   *   keyframePairs[] — {firstFramePath, lastFramePath} 쌍 배열
   *
   * Style anchor: 첫 씬의 first frame을 anchor로 설정 → 일관성 유지
   */
  async generateKeyframePairs(
    scenes: Array<{ id: string; type?: string; visualDesc?: string; narration?: string; hasFormula?: boolean; assignedFormula?: string; firstFramePrompt?: string; lastFramePrompt?: string }>,
    imageService: SceneImageService,
    neo4j: Neo4jService,
    tempDir: string,
    config: any,
    episodeId: string,
    styleProfile?: VideoStyleProfile
  ): Promise<{ imagePaths: string[]; keyframePairs: Array<{ firstFramePath: string; lastFramePath: string }>; failedScene?: number }> {
    const fs = await import('fs-extra');
    const path = await import('path');
    const imagePaths: string[] = [];
    const keyframePairs: Array<{ firstFramePath: string; lastFramePath: string }> = [];
    let styleAnchor: { data: Buffer; mimeType: string } | undefined;
    const isNonGhibli = !!(styleProfile && styleProfile.id !== 'ghibli');

    logger.info({
      sceneCount: scenes.length,
      styleProfileId: styleProfile?.id,
    }, '[VEO] Generating keyframe pairs for frame interpolation');

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const firstPrompt = scene.firstFramePrompt || scene.visualDesc || scene.narration || `Scene ${i + 1} start`;
      const lastPrompt = scene.lastFramePrompt || firstPrompt; // fallback to same prompt if no lastFrame

      // Determine style prefix for non-ghibli profiles
      const strategy = this.getSceneImageStrategy(scene);
      const stylePrefix = isNonGhibli
        ? (strategy === 'formula' ? styleProfile!.formulaConceptPrefix
          : strategy === 'narrative' ? styleProfile!.narrativeStylePrefix
          : styleProfile!.educationalStylePrefix)
        : undefined;

      const aspectRatio = config.orientation === 'landscape' ? '16:9' : '9:16';

      // Generate first frame
      const firstResult = await imageService.generateSceneImage(
        firstPrompt, i, aspectRatio,
        {
          imageMode: strategy === 'narrative' ? 'narrative' : 'educational',
          styleOverridePrefix: stylePrefix,
          compositions: styleProfile?.compositions,
          styleAnchorReference: styleAnchor,
        },
        episodeId
      );

      if (!firstResult.success || !firstResult.imageBuffer) {
        if (imagePaths.length > 0) {
          // Fallback: reuse previous first frame
          const prevFirst = keyframePairs[keyframePairs.length - 1]?.firstFramePath || imagePaths[imagePaths.length - 1];
          const firstPath = path.default.join(tempDir, `scene_${i}_first.png`);
          const lastPath = path.default.join(tempDir, `scene_${i}_last.png`);
          await fs.default.copy(prevFirst, firstPath);
          await fs.default.copy(prevFirst, lastPath);
          imagePaths.push(firstPath);
          keyframePairs.push({ firstFramePath: firstPath, lastFramePath: lastPath });
          logger.warn({ sceneIndex: i }, `[VEO] First frame failed - reusing previous`);
          continue;
        }
        return { imagePaths, keyframePairs, failedScene: i };
      }

      const firstPath = path.default.join(tempDir, `scene_${i}_first.png`);
      await fs.default.writeFile(firstPath, firstResult.imageBuffer);

      // Set style anchor from first successful image
      if (!styleAnchor) {
        styleAnchor = {
          data: firstResult.imageBuffer,
          mimeType: firstResult.mimeType || 'image/png'
        };
      }

      // Generate last frame (use same style anchor for consistency)
      const lastResult = await imageService.generateSceneImage(
        lastPrompt, i, aspectRatio,
        {
          imageMode: strategy === 'narrative' ? 'narrative' : 'educational',
          styleOverridePrefix: stylePrefix,
          compositions: styleProfile?.compositions,
          styleAnchorReference: styleAnchor,
        },
        episodeId
      );

      let lastPath: string;
      if (lastResult.success && lastResult.imageBuffer) {
        lastPath = path.default.join(tempDir, `scene_${i}_last.png`);
        await fs.default.writeFile(lastPath, lastResult.imageBuffer);
      } else {
        // Fallback: use first frame as last frame (Ken Burns will handle it)
        lastPath = path.default.join(tempDir, `scene_${i}_last.png`);
        await fs.default.copy(firstPath, lastPath);
        logger.warn({ sceneIndex: i }, `[VEO] Last frame failed - using first frame as fallback`);
      }

      imagePaths.push(firstPath); // imagePaths[i] = first frame (for Ken Burns fallback)
      keyframePairs.push({ firstFramePath: firstPath, lastFramePath: lastPath });

      await neo4j.updateSceneAssets(scene.id, { imagePath: firstPath });

      logger.info({
        sceneIndex: i,
        strategy,
        firstFrameSize: firstResult.imageBuffer.length,
        lastFrameSize: lastResult.success ? lastResult.imageBuffer?.length : 0,
      }, `[VEO] Scene ${i + 1} keyframe pair generated`);
    }

    return { imagePaths, keyframePairs };
  }

  // ── 에피소드 이미지만 생성 (generate-images 엔드포인트) ──

  async generateEpisodeImages(
    episode: EpisodeWithScenes,
    config: any,
    neo4j: Neo4jService
  ): Promise<ImageGenerationResult> {
    const styleProfile = getStyleProfile(config.style);
    const isNonGhibli = styleProfile.id !== 'ghibli';

    logger.info({
      episodeId: episode.id,
      sceneCount: episode.scenes.length,
      styleId: styleProfile.id,
      isNonGhibli,
    }, '🖼️ Episode 이미지 생성 시작');

    const appConfig = new Config();
    const imageService = new SceneImageService(
      appConfig.googleGeminiApiKey || '',
      appConfig.openaiApiKey || '',
      appConfig.tempDirPath
    );

    const fs = await import('fs-extra');
    const path = await import('path');
    const outputDir = path.default.join(appConfig.tempDirPath, 'episode_images', episode.id);
    await fs.default.ensureDir(outputDir);

    const results: Array<{
      sceneIndex: number;
      sceneId: string;
      success: boolean;
      imagePath?: string;
      generator?: string;
      error?: string;
    }> = [];

    let lastEduTopic = '';
    let eduRef: { data: Buffer; mimeType: string } | undefined;
    let styleAnchor: { data: Buffer; mimeType: string } | undefined;

    for (let i = 0; i < episode.scenes.length; i++) {
      const scene = episode.scenes[i];
      const strategy = this.getSceneImageStrategy(scene as any);

      let visualPrompt: string;
      if (isNonGhibli && strategy === 'narrative') {
        const desc = scene.visualDesc || '';
        const topicOnly = desc
          .replace(/\b(A|An|The)\s+(friendly|cute|warm|young|curious|excited)\s+/gi, '')
          .replace(/\b(ghibli-style|ghibli|studio ghibli|watercolor|hand-painted|whimsical|storybook|anime)\b/gi, '')
          .replace(/Children's book illustration,?\s*/gi, '')
          .replace(/\bsoft watercolor,?\s*/gi, '')
          .replace(/\b(narrator|character|student|girl|woman|person|figure|protagonist|hero|heroine)\b/gi, '')
          .replace(/\b(introducing|looking|standing|sitting|walking|smiling|gazing)\s*/gi, '')
          .replace(/\b(with|in a|at the)\s+(flowing|brown|long|short|warm|soft|green|lush)\s+\w*/gi, '')
          .replace(/[가-힣]+/g, '')
          .replace(/,\s*,/g, ',').replace(/^\s*[,.\s]+/, '').replace(/[,.\s]+$/, '').replace(/\s{2,}/g, ' ').trim();
        const fallbackPrompt = styleProfile.id === 'viral_cat' ? 'cozy everyday scene, warm atmosphere' : 'mathematical concept visualization';
        visualPrompt = topicOnly || fallbackPrompt;
      } else {
        visualPrompt = scene.visualDesc || scene.narration || `Scene ${i + 1}`;
      }
      if (isNonGhibli) {
        visualPrompt = visualPrompt
          .replace(/\b(Studio Ghibli|Ghibli|watercolor aesthetic|hand-painted|whimsical dreamlike|storybook|high school student|curious student|girl|woman|young woman|female student)\b/gi, '')
          .replace(/Children's book illustration,?\s*/gi, '')
          .replace(/\bsoft watercolor,?\s*/gi, '')
          .replace(/\bwarm pastel colors?,?\s*/gi, '')
          .replace(/\bportrait 9:16\b/gi, '')
          .replace(/\b(narrator|protagonist|heroine?|figure)\b/gi, '')
          .replace(/\b(brown|long|flowing|short|curly|blonde)\s*(hair|haired)\b/gi, '')
          .replace(/\bwatercolor\b/gi, '')
          .replace(/여학생|소녀/g, '')
          .replace(/,\s*,/g, ',')
          .replace(/^\s*,\s*/, '')
          .replace(/\s*,\s*$/, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }

      const currentTopic = (scene as any).assignedFormula || scene.type || 'explanation';
      const topicChanged = strategy !== 'narrative' && (currentTopic !== lastEduTopic || !eduRef);

      let imageResult;

      if (strategy === 'narrative') {
        if (isNonGhibli) {
          const narrativeOverride = styleProfile.narrativeStylePrefix;
          imageResult = await imageService.generateSceneImage(
            visualPrompt,
            i,
            (config.orientation === 'landscape' ? '16:9' : '9:16'),
            {
              imageMode: 'educational',
              styleOverridePrefix: narrativeOverride,
              compositions: styleProfile.compositions,
              styleAnchorReference: styleAnchor,
            },
            episode.id
          );
        } else {
          imageResult = await imageService.generateSceneImage(
            visualPrompt,
            i,
            (config.orientation === 'landscape' ? '16:9' : '9:16'),
            {
              mood: config.mood || 'whimsical',
              timeOfDay: config.timeOfDay || 'day',
              characterDescription: config.characterDescription,
              imageMode: 'narrative',
              styleAnchorReference: styleAnchor,
            },
            episode.id
          );
        }
      } else {
        const imageMode = strategy === 'formula' ? 'formula' : 'educational';
        const eduStylePrefix = isNonGhibli
          ? (strategy === 'formula' ? styleProfile.formulaConceptPrefix : styleProfile.educationalStylePrefix)
          : undefined;
        imageResult = await imageService.generateSceneImage(
          visualPrompt,
          i,
          (config.orientation === 'landscape' ? '16:9' : '9:16'),
          {
            imageMode,
            educationalReference: topicChanged ? undefined : eduRef,
            styleOverridePrefix: eduStylePrefix,
            compositions: styleProfile.compositions,
            styleAnchorReference: styleAnchor,
          },
          episode.id
        );
        if (topicChanged && imageResult.success && imageResult.imageBuffer) {
          eduRef = { data: imageResult.imageBuffer, mimeType: imageResult.mimeType || 'image/png' };
          lastEduTopic = currentTopic;
        }
      }

      if (imageResult.success && imageResult.imageBuffer) {
        const imagePath = path.default.join(outputDir, `scene_${i}.png`);
        await fs.default.writeFile(imagePath, imageResult.imageBuffer);

        if (!styleAnchor) {
          styleAnchor = {
            data: imageResult.imageBuffer,
            mimeType: imageResult.mimeType || 'image/png'
          };
        }

        await neo4j.updateSceneAssets(scene.id, { imagePath });

        results.push({
          sceneIndex: i,
          sceneId: scene.id,
          success: true,
          imagePath,
          generator: imageResult.generator
        });
      } else {
        results.push({
          sceneIndex: i,
          sceneId: scene.id,
          success: false,
          error: imageResult.error
        });
      }
    }

    // 첫 이미지를 masterImage로 저장
    const firstSuccess = results.find(r => r.success);
    if (firstSuccess) {
      await neo4j.updateEpisodeStatus(episode.id, episode.status, {
        masterImagePath: firstSuccess.imagePath
      });
    }

    const successCount = results.filter(r => r.success).length;
    logger.info({
      episodeId: episode.id,
      total: results.length,
      success: successCount,
      failed: results.length - successCount
    }, '✅ Episode 이미지 생성 완료');

    return {
      success: successCount === results.length,
      outputDir,
      results,
    };
  }

  // ── 에피소드 비디오 생성 파이프라인 ──

  async generateEpisodeVideo(
    episode: EpisodeWithScenes,
    config: any,
    neo4j: Neo4jService
  ): Promise<PipelineResult> {
    // v3.7.0: 스타일 자동 추론
    let resolvedStyle = config.style;
    if (!resolvedStyle) {
      const docConfig = await neo4j.getDocumentVideoConfig(episode.documentId);
      resolvedStyle = docConfig?.style;

      if (!resolvedStyle) {
        const contentType = docConfig?.contentType || await neo4j.getDocumentContentType(episode.documentId);
        if (contentType === 'math_science') {
          resolvedStyle = 'math_character';
        } else if (contentType === 'humanities') {
          resolvedStyle = 'humanities';
        } else if (contentType === 'social_science') {
          resolvedStyle = 'humanities';  // social_science도 humanities 스타일 사용
        } else if (contentType === 'empathy_lifestyle') {
          resolvedStyle = 'viral_cat';
        }
      }

      if (!resolvedStyle) {
        const hasFormulas = episode.scenes.some((s: any) => s.assignedFormula || s.formulaName);
        if (hasFormulas) {
          resolvedStyle = 'math_character';
          neo4j.setDocumentContentType(episode.documentId, 'math_science').catch(() => {});
          logger.info({ documentId: episode.documentId }, 'Style inferred from episode formulas → saved contentType=math_science');
        }
      }

      if (resolvedStyle) {
        logger.info({ resolvedStyle, documentId: episode.documentId }, 'Style auto-detected from document');
      } else {
        resolvedStyle = 'math_character';
        logger.info({ documentId: episode.documentId }, 'No style detected → defaulting to math_character (PRIMARY)');
      }
    }

    const styleProfile = getStyleProfile(resolvedStyle);
    logger.info({ styleId: styleProfile.id, displayName: styleProfile.displayName, source: config.style ? 'request' : 'auto-detect' }, 'Style profile selected');

    const appConfig = new Config();
    const imageService = new SceneImageService(
      appConfig.googleGeminiApiKey || '',
      appConfig.openaiApiKey || '',
      appConfig.tempDirPath
    );

    const fs = await import('fs-extra');
    const path = await import('path');
    const tempDir = path.default.join(appConfig.tempDirPath, `episode_${episode.id}`);
    await fs.default.ensureDir(tempDir);

    // 1. 청크 LaTeX 조회
    const allChunkIds = episode.scenes
      .flatMap(s => s.sourceChunkIds || [])
      .filter((id, index, self) => id && self.indexOf(id) === index);

    const chunkLatexMap = new Map<string, string[]>();
    if (allChunkIds.length > 0) {
      try {
        const latexResult = await neo4j.runQuery(
          `MATCH (c:Chunk) WHERE c.id IN $chunkIds AND c.latexFormulas IS NOT NULL
           RETURN c.id as id, c.latexFormulas as latexFormulas`,
          { chunkIds: allChunkIds }
        );
        for (const record of latexResult) {
          const id = record.get('id');
          const formulas = record.get('latexFormulas');
          if (id && formulas && Array.isArray(formulas) && formulas.length > 0) {
            chunkLatexMap.set(id, formulas);
          }
        }
        if (chunkLatexMap.size > 0) {
          logger.info({ chunksWithLatex: chunkLatexMap.size }, '📐 청크에서 LaTeX 수식 발견');
        }
      } catch (error) {
        logger.warn({ error }, '⚠️ 청크 LaTeX 조회 실패 - 스킵');
      }
    }

    // 2. Scene type 변환
    const mapSceneType = (type: string): 'hook' | 'intro' | 'problem' | 'solution' | 'explanation' | 'example' | 'data' | 'comparison' | 'conclusion' | 'cta' => {
      const validTypes = ['hook', 'intro', 'problem', 'solution', 'explanation', 'example', 'data', 'comparison', 'conclusion', 'cta'] as const;
      if (validTypes.includes(type as any)) {
        return type as typeof validTypes[number];
      }
      if (type === 'climax') return 'conclusion';
      return 'explanation';
    };

    // 3. 수식→씬 배분
    const allUniqueFormulas: string[] = [];
    const formulaSet = new Set<string>();
    for (const s of episode.scenes) {
      for (const chunkId of (s.sourceChunkIds || [])) {
        const formulas = chunkLatexMap.get(chunkId);
        if (formulas) {
          for (const f of formulas) {
            if (!formulaSet.has(f)) {
              formulaSet.add(f);
              allUniqueFormulas.push(f);
            }
          }
        }
      }
    }

    const sceneFormulaMap = new Map<number, string[]>();
    let assignedCount = 0;
    episode.scenes.forEach((s: any, i: number) => {
      if (s.assignedFormula) {
        sceneFormulaMap.set(i, [s.assignedFormula]);
        assignedCount++;
      }
    });

    if (assignedCount === 0) {
      const formulaEligibleTypes = ['explanation', 'example', 'data', 'comparison'];
      const eligibleIndices: number[] = [];
      episode.scenes.forEach((s, i) => {
        const st = mapSceneType(s.type);
        if (formulaEligibleTypes.includes(st)) {
          eligibleIndices.push(i);
        }
      });

      const meaningfulFormulas = allUniqueFormulas.filter(f => f.trim().length > 2);
      if (meaningfulFormulas.length > 0) {
        for (let fi = 0; fi < eligibleIndices.length; fi++) {
          const formulaIdx = fi % meaningfulFormulas.length;
          sceneFormulaMap.set(eligibleIndices[fi], [meaningfulFormulas[formulaIdx]]);
        }
      }
    }

    logger.info({
      totalFormulas: allUniqueFormulas.length,
      assignedFromCurriculum: assignedCount,
      fallbackAssigned: sceneFormulaMap.size - assignedCount,
      assignedScenes: sceneFormulaMap.size
    }, 'v3.4.0: 수식→씬 배분 완료 (공통 파이프라인)');

    // ============================================
    // 4. 이미지 생성
    // v11.0: VEO 모드 분기
    //   useVeo=true  → generateKeyframePairs(): 씬당 2장(first+last) → keyframePairs[]
    //   useVeo=false → generateSceneImages(): 씬당 1장 → imagePaths[] (기존 동작)
    //
    // 어느 모드든 imagePaths[i]는 Ken Burns fallback용 이미지 (first frame)
    // ============================================
    const scenesWithFormula = episode.scenes.map((s, i) => {
      const hasFormula = sceneFormulaMap.has(i);
      const assignedFormula = (s as any).assignedFormula || (sceneFormulaMap.get(i)?.[0]) || undefined;
      return { ...s, hasFormula, assignedFormula };
    });

    // config.useVeo (API 파라미터) 또는 config.useVeoInterpolation (내부 전달) 둘 다 지원
    const useVeo = config.useVeo === true || config.useVeoInterpolation === true;
    let imagePaths: string[];
    let keyframePairs: Array<{ firstFramePath: string; lastFramePath: string }> | undefined;

    if (useVeo) {
      logger.info({ sceneCount: episode.scenes.length }, '[VEO] Scene 키프레임 쌍 생성 시작');
      const kfResult = await this.generateKeyframePairs(
        scenesWithFormula, imageService, neo4j, tempDir, config, episode.id, styleProfile
      );

      if (kfResult.failedScene !== undefined) {
        await neo4j.updateEpisodeStatus(episode.id, 'approved');
        await fs.default.remove(tempDir);
        return { success: false, error: `Failed to generate keyframe pair for scene ${kfResult.failedScene + 1}` };
      }

      imagePaths = kfResult.imagePaths;
      keyframePairs = kfResult.keyframePairs;
    } else {
      logger.info({ sceneCount: episode.scenes.length }, 'Scene 이미지 생성 시작');
      const imgResult = await this.generateSceneImages(
        scenesWithFormula, imageService, neo4j, tempDir, config, episode.id, styleProfile
      );

      if (imgResult.failedScene !== undefined) {
        await neo4j.updateEpisodeStatus(episode.id, 'approved');
        await fs.default.remove(tempDir);
        return { success: false, error: `Failed to generate image for scene ${imgResult.failedScene + 1}` };
      }

      imagePaths = imgResult.imagePaths;
    }

    const masterImagePath = imagePaths[0];
    await neo4j.updateEpisodeStatus(episode.id, 'producing', { masterImagePath });

    // 5. 비디오 생성
    logger.info({ imageCount: imagePaths.length }, '📹 비디오 생성 시작');

    const videoService = getBooksVideoService();

    const shortPlan = {
      shortIndex: episode.episodeNumber - 1,
      title: episode.title,
      hook: episode.hook || '',
      theme: 'book',
      scenes: episode.scenes.map((s: any, i: number) => {
        let assignedFormulas = sceneFormulaMap.get(i);
        if (assignedFormulas && styleProfile.useColorCodedVariables && styleProfile.variableColors) {
          assignedFormulas = assignedFormulas.map(f => this.colorizeLatex(f, styleProfile.variableColors!));
        }
        return {
          sceneIndex: i,
          sceneType: mapSceneType(s.type),
          narrationText: s.narration || '',
          visualPrompt: s.visualDesc || '',
          durationHint: s.durationSec || 7,
          sourceChunkIds: s.sourceChunkIds || [],
          latexFormulas: assignedFormulas,
          assignedFormula: s.assignedFormula || undefined,
          formulaName: s.formulaName || undefined,
          formulaMetaphor: s.formulaMetaphor || undefined,
        };
      }),
      totalDuration: episode.scenes.reduce((sum: number, s: any) => sum + (s.durationSec || 7), 0),
      tags: episode.hashtags || []
    };

    const videoResult = await videoService.createShortVideo({
      bookId: episode.documentId,
      shortPlan,
      imagePaths,
      ...useVeo && keyframePairs && { keyframePairs },
      config: {
        ...BOOKS_PROJECT_CONFIG,
        ttsVoice: config.ttsVoice || styleProfile.ttsVoice,
        ttsGender: config.ttsGender || styleProfile.ttsGender,
        ttsStylePrompt: styleProfile.ttsStylePrompt,
        mathFormulaPosition: styleProfile.defaultFormulaPosition,
        mathFillColor: styleProfile.mathSvgFillColor,
        // v12.2: Step 0 나레이션 감지 수식에도 변수 컬러 코딩 적용
        ...styleProfile.useColorCodedVariables && { useColorCodedVariables: true },
        ...styleProfile.variableColors && { variableColors: styleProfile.variableColors },
        ...config.orientation && { orientation: config.orientation },
        ...config.subtitleYPosition && { subtitleYPosition: config.subtitleYPosition },
        ...useVeo && { useVeoInterpolation: true },
        ...styleProfile.hookTextOverlay && { hookTextOverlay: styleProfile.hookTextOverlay },
      }
    });

    await fs.default.remove(tempDir);

    if (!videoResult.success) {
      await neo4j.updateEpisodeStatus(episode.id, 'approved');
      return { success: false, error: `Video generation failed: ${videoResult.error}` };
    }

    if (!videoResult.videoId || !videoResult.videoPath) {
      await neo4j.updateEpisodeStatus(episode.id, 'approved');
      return { success: false, error: 'Video generation succeeded but videoId or videoPath is missing' };
    }

    // 6. GCS 업로드
    let gcsUrl: string | undefined;
    let publicUrl: string | undefined;

    try {
      const gcsService = new GoogleCloudStorageService(appConfig);
      const uploadResult = await gcsService.uploadVideo(
        videoResult.videoId,
        videoResult.videoPath,
        (progress) => {
          logger.info({
            videoId: videoResult.videoId,
            percentComplete: progress.percentComplete
          }, '📤 GCS 업로드 진행 중');
        }
      );

      if (uploadResult.success) {
        gcsUrl = uploadResult.gcsPath;
        publicUrl = uploadResult.publicUrl;
        logger.info({
          videoId: videoResult.videoId,
          gcsPath: gcsUrl,
          publicUrl
        }, '✅ GCS 업로드 완료');
      }
    } catch (gcsError) {
      logger.warn({
        error: gcsError,
        videoId: videoResult.videoId
      }, '⚠️ GCS 업로드 실패 (로컬 파일은 유지)');
    }

    // 7. Episode 상태 completed
    await neo4j.updateEpisodeStatus(episode.id, 'completed', {
      videoPath: videoResult.videoPath
    });

    logger.info({
      episodeId: episode.id,
      videoId: videoResult.videoId,
      videoPath: videoResult.videoPath,
      gcsUrl,
      duration: videoResult.duration
    }, '✅ Episode 비디오 생성 완료');

    return {
      success: true,
      videoResult,
      gcsUrl,
      publicUrl,
      _styleDebug: { resolvedStyle, styleId: styleProfile.id, isNonGhibli: styleProfile.id !== 'ghibli' },
    };
  }
}
