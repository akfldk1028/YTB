/**
 * NotebookLM 핸들러 (v13.1: 슬라이드 → 영상)
 * - POST /:bookId/rechunk
 * - GET  /:bookId/export/notebooklm
 * - GET  /:bookId/export/notebooklm/files
 * - GET  /:bookId/export/episodes
 * - POST /:bookId/slides/generate-video
 * - POST /:bookId/import/slides
 */

import * as path from 'path';
import fs from 'fs-extra';
import type { Router, Request, Response } from 'express';
import { logger, Config } from '../../../../config';
import { getNotebookLMService } from '../../services/NotebookLMService';
import { getSemanticRechunkService } from '../../services/SemanticRechunkService';
import { getSlideToVideoNode } from '../../services/SlideToVideoNode';
import type { RouterContext } from './types';

export function registerNotebookLMRoutes(router: Router, ctx: RouterContext) {

  // POST /api/books/:bookId/rechunk
  router.post('/:bookId/rechunk', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const { chunkStrategy = 'semantic' } = req.body || {};

      if (chunkStrategy !== 'semantic') {
        return res.status(400).json({ success: false, error: `Unknown strategy: ${chunkStrategy}. Use 'semantic'.` });
      }

      const neo4j = await ctx.getNeo4jService();
      const existingChunks = await neo4j.getChunks(bookId);
      if (existingChunks.length === 0) {
        return res.status(404).json({ success: false, error: `No chunks found for "${bookId}". Import PDF first.` });
      }

      const appConfig = new Config();
      const apiKey = appConfig.googleGeminiApiKey || process.env.GOOGLE_GEMINI_API_KEY || '';
      if (!apiKey) {
        return res.status(400).json({ success: false, error: 'GOOGLE_GEMINI_API_KEY required for semantic chunking' });
      }

      const result = await getSemanticRechunkService().rechunk({ bookId, chunks: existingChunks, apiKey });
      await neo4j.replaceChunksAtomic(bookId, result.chapters);

      res.json({
        success: true,
        message: `Rechunked ${bookId}: ${result.previousChunkCount} chunks → ${result.chapters.length} semantic chapters`,
        previousChunkCount: result.previousChunkCount,
        newChunkCount: result.chapters.length,
        missingChunksFixed: result.missingChunksFixed,
        chapters: result.chapters.map(c => ({ title: c.title, summary: c.summary, keywords: c.keywords, chunkType: c.chunkType, textLength: c.text.length })),
      });
    } catch (error) {
      logger.error({ error }, '[Rechunk] Failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/:bookId/export/notebooklm
  router.get('/:bookId/export/notebooklm', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const neo4j = await ctx.getNeo4jService();
      const chunks = await neo4j.getChunks(bookId);
      if (chunks.length === 0) {
        return res.status(404).json({ success: false, error: `No chunks found for "${bookId}"` });
      }

      const { chapters, fullMarkdown } = getNotebookLMService().getChaptersAsJson(bookId, chunks);
      res.json({ success: true, documentId: bookId, totalChunks: chunks.length, chapters, fullMarkdown });
    } catch (error) {
      logger.error({ error }, '[Export/NotebookLM] Failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/:bookId/export/notebooklm/files
  router.get('/:bookId/export/notebooklm/files', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const neo4j = await ctx.getNeo4jService();
      const chunks = await neo4j.getChunks(bookId);
      if (chunks.length === 0) {
        return res.status(404).json({ success: false, error: `No chunks found for "${bookId}"` });
      }

      const lmPromptDir = path.resolve(process.cwd(), '..', 'docs', 'LM_Prompt');
      const result = getNotebookLMService().exportPackage({ bookId, chunks, lmPromptDir });

      res.json({
        success: true, documentId: bookId, ...result,
        message: `NotebookLM package: ${result.sources.fileCount} sources + ${result.prompts.fileCount} prompts → ${result.baseDir}`,
        usage: {
          step1: 'sources/ 의 CH*.md 를 NotebookLM에 "Copied Text"로 추가',
          step2: 'prompts/ 의 EN.md 중 원하는 스타일을 NotebookLM "Describe the slide deck"에 복붙',
          step3: '생성된 슬라이드 PNG를 POST /api/books/:bookId/import/slides 로 업로드',
        },
      });
    } catch (error) {
      logger.error({ error }, '[Export/NotebookLM/Files] Failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/books/:bookId/export/episodes
  router.get('/:bookId/export/episodes', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const neo4j = await ctx.getNeo4jService();
      const series = await neo4j.getDocumentSeries(bookId);
      if (!series || series.episodes.length === 0) {
        return res.status(404).json({ success: false, error: `No episodes found for "${bookId}". Generate curriculum first.` });
      }

      const result = getNotebookLMService().exportEpisodes({ bookId, episodes: series.episodes });

      res.json({
        success: true, documentId: bookId, totalEpisodes: result.episodes.length, outputDir: result.outputDir,
        episodes: result.episodes.map(e => ({ episodeNumber: e.episodeNumber, title: e.title, fileName: e.fileName })),
        message: `${result.episodes.length} episode MD files saved to ${result.outputDir}`,
      });
    } catch (error) {
      logger.error({ error }, '[Export/Episodes] Failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/:bookId/slides/generate-video — 슬라이드 → 영상 생성
  router.post('/:bookId/slides/generate-video', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const {
        slidesDir, slidePaths, style, episodeNumber,
        language, narrationMode, manualNarrations,
        visionModel, maxNarrationLength, videoConfig,
      } = req.body || {};

      // slidesDir/slidePaths 미제공 시 기본 경로 시도
      let resolvedSlidesDir = slidesDir || '';
      if (!resolvedSlidesDir && !slidePaths) {
        const defaultDir = path.resolve(
          process.cwd(), 'downloads', 'books', 'notebookLM',
          bookId.replace(/\.pdf$/i, ''), 'slides',
        );
        if (!await fs.pathExists(defaultDir)) {
          return res.status(400).json({
            success: false,
            error: 'slidesDir or slidePaths required (or place slides in default location)',
            defaultDir,
            usage: {
              option1: `{ "slidesDir": "${defaultDir}" }`,
              option2: '{ "slidePaths": ["/path/slide1.png", ...] }',
            },
          });
        }
        resolvedSlidesDir = defaultDir;
      }

      // 입력 검증: slidePaths 경로 순회 공격 방지
      if (slidePaths) {
        if (!Array.isArray(slidePaths)) {
          return res.status(400).json({ success: false, error: 'slidePaths must be an array of strings' });
        }
        if (slidePaths.some((p: unknown) => typeof p !== 'string' || !String(p).trim() || String(p).includes('..'))) {
          return res.status(400).json({ success: false, error: 'Invalid path in slidePaths' });
        }
      }

      const node = getSlideToVideoNode();
      const result = await node.process({
        bookId,
        slidesDir: resolvedSlidesDir,
        slidePaths,
        style,
        episodeNumber,
        language: language || 'ko',
        narrationMode: narrationMode || 'vision',
        manualNarrations,
        visionModel,
        maxNarrationLength,
        videoConfig,
      });

      if (!result.success) {
        return res.status(500).json(result);
      }
      res.json(result);
    } catch (error) {
      logger.error({ error }, '[SlideToVideo] Failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/:bookId/import/slides
  router.post('/:bookId/import/slides', async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const { slidePaths, slideDir, episodeId, style } = req.body || {};

      if (!slidePaths && !slideDir) {
        return res.status(400).json({
          success: false, error: 'slidePaths (array) or slideDir (string) required',
          usage: {
            option1: '{ "slidePaths": ["/path/slide1.png", "/path/slide2.png"] }',
            option2: '{ "slideDir": "/path/to/slides_folder" }',
          },
        });
      }

      // 입력 검증: 경로 순회 공격 방지
      if (slidePaths) {
        if (!Array.isArray(slidePaths)) {
          return res.status(400).json({ success: false, error: 'slidePaths must be an array of strings' });
        }
        if (slidePaths.some((p: unknown) => typeof p !== 'string' || !p.trim() || p.includes('..'))) {
          return res.status(400).json({ success: false, error: 'Invalid path in slidePaths' });
        }
      }
      if (slideDir && (typeof slideDir !== 'string' || slideDir.includes('..'))) {
        return res.status(400).json({ success: false, error: 'Invalid slideDir path' });
      }

      const result = await getNotebookLMService().importSlides({ bookId, slidePaths, slideDir, episodeId, style });

      res.json({
        success: true, documentId: bookId, ...result,
        message: `${result.importedCount} slides imported to ${result.slidesDir}`,
        nextSteps: {
          step1: 'Slides saved. Use VEO or Ken Burns to generate video.',
          veoApi: `POST /api/books/episodes/${episodeId || '{episodeId}'}/generate-video`,
        },
      });
    } catch (error) {
      logger.error({ error }, '[Import/Slides] Failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
