/**
 * YouTube Publish 핸들러 (v8.1: 수익화 파이프라인)
 * - POST /episodes/:episodeId/upload
 * - POST /auto-pipeline
 * - POST /bulk-pipeline
 */

import type { Router, Request, Response } from 'express';
import { logger } from '../../../../config';
import { getYouTubePublishService } from '../../services/YouTubePublishService';
import type { RouterContext } from './types';

export function registerYouTubePublishRoutes(router: Router, ctx: RouterContext) {

  // POST /api/books/episodes/:episodeId/upload
  router.post('/episodes/:episodeId/upload', async (req: Request, res: Response) => {
    try {
      const { episodeId } = req.params;
      const { channelName, privacyStatus, firstComment } = req.body;

      const neo4j = await ctx.getNeo4jService();
      const episode = await neo4j.getEpisodeWithScenes(episodeId);

      if (!episode) {
        return res.status(404).json({ success: false, error: `Episode not found: ${episodeId}` });
      }
      if (!episode.videoPath) {
        return res.status(400).json({ success: false, error: `Episode has no video. Generate video first.` });
      }
      if (episode.youtubeId) {
        return res.json({ success: true, alreadyUploaded: true, youtubeId: episode.youtubeId, message: 'Episode already uploaded' });
      }

      const books = await neo4j.getBooks();
      const doc = books.find((b: any) => b.fileName === episode.documentId || b.id === episode.documentId);
      const documentTitle = doc?.title || episode.documentId;

      logger.info({ episodeId, title: episode.title, videoPath: episode.videoPath }, 'YouTube upload started');

      const publishService = getYouTubePublishService();
      const result = await publishService.publish({
        videoPath: episode.videoPath,
        episode: {
          id: episode.id,
          title: episode.title,
          hook: episode.hook,
          cta: episode.cta,
          keywords: episode.keywords || [],
          hashtags: episode.hashtags || [],
          episodeNumber: episode.episodeNumber,
          documentId: episode.documentId,
          description: (episode as any).description || '',
          summary: (episode as any).summary || '',
        },
        documentTitle,
        channelName: channelName || 'clickaround',
        privacyStatus: privacyStatus || 'private',
        firstComment: firstComment || `이 영상은 "${documentTitle}" 시리즈의 EP.${episode.episodeNumber}입니다. AI 기반 교육 콘텐츠입니다.`,
      });

      if (result.success && result.youtubeId) {
        await neo4j.updateEpisodeStatus(episodeId, 'uploaded', { youtubeId: result.youtubeId });
        logger.info({ episodeId, youtubeId: result.youtubeId, youtubeUrl: result.youtubeUrl }, 'YouTube upload complete');
      }

      return res.json({
        success: result.success,
        episodeId,
        youtubeId: result.youtubeId,
        youtubeUrl: result.youtubeUrl,
        error: result.error,
      });
    } catch (error) {
      logger.error({ error }, 'YouTube upload failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/auto-pipeline
  router.post('/auto-pipeline', async (req: Request, res: Response) => {
    try {
      const { documentId, style, useVeo, channelName, privacyStatus, config: rawConfig = {} } = req.body;
      const config = { ...rawConfig, style: rawConfig.style || style, ...useVeo !== undefined && { useVeo } };

      const neo4j = await ctx.getNeo4jService();

      const episode = await neo4j.getNextPendingEpisode(documentId as string | undefined);
      if (!episode) {
        return res.json({ success: true, completed: true, message: 'All episodes completed!' });
      }

      const episodeWithScenes = await neo4j.getEpisodeWithScenes(episode.id);
      if (!episodeWithScenes || !episodeWithScenes.scenes?.length) {
        return res.status(400).json({ success: false, error: `Episode has no scenes: ${episode.id}` });
      }

      logger.info({ episodeId: episode.id, episodeNumber: episode.episodeNumber, title: episode.title },
        'Auto-pipeline started: generate + upload');

      // Video generation
      await neo4j.updateEpisodeStatus(episode.id, 'producing');
      const videoResult = await ctx.generateEpisodeVideoPipeline(episodeWithScenes, config, neo4j);

      if (!videoResult.success) {
        return res.status(500).json({ success: false, phase: 'video_generation', error: videoResult.error });
      }

      // YouTube upload
      const books = await neo4j.getBooks();
      const doc = books.find((b: any) => b.fileName === episode.documentId || b.id === episode.documentId);
      const documentTitle = doc?.title || episode.documentId;

      const publishService = getYouTubePublishService();
      const uploadResult = await publishService.publish({
        videoPath: videoResult.videoResult.videoPath,
        episode: {
          id: episode.id,
          title: episode.title,
          hook: episode.hook,
          cta: episode.cta,
          keywords: episode.keywords || [],
          hashtags: episode.hashtags || [],
          episodeNumber: episode.episodeNumber,
          documentId: episode.documentId,
          description: (episode as any).description || '',
          summary: (episode as any).summary || '',
        },
        documentTitle,
        channelName: channelName || 'clickaround',
        privacyStatus: privacyStatus || 'private',
        firstComment: `이 영상은 "${documentTitle}" 시리즈의 EP.${episode.episodeNumber}입니다. AI 기반 교육 콘텐츠입니다.`,
      });

      if (uploadResult.success && uploadResult.youtubeId) {
        await neo4j.updateEpisodeStatus(episode.id, 'uploaded', { youtubeId: uploadResult.youtubeId });
      }

      const nextPending = await neo4j.getNextPendingEpisode(documentId as string | undefined);
      const stats = await neo4j.getEpisodeStats();

      return res.json({
        success: true,
        completed: !nextPending,
        episodeId: episode.id,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        video: {
          videoId: videoResult.videoResult.videoId,
          videoPath: videoResult.videoResult.videoPath,
          duration: videoResult.videoResult.duration,
        },
        youtube: {
          uploaded: uploadResult.success,
          youtubeId: uploadResult.youtubeId,
          youtubeUrl: uploadResult.youtubeUrl,
          error: uploadResult.error,
        },
        progress: {
          totalEpisodes: stats.totalEpisodes,
          completedEpisodes: stats.byStatus['completed'] || 0,
          uploadedEpisodes: stats.byStatus['uploaded'] || 0,
          remainingEpisodes: (stats.byStatus['draft'] || 0) + (stats.byStatus['approved'] || 0),
          nextPendingEpisode: nextPending ? { id: nextPending.id, episodeNumber: nextPending.episodeNumber, title: nextPending.title } : null
        },
      });
    } catch (error) {
      logger.error({ error }, 'Auto-pipeline failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/bulk-pipeline
  router.post('/bulk-pipeline', async (req: Request, res: Response) => {
    try {
      const { documentId, style, useVeo, channelName, privacyStatus, maxEpisodes = 5, config: rawConfig = {} } = req.body;
      const config = { ...rawConfig, style: rawConfig.style || style, ...useVeo !== undefined && { useVeo } };

      const neo4j = await ctx.getNeo4jService();

      logger.info({ documentId, maxEpisodes }, 'Bulk pipeline started');

      const results: any[] = [];
      let processedCount = 0;

      for (let i = 0; i < maxEpisodes; i++) {
        const episode = await neo4j.getNextPendingEpisode(documentId as string | undefined);
        if (!episode) {
          logger.info({ processedCount }, 'Bulk pipeline complete: no more pending episodes');
          break;
        }

        const episodeWithScenes = await neo4j.getEpisodeWithScenes(episode.id);
        if (!episodeWithScenes || !episodeWithScenes.scenes?.length) {
          results.push({ episodeId: episode.id, success: false, error: 'No scenes' });
          continue;
        }

        try {
          await neo4j.updateEpisodeStatus(episode.id, 'producing');
          const videoResult = await ctx.generateEpisodeVideoPipeline(episodeWithScenes, config, neo4j);

          if (!videoResult.success) {
            results.push({ episodeId: episode.id, episodeNumber: episode.episodeNumber, success: false, phase: 'video', error: videoResult.error });
            continue;
          }

          const books = await neo4j.getBooks();
          const doc = books.find((b: any) => b.fileName === episode.documentId || b.id === episode.documentId);
          const documentTitle = doc?.title || episode.documentId;

          const publishService = getYouTubePublishService();
          const uploadResult = await publishService.publish({
            videoPath: videoResult.videoResult.videoPath,
            episode: {
              id: episode.id,
              title: episode.title,
              hook: episode.hook,
              cta: episode.cta,
              keywords: episode.keywords || [],
              hashtags: episode.hashtags || [],
              episodeNumber: episode.episodeNumber,
              documentId: episode.documentId,
              description: (episode as any).description || '',
              summary: (episode as any).summary || '',
            },
            documentTitle,
            channelName: channelName || 'clickaround',
            privacyStatus: privacyStatus || 'private',
          });

          if (uploadResult.success && uploadResult.youtubeId) {
            await neo4j.updateEpisodeStatus(episode.id, 'uploaded', { youtubeId: uploadResult.youtubeId });
          }

          results.push({
            episodeId: episode.id,
            episodeNumber: episode.episodeNumber,
            title: episode.title,
            success: true,
            youtubeId: uploadResult.youtubeId,
            youtubeUrl: uploadResult.youtubeUrl,
            duration: videoResult.videoResult.duration,
          });
          processedCount++;

          logger.info({ episodeNumber: episode.episodeNumber, youtubeId: uploadResult.youtubeId },
            `Bulk [${i + 1}/${maxEpisodes}] complete`);

        } catch (epError) {
          results.push({
            episodeId: episode.id,
            episodeNumber: episode.episodeNumber,
            success: false,
            error: epError instanceof Error ? epError.message : 'Unknown error'
          });
        }
      }

      const stats = await neo4j.getEpisodeStats();

      return res.json({
        success: true,
        processedCount,
        totalResults: results.length,
        successCount: results.filter(r => r.success).length,
        failedCount: results.filter(r => !r.success).length,
        results,
        progress: {
          totalEpisodes: stats.totalEpisodes,
          completedEpisodes: stats.byStatus['completed'] || 0,
          uploadedEpisodes: stats.byStatus['uploaded'] || 0,
          remainingEpisodes: (stats.byStatus['draft'] || 0) + (stats.byStatus['approved'] || 0),
        },
      });
    } catch (error) {
      logger.error({ error }, 'Bulk pipeline failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
