/**
 * Long-Form 컴필레이션 핸들러 (v9.0)
 * - GET  /longform/:documentId
 * - POST /longform/compile
 * - POST /longform/compile-and-upload
 */

import type { Router, Request, Response } from 'express';
import { logger } from '../../../../config';
import { getLongFormCompilerService } from '../../services/LongFormCompilerService';
import { getYouTubePublishService } from '../../services/YouTubePublishService';
import type { RouterContext } from './types';

export function registerLongFormRoutes(router: Router, ctx: RouterContext) {

  // GET /api/books/longform/:documentId
  router.get('/longform/:documentId', async (req: Request, res: Response) => {
    try {
      const { documentId } = req.params;
      const compiler = getLongFormCompilerService();
      const episodes = await compiler.getCompilableEpisodes(documentId);

      res.json({
        success: true,
        documentId,
        compilableCount: episodes.length,
        episodes: episodes.map(ep => ({
          id: ep.id,
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          status: ep.status,
          videoPath: ep.videoPath,
        })),
        readyToCompile: episodes.length >= 2,
      });
    } catch (error) {
      logger.error({ error }, '[LongForm] Failed to get compilable episodes');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/longform/compile
  router.post('/longform/compile', async (req: Request, res: Response) => {
    try {
      const { documentId, episodeIds, title, transitionType, transitionDuration, orientation, includeChapters } = req.body;

      if (!documentId) {
        return res.status(400).json({ success: false, error: 'documentId is required' });
      }

      const compiler = getLongFormCompilerService();
      const result = await compiler.compile({
        documentId, episodeIds, title, transitionType, transitionDuration, orientation, includeChapters,
      });

      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      logger.error({ error }, '[LongForm] Compilation failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/longform/compile-and-upload
  router.post('/longform/compile-and-upload', async (req: Request, res: Response) => {
    try {
      const {
        documentId, episodeIds, title, transitionType, transitionDuration,
        orientation, includeChapters, channelName, privacyStatus,
      } = req.body;

      if (!documentId) {
        return res.status(400).json({ success: false, error: 'documentId is required' });
      }

      // 1. Compile
      const compiler = getLongFormCompilerService();
      const compileResult = await compiler.compile({
        documentId, episodeIds, title, transitionType, transitionDuration, orientation, includeChapters,
      });

      if (!compileResult.success || !compileResult.videoPath) {
        return res.status(400).json(compileResult);
      }

      // 2. Upload to YouTube
      const publisher = getYouTubePublishService();
      const compilationTitle = compileResult.title || `${documentId} 시리즈 모음`;

      const keywords = compileResult.aggregatedKeywords?.length
        ? compileResult.aggregatedKeywords
        : ['교육', '수학', '시리즈'];
      const hashtags = compileResult.aggregatedHashtags?.length
        ? compileResult.aggregatedHashtags
        : ['#교육', '#수학', '#시리즈모음'];

      const publishResult = await publisher.publish({
        videoPath: compileResult.videoPath,
        episode: {
          id: `longform_${documentId}_${Date.now()}`,
          title: compilationTitle,
          hook: compilationTitle,
          cta: '',
          keywords,
          hashtags,
          episodeNumber: 0,
          documentId,
          description: compileResult.chaptersDescription
            ? `${compilationTitle}\n\n${compileResult.chaptersDescription}`
            : compilationTitle,
        },
        documentTitle: compilationTitle,
        channelName,
        privacyStatus: privacyStatus || 'private',
      });

      // Shorts URL → 일반 URL 교정
      if (publishResult.youtubeUrl && publishResult.youtubeId) {
        publishResult.youtubeUrl = `https://www.youtube.com/watch?v=${publishResult.youtubeId}`;
      }

      res.json({ ...compileResult, upload: publishResult });
    } catch (error) {
      logger.error({ error }, '[LongForm] Compile-and-upload failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
