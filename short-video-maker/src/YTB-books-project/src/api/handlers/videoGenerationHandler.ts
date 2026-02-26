/**
 * Video Generation 핸들러
 * - POST /episodes/:episodeId/generate-video
 * - POST /episodes/:episodeId/generate-images
 * - POST /generate-next-episode
 */

import type { Router, Request, Response } from 'express';
import { logger } from '../../../../config';
import type { RouterContext } from './types';

export function registerVideoGenerationRoutes(router: Router, ctx: RouterContext) {

  // POST /api/books/episodes/:episodeId/generate-video
  router.post('/episodes/:episodeId/generate-video', async (req: Request, res: Response) => {
    try {
      const { episodeId } = req.params;
      const { style, useVeo, config: rawConfig = {} } = req.body;
      const config = { ...rawConfig, style: rawConfig.style || style, ...useVeo !== undefined && { useVeo } };

      const neo4j = await ctx.getNeo4jService();
      const episode = await neo4j.getEpisodeWithScenes(episodeId);
      if (!episode) {
        return res.status(404).json({ success: false, error: `Episode not found: ${episodeId}` });
      }
      if (!episode.scenes || episode.scenes.length === 0) {
        return res.status(400).json({ success: false, error: `Episode has no scenes: ${episodeId}` });
      }

      logger.info({
        episodeId, title: episode.title, sceneCount: episode.scenes.length, status: episode.status, useVeo: !!useVeo
      }, 'Episode video generation started');

      await neo4j.updateEpisodeStatus(episodeId, 'producing');
      const result = await ctx.generateEpisodeVideoPipeline(episode, config, neo4j);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      return res.json({
        success: true,
        episodeId,
        videoId: result.videoResult.videoId,
        videoPath: result.videoResult.videoPath,
        gcsUrl: result.gcsUrl,
        publicUrl: result.publicUrl,
        duration: result.videoResult.duration,
        details: result.videoResult.details,
        message: 'Episode video generated successfully'
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate episode video');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/episodes/:episodeId/generate-images
  router.post('/episodes/:episodeId/generate-images', async (req: Request, res: Response) => {
    try {
      const { episodeId } = req.params;
      const { style, config: rawConfig = {} } = req.body;
      const config = { ...rawConfig, style: rawConfig.style || style };

      const neo4j = await ctx.getNeo4jService();
      const episode = await neo4j.getEpisodeWithScenes(episodeId);

      if (!episode) {
        return res.status(404).json({ success: false, error: `Episode not found: ${episodeId}` });
      }
      if (!episode.scenes || episode.scenes.length === 0) {
        return res.status(400).json({ success: false, error: `Episode has no scenes: ${episodeId}` });
      }

      const result = await ctx.orchestrator.generateEpisodeImages(episode, config, neo4j);

      res.json({
        success: result.success,
        episodeId,
        outputDir: result.outputDir,
        total: result.results?.length || 0,
        successCount: result.results?.filter((r: any) => r.success).length || 0,
        failedCount: result.results?.filter((r: any) => !r.success).length || 0,
        results: result.results
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate episode images');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/generate-next-episode
  router.post('/generate-next-episode', async (req: Request, res: Response) => {
    try {
      const { documentId, style, useVeo, config: rawConfig = {} } = req.body;
      const config = { ...rawConfig, style: rawConfig.style || style, ...useVeo !== undefined && { useVeo } };

      const neo4j = await ctx.getNeo4jService();

      const episode = await neo4j.getNextPendingEpisode(documentId as string | undefined);
      if (!episode) {
        return res.json({
          success: true,
          completed: true,
          message: documentId
            ? `No pending episodes for document: ${documentId}. All episodes are completed!`
            : 'No pending episodes. All episodes are completed!',
          episode: null
        });
      }

      const episodeWithScenes = await neo4j.getEpisodeWithScenes(episode.id);
      if (!episodeWithScenes) {
        return res.status(404).json({ success: false, error: `Episode not found: ${episode.id}` });
      }
      if (!episodeWithScenes.scenes || episodeWithScenes.scenes.length === 0) {
        return res.status(400).json({ success: false, error: `Episode has no scenes: ${episode.id}` });
      }

      logger.info({
        episodeId: episode.id, episodeNumber: episode.episodeNumber,
        documentId: episode.documentId, title: episode.title,
        sceneCount: episodeWithScenes.scenes.length, status: episode.status
      }, 'Next pending episode video generation started (incremental mode)');

      await neo4j.updateEpisodeStatus(episode.id, 'producing');
      const result = await ctx.generateEpisodeVideoPipeline(episodeWithScenes, config, neo4j);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      // Progress
      const nextPending = await neo4j.getNextPendingEpisode(documentId as string | undefined);
      const stats = await neo4j.getEpisodeStats();
      const completedCount = stats.byStatus['completed'] || 0;
      const pendingCount = stats.byStatus['draft'] || 0;
      const approvedCount = stats.byStatus['approved'] || 0;

      return res.json({
        success: true,
        completed: !nextPending,
        episodeId: episode.id,
        episodeNumber: episode.episodeNumber,
        documentId: episode.documentId,
        title: episode.title,
        videoId: result.videoResult.videoId,
        videoPath: result.videoResult.videoPath,
        gcsUrl: result.gcsUrl,
        publicUrl: result.publicUrl,
        duration: result.videoResult.duration,
        details: result.videoResult.details,
        _styleUsed: result._styleDebug?.styleId,
        progress: {
          totalEpisodes: stats.totalEpisodes,
          completedEpisodes: completedCount,
          remainingEpisodes: pendingCount + approvedCount,
          nextPendingEpisode: nextPending ? {
            id: nextPending.id,
            episodeNumber: nextPending.episodeNumber,
            title: nextPending.title
          } : null
        },
        message: nextPending
          ? `Episode ${episode.episodeNumber} completed. Next: Episode ${nextPending.episodeNumber}`
          : `Episode ${episode.episodeNumber} completed. All episodes done!`
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate next episode video');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
