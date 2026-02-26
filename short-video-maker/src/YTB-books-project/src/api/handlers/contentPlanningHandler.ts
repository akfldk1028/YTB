/**
 * Content Planning 핸들러 — 커리큘럼/분석/에피소드 생성
 * - POST /:bookId/curriculum
 * - POST /:bookId/entities
 * - POST /:bookId/analyze
 * - GET  /:bookId/plan
 * - POST /:bookId/shorts
 * - POST /:bookId/episodes (from plan + manual)
 */

import type { Router, Request, Response } from 'express';
import { logger } from '../../../../config';
import type { ContentType, ShortsPlan } from '../../services/ContentPlannerService';
import { getStyleProfile } from '../../styles';
import type { RouterContext } from './types';

export function registerContentPlanningRoutes(router: Router, ctx: RouterContext) {

  // POST /api/books/:bookId/curriculum
  router.post('/:bookId/curriculum', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const {
        characterDescription, style,
        audienceLevel = 'elementary', useELI5Style = true,
        forceRefresh = false, saveToNeo4j = true, maxScenesPerShort = 8,
        useVeo = false,
      } = req.body;

      const curriculumStyleProfile = getStyleProfile(style);
      const resolvedStyle = curriculumStyleProfile.contentPlannerStyleHint;
      const curriculumStyleGuide = ctx.buildVisualPromptStyleGuide(curriculumStyleProfile);

      logger.info({ bookId, style, resolvedStyle: resolvedStyle.substring(0, 50), hasStyleGuide: !!curriculumStyleGuide, audienceLevel }, 'Sequential curriculum planning started');

      // Cache check
      const cacheKey = `curriculum_${bookId}_${style}`;
      if (!forceRefresh && ctx.plansCache.has(cacheKey)) {
        const cachedPlan = ctx.plansCache.get(cacheKey)!;
        return res.json({ success: true, cached: true, method: 'sequential-curriculum', plan: cachedPlan });
      }

      const neo4j = await ctx.getNeo4jService();
      const chunks = await neo4j.getChunks(bookId);
      if (!chunks || chunks.length === 0) {
        return res.status(404).json({ success: false, error: `No chunks found for: ${bookId}`, hint: 'Upload the document to NEB first' });
      }

      // Content type detection
      let contentType: ContentType = 'auto';
      const savedType = await neo4j.getDocumentContentType(bookId);
      if (savedType && ['math_science', 'humanities', 'social_science', 'empathy_lifestyle'].includes(savedType)) {
        contentType = savedType as ContentType;
      } else {
        const tempPlanner = ctx.getContentPlannerService();
        contentType = await tempPlanner.detectDocumentContentType(chunks);
        await neo4j.setDocumentContentType(bookId, contentType);
      }

      const planner = ctx.getContentPlannerService({
        audienceLevel, useELI5Style,
        style: resolvedStyle,
        maxShortsPerBook: 20, maxScenesPerShort, contentType,
        visualPromptStyleGuide: curriculumStyleGuide,
        engagementGuideOverride: curriculumStyleProfile.engagementGuide,
        useVeoInterpolation: useVeo === true,
      });

      const plan = await planner.analyzeAndPlanSequentialCurriculum(bookId, bookId.replace('.pdf', ''), chunks, characterDescription);
      ctx.plansCache.set(cacheKey, plan);

      // Save to Neo4j
      let savedEpisodes: any[] = [];
      if (saveToNeo4j && plan.shorts.length > 0) {
        const lastEpisodeNumber = await neo4j.getLastEpisodeNumber(bookId);
        let previousEpisodeId: string | undefined;

        if (lastEpisodeNumber > 0) {
          const existingEpisodes = await neo4j.getDocumentEpisodes(bookId);
          const lastEpisode = existingEpisodes.find(e => e.episodeNumber === lastEpisodeNumber);
          previousEpisodeId = lastEpisode?.id;
        }

        for (let i = 0; i < plan.shorts.length; i++) {
          const short = plan.shorts[i];
          const episodeNumber = lastEpisodeNumber + i + 1;

          try {
            const scenesInput = buildScenesInput(short);
            const episodeWithScenes = await neo4j.createEpisodeWithScenes(
              {
                documentId: bookId, episodeNumber,
                title: short.title, hook: short.hook || '',
                cta: '다음 영상에서 계속!', ctaAction: 'next_episode',
                keywords: short.tags?.slice(0, 5) || [],
                hashtags: short.tags?.map((t: string) => `#${t}`) || [],
                description: short.description || '', summary: short.summary || '',
                previousEpisodeId
              },
              scenesInput
            );

            savedEpisodes.push({ id: episodeWithScenes.id, episodeNumber, title: short.title, sceneCount: episodeWithScenes.scenes.length });

            if (previousEpisodeId) {
              await neo4j.linkEpisodes(previousEpisodeId, episodeWithScenes.id);
            }
            previousEpisodeId = episodeWithScenes.id;
          } catch (epError) {
            logger.error({ error: epError, episodeNumber }, 'Failed to save episode');
          }
        }
      }

      res.json({
        success: true, method: 'sequential-curriculum', bookId, contentType,
        totalEpisodes: plan.totalShorts,
        totalScenes: plan.metadata?.totalScenes,
        estimatedDuration: `${Math.round((plan.metadata?.estimatedTotalDuration || 0) / 60)}분`,
        savedToNeo4j: saveToNeo4j, savedEpisodes, plan
      });
    } catch (error) {
      logger.error({ error }, 'Curriculum planning failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/:bookId/entities
  router.post('/:bookId/entities', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const {
        characterDescription, style,
        audienceLevel = 'elementary', useELI5Style = true,
        forceRefresh = false, saveToNeo4j = true
      } = req.body;

      const cacheKey = `entity_${bookId}_${style}`;
      if (!forceRefresh && ctx.plansCache.has(cacheKey)) {
        return res.json({ success: true, cached: true, method: 'entity-clusters', plan: ctx.plansCache.get(cacheKey)! });
      }

      const neo4j = await ctx.getNeo4jService();
      const clusters = await neo4j.getEntityClusters(bookId);

      if (!clusters || clusters.length === 0) {
        return res.status(400).json({
          success: false,
          error: `No entity clusters found for: ${bookId}. Process with NEB (llm-graph-builder) first.`,
          hint: 'Upload the document to NEB frontend at http://34.47.112.49:8081 to extract entities.'
        });
      }

      const entityStyleProfile = getStyleProfile(style);
      const planner = ctx.getContentPlannerService({
        audienceLevel, useELI5Style,
        style: entityStyleProfile.contentPlannerStyleHint,
        maxShortsPerBook: clusters.length, maxScenesPerShort: 8,
        visualPromptStyleGuide: ctx.buildVisualPromptStyleGuide(entityStyleProfile),
        engagementGuideOverride: entityStyleProfile.engagementGuide
      });

      const shorts = [];
      for (let i = 0; i < clusters.length; i++) {
        const cluster = clusters[i];
        const chunkTexts = await neo4j.getClusterChunkTexts(cluster.chunkIds);

        const bookChunks = cluster.chunkIds.map((id: string, idx: number) => ({
          id, bookId, text: chunkTexts[idx] || '', chunkIndex: idx
        }));

        const clusterPlan = await planner.analyzeAndPlan(
          bookId, `${cluster.clusterName} - ${cluster.mainEntity}`, bookChunks, characterDescription
        );

        if (clusterPlan.shorts && clusterPlan.shorts.length > 0) {
          const short = clusterPlan.shorts[0];
          short.title = `${cluster.mainEntity}: ${short.title}`;
          short.theme = cluster.clusterName;
          shorts.push(short);
        }
      }

      const plan: ShortsPlan = {
        bookId, bookTitle: bookId, totalShorts: shorts.length,
        character: { description: characterDescription || 'A friendly anime character explaining complex topics simply', style },
        shorts,
        metadata: {
          analyzedAt: new Date().toISOString(),
          totalChunks: clusters.reduce((sum: number, c: any) => sum + c.chunkIds.length, 0),
          totalScenes: shorts.reduce((sum, s) => sum + s.scenes.length, 0),
          estimatedTotalDuration: shorts.reduce((sum, s) => sum + (s.totalDuration || 60), 0)
        }
      };

      ctx.plansCache.set(cacheKey, plan);
      ctx.plansCache.set(`${bookId}_${style}_${clusters.length}_8`, plan);

      // Save to Neo4j
      let savedEpisodes: any[] = [];
      if (saveToNeo4j && shorts.length > 0) {
        const lastEpisodeNumber = await neo4j.getLastEpisodeNumber(bookId);
        let previousEpisodeId: string | undefined;

        if (lastEpisodeNumber > 0) {
          const existingEpisodes = await neo4j.getDocumentEpisodes(bookId);
          const lastEpisode = existingEpisodes.find(e => e.episodeNumber === lastEpisodeNumber);
          previousEpisodeId = lastEpisode?.id;
        }

        for (let i = 0; i < shorts.length; i++) {
          const short = shorts[i];
          const episodeNumber = lastEpisodeNumber + i + 1;
          const scenesInput = buildScenesInput(short);

          const episodeWithScenes = await neo4j.createEpisodeWithScenes(
            {
              documentId: bookId, episodeNumber,
              title: short.title, hook: short.hook,
              cta: '다음 영상에서 계속!', ctaAction: 'next_episode',
              keywords: short.tags || [],
              hashtags: short.tags?.map((t: string) => `#${t}`) || [],
              description: short.description || '', summary: short.summary || '',
              previousEpisodeId
            },
            scenesInput
          );

          savedEpisodes.push(episodeWithScenes);
          previousEpisodeId = episodeWithScenes.id;
        }

        await neo4j.updateDocumentShortsStatus(bookId, 'analyzed', { totalShorts: lastEpisodeNumber + savedEpisodes.length });
      }

      res.json({
        success: true, cached: false, method: 'entity-clusters',
        clusterInfo: clusters.map((c: any) => ({
          name: c.clusterName, mainEntity: c.mainEntity, relatedEntities: c.relatedEntities, chunkCount: c.chunkIds.length
        })),
        plan, savedToNeo4j: saveToNeo4j,
        episodes: savedEpisodes.length > 0 ? savedEpisodes : undefined
      });
    } catch (error) {
      logger.error({ error }, 'Failed to analyze with entities');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/:bookId/analyze
  router.post('/:bookId/analyze', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const {
        characterDescription, style, maxShorts = 5, maxScenes = 6,
        forceRefresh = false, audienceLevel = 'general', useELI5Style = true
      } = req.body;

      const cacheKey = `${bookId}_${style}_${maxShorts}_${maxScenes}`;
      if (!forceRefresh && ctx.plansCache.has(cacheKey)) {
        return res.json({ success: true, cached: true, plan: ctx.plansCache.get(cacheKey)! });
      }

      const neo4j = await ctx.getNeo4jService();
      const books = await neo4j.getBooks();
      const book = books.find((b: any) => b.id === bookId || b.title === bookId);
      if (!book) {
        return res.status(404).json({ success: false, error: `Book not found: ${bookId}` });
      }

      const chunks = await neo4j.getChunks(bookId);
      if (chunks.length === 0) {
        return res.status(404).json({ success: false, error: `No chunks found for book: ${bookId}` });
      }

      const analyzeStyleProfile = getStyleProfile(style);
      const planner = ctx.getContentPlannerService({
        audienceLevel, useELI5Style,
        style: analyzeStyleProfile.contentPlannerStyleHint,
        maxShortsPerBook: maxShorts, maxScenesPerShort: maxScenes,
        visualPromptStyleGuide: ctx.buildVisualPromptStyleGuide(analyzeStyleProfile),
        engagementGuideOverride: analyzeStyleProfile.engagementGuide
      });

      const plan = await planner.analyzeAndPlan(bookId, book.title, chunks, characterDescription);
      ctx.plansCache.set(cacheKey, plan);

      res.json({ success: true, cached: false, plan });
    } catch (error) {
      logger.error({ error }, 'Failed to analyze book');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/:bookId/plan
  router.get('/:bookId/plan', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const matchingKeys = Array.from(ctx.plansCache.keys()).filter(k => k.startsWith(bookId));

      if (matchingKeys.length === 0) {
        return res.status(404).json({ success: false, error: `No plan found for book: ${bookId}. Use POST /api/books/${bookId}/analyze first.` });
      }

      const latestKey = matchingKeys[matchingKeys.length - 1];
      res.json({ success: true, cacheKey: latestKey, plan: ctx.plansCache.get(latestKey) });
    } catch (error) {
      logger.error({ error }, 'Failed to get plan');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/:bookId/shorts
  router.post('/:bookId/shorts', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const { chunkIndices, chunkLimit = 5, config = {} } = req.body;

      const neo4j = await ctx.getNeo4jService();
      const allChunks = await neo4j.getChunks(bookId);
      if (allChunks.length === 0) {
        return res.status(404).json({ success: false, error: `No chunks found for book: ${bookId}` });
      }

      let selectedChunks = allChunks;
      if (chunkIndices && Array.isArray(chunkIndices)) {
        selectedChunks = allChunks.filter((_: any, i: number) => chunkIndices.includes(i));
      } else {
        selectedChunks = allChunks.slice(0, chunkLimit);
      }

      const scenes = selectedChunks.map((chunk: any, index: number) => ({
        text: chunk.text.substring(0, 200),
        scenePrompt: `${chunk.text.substring(0, 100)}, educational illustration style, detailed background, warm lighting`,
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex
      }));

      res.json({
        success: true,
        message: 'Shorts generation data prepared',
        bookId,
        selectedChunks: selectedChunks.length,
        totalChunks: allChunks.length,
        scenes,
        shortsRequest: {
          character: { description: config.characterDescription || 'Wise owl professor character, round glasses, educational style' },
          scenes: scenes.map((s: any) => ({ text: s.text, scenePrompt: s.scenePrompt })),
          config: { orientation: 'portrait', generateVideos: config.generateVideos ?? false, skipTTS: config.skipTTS ?? false, useGPTFirst: config.useGPTFirst ?? true, ...config }
        }
      });
    } catch (error) {
      logger.error({ error }, 'Failed to prepare shorts');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/:bookId/episodes
  router.post('/:bookId/episodes', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const { fromPlan = true, shortIndex, manual } = req.body;

      const neo4j = await ctx.getNeo4jService();
      const lastEpisodeNumber = await neo4j.getLastEpisodeNumber(bookId);
      let previousEpisodeId: string | undefined;

      if (lastEpisodeNumber > 0) {
        const episodes = await neo4j.getDocumentEpisodes(bookId);
        const lastEpisode = episodes.find((e: any) => e.episodeNumber === lastEpisodeNumber);
        previousEpisodeId = lastEpisode?.id;
      }

      // Manual creation
      if (manual) {
        const scenesInput = (manual.scenes || []).map((s: any) => ({
          type: (s.type || 'explanation') as 'explanation',
          narration: s.narration as string,
          onScreenText: s.onScreenText as string,
          durationSec: (s.durationSec || 7) as number,
          visualType: (s.visualType || 'animation') as 'animation',
          visualDesc: (s.visualDesc || s.narration) as string,
          camera: (s.camera || 'static') as 'static',
          transition: (s.transition || 'cut') as 'cut',
          sourceChunkIds: (s.sourceChunkIds || []) as string[]
        }));

        const episodeWithScenes = await neo4j.createEpisodeWithScenes(
          {
            documentId: bookId, episodeNumber: lastEpisodeNumber + 1,
            title: manual.title, hook: manual.hook,
            cta: manual.cta || '다음 영상에서 계속!', ctaAction: manual.ctaAction || 'next_episode',
            keywords: manual.keywords || [], hashtags: manual.hashtags || [],
            description: manual.description || '', summary: manual.summary || '',
            previousEpisodeId
          },
          scenesInput
        );

        return res.json({ success: true, message: 'Episode created manually', episode: episodeWithScenes });
      }

      // From plan
      if (fromPlan) {
        const matchingKeys = Array.from(ctx.plansCache.keys()).filter(k => k.startsWith(bookId));
        if (matchingKeys.length === 0) {
          return res.status(404).json({ success: false, error: `No plan found for book: ${bookId}. Use POST /api/books/${bookId}/analyze first.` });
        }

        const plan = ctx.plansCache.get(matchingKeys[matchingKeys.length - 1]);
        if (!plan || !plan.shorts || plan.shorts.length === 0) {
          return res.status(404).json({ success: false, error: `No shorts in plan for book: ${bookId}` });
        }

        const shortsToCreate = shortIndex !== undefined ? [plan.shorts[shortIndex]] : plan.shorts;
        const createdEpisodes = [];
        let currentPreviousId = previousEpisodeId;

        for (let i = 0; i < shortsToCreate.length; i++) {
          const short = shortsToCreate[i];
          const episodeNumber = lastEpisodeNumber + i + 1;
          const scenesInput = buildScenesInput(short);

          const episodeWithScenes = await neo4j.createEpisodeWithScenes(
            {
              documentId: bookId, episodeNumber,
              title: short.title, hook: short.hook,
              cta: '다음 영상에서 계속!', ctaAction: 'next_episode',
              keywords: short.tags || [],
              hashtags: short.tags?.map((t: string) => `#${t}`) || [],
              description: short.description || '', summary: short.summary || '',
              previousEpisodeId: currentPreviousId
            },
            scenesInput
          );

          createdEpisodes.push(episodeWithScenes);
          currentPreviousId = episodeWithScenes.id;
        }

        await neo4j.updateDocumentShortsStatus(bookId, 'analyzed', { totalShorts: lastEpisodeNumber + createdEpisodes.length });

        return res.json({ success: true, message: `${createdEpisodes.length} episode(s) created from plan`, episodes: createdEpisodes });
      }

      return res.status(400).json({ success: false, error: 'Either fromPlan=true or manual data is required' });
    } catch (error) {
      logger.error({ error }, 'Failed to create episodes');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}

/** ShortsPlan의 scene → Neo4j CreateSceneInput 변환 헬퍼 */
function buildScenesInput(short: any) {
  return short.scenes.map((scene: any) => ({
    type: (scene.sceneType || 'explanation') as 'explanation',
    narration: scene.narrationText as string,
    onScreenText: scene.narrationText.substring(0, 50) as string,
    durationSec: (scene.durationHint || 7) as number,
    visualType: 'animation' as const,
    visualDesc: scene.visualPrompt as string,
    camera: 'static' as const,
    transition: 'cut' as const,
    sourceChunkIds: (scene.sourceChunkIds || []) as string[],
    assignedFormula: scene.assignedFormula || undefined,
    formulaName: scene.formulaName || undefined,
    formulaMetaphor: scene.formulaMetaphor || undefined,
    firstFramePrompt: scene.firstFramePrompt || undefined,
    lastFramePrompt: scene.lastFramePrompt || undefined,
  }));
}
