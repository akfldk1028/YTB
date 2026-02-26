/**
 * Trend API Router v2.0
 * YouTube URL → 스타일 분석 → 새 교육 영상 생성
 * + 트렌드 발견 → 자동 파이프라인
 *
 * POST /api/trends/analyze          - YouTube URL → StyleDNA + TrendStyleProfile (영상 생성 X)
 * POST /api/trends/clone            - YouTube URL + content → 새 영상 생성
 * GET  /api/trends/profiles         - 저장된 스타일 프로필 목록
 * GET  /api/trends/profiles/:id     - 특정 프로필 상세
 * POST /api/trends/discover         - ★ 트렌드 발견 (전 플랫폼)
 * POST /api/trends/auto-clone       - ★ 전자동: 발견→분석→재창작→생성
 * POST /api/trends/extract-content  - ★ 영상 URL → ContentDNA 추출
 */

import { Router, Request, Response } from 'express';
import { VideoCloneService } from '../services/VideoCloneService';
import { TrendAggregatorService } from '../services/TrendAggregatorService';
import { AutoClonePipelineService } from '../services/AutoClonePipelineService';
import { GeminiVideoAnalyzerService } from '../services/GeminiVideoAnalyzerService';
import { YouTubeDownloaderService } from '../services/YouTubeDownloaderService';
import { Config, logger } from '../../config';
import { VideoGenProvider, TrendPlatform } from '../types';
import path from 'path';

