/**
 * Episode CRUD 핸들러
 * - GET /episodes/stats
 * - POST /episodes/delete
 * - GET /episodes/pending
 * - GET /episodes/:episodeId
 * - PUT /episodes/:episodeId/status
 */

import type { Router, Request, Response } from 'express';
import { logger } from '../../../../config';
import type { RouterContext } from './types';

export function registerEpisodeRoutes(router: Router, ctx: RouterContext) {

  // GET /api/books/episodes/stats
  router.get('/episodes/stats', async (req: Request, res: Response) => {
    try {
      const neo4j = await ctx.getNeo4jService();
      const stats = await neo4j.getEpisodeStats();
      res.json({ success: true, stats });
    } catch (error) {
      logger.error({ error }, 'Failed to get episode stats');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/episodes/delete
  router.post('/episodes/delete', async (req: Request, res: Response) => {
    try {
      const { documentId, deleteCompleted = false } = req.body;
      if (!documentId) {
        return res.status(400).json({ success: false, error: 'documentId required' });
      }

      const neo4j = await ctx.getNeo4jService();
      const result = deleteCompleted
        ? await neo4j.deleteAllEpisodes(documentId)
        : await neo4j.deleteDraftEpisodes(documentId);

      res.json({
        success: true,
        ...result,
        message: `Deleted ${result.deletedEpisodes} episodes and ${result.deletedScenes} scenes for ${documentId}`
      });
    } catch (error) {
      logger.error({ error }, 'Failed to delete episodes');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/episodes/pending
  router.get('/episodes/pending', async (req: Request, res: Response) => {
    try {
      const { documentId } = req.query;
      const neo4j = await ctx.getNeo4jService();
      const episode = await neo4j.getNextPendingEpisode(documentId as string | undefined);

      if (!episode) {
        return res.json({ success: true, message: 'No pending episodes', episode: null });
      }

      const episodeWithScenes = await neo4j.getEpisodeWithScenes(episode.id);
      res.json({ success: true, episode: episodeWithScenes });
    } catch (error) {
      logger.error({ error }, 'Failed to get pending episode');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/episodes/:episodeId
  router.get('/episodes/:episodeId', async (req: Request, res: Response) => {
    try {
      const { episodeId } = req.params;
      const neo4j = await ctx.getNeo4jService();
      const episode = await neo4j.getEpisodeWithScenes(episodeId);

      if (!episode) {
        return res.status(404).json({ success: false, error: `Episode not found: ${episodeId}` });
      }
      res.json({ success: true, episode });
    } catch (error) {
      logger.error({ error }, 'Failed to get episode');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // PUT /api/books/episodes/:episodeId/status
  router.put('/episodes/:episodeId/status', async (req: Request, res: Response) => {
    try {
      const { episodeId } = req.params;
      const { status, masterImagePath, videoPath, youtubeId } = req.body;

      const validStatuses = ['draft', 'approved', 'producing', 'completed', 'uploaded'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }

      const neo4j = await ctx.getNeo4jService();
      const success = await neo4j.updateEpisodeStatus(episodeId, status, { masterImagePath, videoPath, youtubeId });

      if (!success) {
        return res.status(404).json({ success: false, error: `Episode not found: ${episodeId}` });
      }

      res.json({ success: true, episodeId, status, message: `Episode status updated to '${status}'` });
    } catch (error) {
      logger.error({ error }, 'Failed to update episode status');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
