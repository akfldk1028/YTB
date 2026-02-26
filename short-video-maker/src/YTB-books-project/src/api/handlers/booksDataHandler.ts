/**
 * Books Data 핸들러 — CRUD + 기타 데이터 조회
 * - GET  /                          (books list)
 * - GET  /pending                   (unprocessed)
 * - GET  /stats                     (graph stats)
 * - GET  /test-korean-tts
 * - GET  /connection
 * - PUT  /:bookId/status
 * - GET  /:bookId                   (detail)
 * - GET  /:bookId/chunks
 * - GET  /:bookId/chunks/:chunkId/entities
 * - GET  /:bookId/series
 * - GET  /:bookId/episodes          (list)
 * - POST /search
 * - POST /test-video
 * - POST /:bookId/generate-video    (plan-based)
 * - GET  /download/:videoId
 */

import type { Router, Request, Response } from 'express';
import { logger, Config } from '../../../../config';
import { GoogleCloudStorageService } from '../../../../storage/GoogleCloudStorageService';
import { getBooksVideoService } from '../../services/BooksVideoService';
import type { RouterContext } from './types';

export function registerBooksDataRoutes(router: Router, ctx: RouterContext) {

  // GET /api/books
  router.get('/', async (req: Request, res: Response) => {
    try {
      const neo4j = await ctx.getNeo4jService();
      const books = await neo4j.getBooks();
      res.json({ success: true, count: books.length, books });
    } catch (error) {
      logger.error({ error }, 'Failed to get books');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/pending
  router.get('/pending', async (req: Request, res: Response) => {
    try {
      const neo4j = await ctx.getNeo4jService();
      const books = await neo4j.getUnprocessedDocuments();
      res.json({ success: true, count: books.length, message: `${books.length} documents pending for Shorts generation`, books });
    } catch (error) {
      logger.error({ error }, 'Failed to get pending books');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/stats
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const neo4j = await ctx.getNeo4jService();
      const stats = await neo4j.getGraphStats();
      res.json({ success: true, stats });
    } catch (error) {
      logger.error({ error }, 'Failed to get stats');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/test-korean-tts
  router.get('/test-korean-tts', async (req: Request, res: Response) => {
    try {
      const koreanText = '안녕하세요. 테스트입니다.';
      const { GeminiTTS } = await import('../../../../YTB-tts/index.js');
      const config = new Config();

      const geminiTTS = new GeminiTTS({
        apiKey: config.googleGeminiApiKey,
        model: 'gemini-2.5-flash-preview-tts',
        defaultGender: 'female',
      });

      const result = await geminiTTS.generate(koreanText, 'Kore', { useNewsVoice: false });

      res.json({
        success: true, text: koreanText,
        audioSize: result.audio.byteLength,
        audioLength: result.audioLength,
        voice: result.voice,
      });
    } catch (error) {
      logger.error({ error }, 'Korean TTS test failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/connection
  router.get('/connection', async (req: Request, res: Response) => {
    try {
      const neo4j = await ctx.getNeo4jService();
      const result = await neo4j.testConnection();
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Connection test failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // PUT /api/books/:bookId/status
  router.put('/:bookId/status', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const { status, planId, totalShorts } = req.body;

      const validStatuses = ['pending', 'analyzed', 'generating', 'completed', 'uploaded'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }

      const neo4j = await ctx.getNeo4jService();
      const success = await neo4j.updateDocumentShortsStatus(bookId, status, { planId, totalShorts });
      if (!success) {
        return res.status(404).json({ success: false, error: `Document not found: ${bookId}` });
      }

      res.json({ success: true, bookId, status, message: `Document status updated to '${status}'` });
    } catch (error) {
      logger.error({ error }, 'Failed to update status');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/:bookId
  router.get('/:bookId', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const neo4j = await ctx.getNeo4jService();
      const books = await neo4j.getBooks();
      const book = books.find((b: any) => b.id === bookId || b.title === bookId);
      if (!book) {
        return res.status(404).json({ success: false, error: `Book not found: ${bookId}` });
      }

      const chunks = await neo4j.getChunks(bookId, limit);
      res.json({ success: true, book, chunks, chunkCount: chunks.length });
    } catch (error) {
      logger.error({ error }, 'Failed to get book detail');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/:bookId/chunks
  router.get('/:bookId/chunks', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const neo4j = await ctx.getNeo4jService();
      const allChunks = await neo4j.getChunks(bookId);
      const chunks = limit ? allChunks.slice(offset, offset + limit) : allChunks.slice(offset);

      res.json({ success: true, bookId, total: allChunks.length, offset, limit, chunks });
    } catch (error) {
      logger.error({ error }, 'Failed to get chunks');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/:bookId/chunks/:chunkId/entities
  router.get('/:bookId/chunks/:chunkId/entities', async (req: Request, res: Response) => {
    try {
      const { chunkId } = req.params;
      const neo4j = await ctx.getNeo4jService();
      const entities = await neo4j.getChunkEntities(chunkId);
      res.json({ success: true, chunkId, entities });
    } catch (error) {
      logger.error({ error }, 'Failed to get chunk entities');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/:bookId/series
  router.get('/:bookId/series', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const neo4j = await ctx.getNeo4jService();
      const series = await neo4j.getDocumentSeries(bookId);
      if (!series) {
        return res.status(404).json({ success: false, error: `Document not found: ${bookId}` });
      }
      res.json({ success: true, series });
    } catch (error) {
      logger.error({ error }, 'Failed to get series');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/:bookId/episodes
  router.get('/:bookId/episodes', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const neo4j = await ctx.getNeo4jService();
      const episodes = await neo4j.getDocumentEpisodes(bookId);
      res.json({ success: true, bookId, count: episodes.length, episodes });
    } catch (error) {
      logger.error({ error }, 'Failed to get episodes');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/search
  router.post('/search', async (req: Request, res: Response) => {
    try {
      const { query, topK = 5 } = req.body;
      if (!query) {
        return res.status(400).json({ success: false, error: 'query is required' });
      }

      const neo4j = await ctx.getNeo4jService();
      const results = await neo4j.searchSimilarChunks(query, topK);
      res.json({ success: true, query, results });
    } catch (error) {
      logger.error({ error }, 'Failed to search chunks');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/test-video
  router.post('/test-video', async (req: Request, res: Response) => {
    try {
      const { images, outputPath, config } = req.body;

      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({
          success: false, error: 'images array is required. Format: [{ path?: string, url?: string, narration: string }, ...]'
        });
      }

      const fs = await import('fs-extra');
      const path = await import('path');
      const appConfig = new Config();

      const processedImages: Array<{ path: string; narration: string }> = [];
      const tempDir = path.default.join(appConfig.tempDirPath, `test_video_${Date.now()}`);
      await fs.default.ensureDir(tempDir);

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img.narration || img.narration.trim().length === 0) {
          return res.status(400).json({ success: false, error: `images[${i}].narration is required` });
        }
        if (!img.path && !img.url) {
          return res.status(400).json({ success: false, error: `images[${i}].path or images[${i}].url is required` });
        }

        let imagePath = img.path;
        if (img.url) {
          try {
            const response = await fetch(img.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            const contentType = response.headers.get('content-type') || '';
            let ext = 'png';
            if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
            else if (contentType.includes('webp')) ext = 'webp';
            imagePath = path.default.join(tempDir, `image_${i}.${ext}`);
            await fs.default.writeFile(imagePath, buffer);
          } catch (err) {
            return res.status(400).json({ success: false, error: `Failed to download image from URL: ${img.url} - ${err}` });
          }
        }
        processedImages.push({ path: imagePath, narration: img.narration });
      }

      const videoService = getBooksVideoService();
      const result = await videoService.testImageTTSCombination(processedImages, outputPath, config);

      try { await fs.default.remove(tempDir); } catch { /* ignore */ }

      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Failed to create test video');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/:bookId/generate-video (plan-based)
  router.post('/:bookId/generate-video', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const { shortIndex = 0, imagePaths, config } = req.body;

      const matchingKeys = Array.from(ctx.plansCache.keys()).filter(k => k.startsWith(bookId));
      if (matchingKeys.length === 0) {
        return res.status(404).json({ success: false, error: `No plan found for book: ${bookId}. Use POST /api/books/${bookId}/analyze first.` });
      }

      const plan = ctx.plansCache.get(matchingKeys[matchingKeys.length - 1]);
      if (!plan || !plan.shorts || plan.shorts.length === 0) {
        return res.status(404).json({ success: false, error: `No shorts in plan for book: ${bookId}` });
      }
      if (shortIndex >= plan.shorts.length) {
        return res.status(400).json({ success: false, error: `Invalid shortIndex: ${shortIndex}. Plan has ${plan.shorts.length} shorts.` });
      }

      const shortPlan = plan.shorts[shortIndex];
      if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length !== shortPlan.scenes.length) {
        return res.status(400).json({ success: false, error: `imagePaths must be an array with ${shortPlan.scenes.length} elements (matching scene count)` });
      }

      const videoService = getBooksVideoService();
      const result = await videoService.createShortVideo({ bookId, shortPlan, imagePaths, config });
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Failed to generate video');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/download/:videoId
  router.get('/download/:videoId', async (req: Request, res: Response) => {
    try {
      const { videoId } = req.params;
      const fs = await import('fs-extra');
      const path = await import('path');
      const appConfig = new Config();

      const videoPath = path.default.join(appConfig.videosDirPath, 'books', `${videoId}.mp4`);

      if (await fs.default.pathExists(videoPath)) {
        return res.download(videoPath, `${videoId}.mp4`, (err) => {
          if (err) logger.error({ error: err }, 'Download failed');
        });
      }

      // GCS fallback
      try {
        const gcsService = new GoogleCloudStorageService(appConfig);
        const signedUrl = await gcsService.generateSignedUrl(`videos/${videoId}.mp4`, { action: 'read', expires: 60 * 60 * 1000 });
        if (signedUrl) {
          return res.redirect(signedUrl);
        }
      } catch (gcsError) {
        logger.warn({ error: gcsError, videoId }, 'GCS download failed');
      }

      return res.status(404).json({ success: false, error: `Video not found: ${videoId}`, path: videoPath, hint: 'Video may have been deleted or not uploaded to GCS' });
    } catch (error) {
      logger.error({ error }, 'Failed to download video');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