export function createTrendRouter(): Router {
  const router = Router();
  const config = new Config();

  if (!config.googleGeminiApiKey) {
    logger.warn('[TrendRouter] GOOGLE_GEMINI_API_KEY not set — Trend API will not function');
  }

  // Lazy service initialization
  let cloneService: VideoCloneService | null = null;
  let aggregatorService: TrendAggregatorService | null = null;
  let autoCloneService: AutoClonePipelineService | null = null;

  function getCloneService(): VideoCloneService {
    if (!cloneService) cloneService = new VideoCloneService(config);
    return cloneService;
  }

  function getAggregator(): TrendAggregatorService {
    if (!aggregatorService) {
      const cacheDir = path.join(config.tempDirPath, 'trend-cache');
      aggregatorService = new TrendAggregatorService(config.googleGeminiApiKey || '', cacheDir);
    }
    return aggregatorService;
  }

  function getAutoClone(): AutoClonePipelineService {
    if (!autoCloneService) autoCloneService = new AutoClonePipelineService(config);
    return autoCloneService;
  }

  // ==================== 기존 v1.0 엔드포인트 ====================

  // POST /analyze — YouTube URL → StyleDNA + Profile
  router.post('/analyze', async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ success: false, error: 'url is required' });
      }

      logger.info({ url }, '[TrendAPI] /analyze request');
      const service = getCloneService();
      const result = await service.analyzeOnly(url);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }
      return res.json({ success: true, profile: result.profile });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[TrendAPI] /analyze error');
      return res.status(500).json({ success: false, error: msg });
    }
  });

  // POST /clone — YouTube URL + content → 새 영상 생성
  router.post('/clone', async (req: Request, res: Response) => {
    try {
      const { referenceUrl, content, provider, forceStyleProfile } = req.body;

      if (!referenceUrl && !forceStyleProfile) {
        return res.status(400).json({
          success: false,
          error: 'referenceUrl or forceStyleProfile is required',
        });
      }

      if (!content || !content.title || !content.hook || !Array.isArray(content.mainPoints) || !content.conclusion) {
        return res.status(400).json({
          success: false,
          error: 'content with title, hook, mainPoints[] (array), conclusion is required',
        });
      }

      let validProvider: VideoGenProvider | undefined;
      if (provider) {
        const validProviders = Object.values(VideoGenProvider);
        if (!validProviders.includes(provider)) {
          return res.status(400).json({
            success: false,
            error: `Invalid provider: ${provider}. Valid: ${validProviders.join(', ')}`,
          });
        }
        validProvider = provider as VideoGenProvider;
      }

      logger.info({
        referenceUrl, title: content.title,
        provider: validProvider || 'kenburns (default)', forceStyleProfile,
      }, '[TrendAPI] /clone request');

      const service = getCloneService();
      const result = await service.clone({
        referenceUrl: referenceUrl || '',
        content,
        provider: validProvider,
        forceStyleProfile,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }
      return res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[TrendAPI] /clone error');
      return res.status(500).json({ success: false, error: msg });
    }
  });

  // GET /profiles — 저장된 프로필 목록
  router.get('/profiles', async (_req: Request, res: Response) => {
    try {
      const service = getCloneService();
      const profiles = await service.getProfiles();
      return res.json({ success: true, profiles });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ success: false, error: msg });
    }
  });

  // GET /profiles/:id — 프로필 상세
  router.get('/profiles/:id', async (req: Request, res: Response) => {
    try {
      const service = getCloneService();
      const profile = await service.getProfile(req.params.id);
      if (!profile) {
        return res.status(404).json({ success: false, error: 'Profile not found' });
      }
      return res.json({ success: true, profile });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ success: false, error: msg });
    }
  });

  // ==================== v2.0 신규 엔드포인트 ====================

  // POST /discover — 트렌드 발견 (전 플랫폼)
  router.post('/discover', async (req: Request, res: Response) => {
    try {
      const { platforms, region, category, maxResults } = req.body;

      // platforms 검증
      let validPlatforms: TrendPlatform[] | undefined;
      if (platforms && Array.isArray(platforms)) {
        const allPlatforms = Object.values(TrendPlatform);
        validPlatforms = platforms.filter((p: string) => allPlatforms.includes(p as TrendPlatform)) as TrendPlatform[];
      }

      logger.info({ platforms: validPlatforms, region, category, maxResults }, '[TrendAPI] /discover request');

      const aggregator = getAggregator();
      const result = await aggregator.discover({
        platforms: validPlatforms,
        region: region || 'KR',
        category,
        maxResults: maxResults || 20,
      });

      return res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[TrendAPI] /discover error');
      return res.status(500).json({ success: false, error: msg });
    }
  });

  // POST /auto-clone — 전자동: 발견→분석→재창작→생성
  router.post('/auto-clone', async (req: Request, res: Response) => {
    try {
      const { trendKeyword, autoSelect, provider, targetLanguage, maxReferenceVideos, channelName } = req.body;

      if (!trendKeyword && !autoSelect) {
        return res.status(400).json({
          success: false,
          error: 'trendKeyword or autoSelect: true is required',
        });
      }

      // provider 검증
      let validProvider: VideoGenProvider | undefined;
      if (provider) {
        const validProviders = Object.values(VideoGenProvider);
        if (!validProviders.includes(provider)) {
          return res.status(400).json({
            success: false,
            error: `Invalid provider: ${provider}. Valid: ${validProviders.join(', ')}`,
          });
        }
        validProvider = provider as VideoGenProvider;
      }

      logger.info({
        trendKeyword, autoSelect,
        provider: validProvider || 'kenburns',
        targetLanguage: targetLanguage || 'ko',
      }, '[TrendAPI] /auto-clone request');

      const pipeline = getAutoClone();
      const result = await pipeline.run({
        trendKeyword,
        autoSelect,
        provider: validProvider,
        targetLanguage: targetLanguage || 'ko',
        maxReferenceVideos: maxReferenceVideos || 3,
        channelName,
      });

      if (!result.success) {
        return res.status(500).json(result);
      }
      return res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[TrendAPI] /auto-clone error');
      return res.status(500).json({ success: false, error: msg });
    }
  });

  // POST /extract-content — 영상 URL → ContentDNA 추출
  router.post('/extract-content', async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ success: false, error: 'url is required' });
      }

      logger.info({ url }, '[TrendAPI] /extract-content request');

      // Step 1: 다운로드
      const downloader = new YouTubeDownloaderService(config.tempDirPath);
      const downloadResult = await downloader.download({ url });

      if (!downloadResult.success || !downloadResult.videoPath) {
        return res.status(500).json({
          success: false,
          error: `Download failed: ${downloadResult.error}`,
        });
      }

      // Step 2: 풀 분석 (StyleDNA + ContentDNA)
      const analyzer = new GeminiVideoAnalyzerService(config.googleGeminiApiKey || '');
      const analysisResult = await analyzer.analyzeWithContent({
        videoPath: downloadResult.videoPath,
      });

      // 클린업
      downloader.cleanup();

      if (!analysisResult.success) {
        return res.status(500).json({
          success: false,
          error: `Analysis failed: ${analysisResult.error}`,
        });
      }

      return res.json({
        success: true,
        contentDNA: analysisResult.contentDNA,
        styleDNA: analysisResult.styleDNA,
        metadata: downloadResult.metadata,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[TrendAPI] /extract-content error');
      return res.status(500).json({ success: false, error: msg });
    }
  });

  return router;
}
