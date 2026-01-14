/**
 * News Project API Routes
 *
 * n8n에서 호출하는 뉴스 숏츠 생성 API
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../logger';
import { Config } from '../config';
import { NewsProjectService } from './NewsProjectService';
import { GoogleCloudStorageService } from '../storage/GoogleCloudStorageService';
import type {
  NewsPayload,
  CreateNewsVideoResponse,
  NewsVideoStatusResponse,
} from './types';

const router: RouterType = Router();

// 서비스 인스턴스 (지연 초기화)
let newsProjectService: NewsProjectService | null = null;

/**
 * 서비스 초기화 (지연 로딩)
 */
function getService(): NewsProjectService {
  if (!newsProjectService) {
    newsProjectService = new NewsProjectService();
    logger.info('[NewsProject] 서비스 인스턴스 생성');
  }
  return newsProjectService;
}

/**
 * 요청 검증 스키마 (필수 필드만)
 */
const NewsPayloadSchema = z.object({
  workflow_version: z.string(),
  channel: z.object({
    name: z.string(),
    display_name: z.string(),
  }),
  global_config: z.object({
    // 🔥 이미지 생성 모드 (n8n에서 제어)
    image_generation: z.enum(['pexels_stock', 'nanoBanana', 'hybrid']).optional(),
    audio: z.object({
      voice: z.string(),
      tts_provider: z.enum(['elevenlabs', 'google', 'gemini']).optional(),
    }),
    video: z.object({
      orientation: z.enum(['portrait', 'landscape']),
    }),
    nanoBanana: z.object({
      defaultStyle: z.string().optional(),
    }).optional(),
  }),
  videos: z.array(z.object({
    video_id: z.string(),
    title: z.string(),
    scenes: z.array(z.object({
      scene_id: z.number(),
      scene_type: z.enum(['intro', 'news', 'outro']).optional(),  // 🔥 씬 타입
      narration: z.string(),
      image_prompt: z.string(),
      duration: z.number(),
      text_overlay: z.string().optional(),  // 🔥 화면 텍스트
    })).min(1),
  })).min(1),
});

/**
 * POST /api/news/create
 *
 * 뉴스 숏츠 생성 요청 (n8n에서 호출)
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    // n8n은 배열로 보낼 수 있음
    const rawPayload = Array.isArray(req.body) ? req.body[0] : req.body;

    // 요청 검증
    const validationResult = NewsPayloadSchema.safeParse(rawPayload);
    if (!validationResult.success) {
      logger.warn({ errors: validationResult.error.errors }, '[NewsRouter] 유효하지 않은 요청');
      return res.status(400).json({
        success: false,
        error: 'Invalid request payload',
        details: validationResult.error.errors,
      });
    }

    const payload = validationResult.data as NewsPayload;

    logger.info({
      channel: payload.channel.name,
      videoId: payload.videos[0].video_id,
      sceneCount: payload.videos[0].scenes.length,
    }, '[NewsRouter] 뉴스 생성 요청');

    // 서비스 호출
    const service = getService();
    const result = await service.createVideo(payload);

    const response: CreateNewsVideoResponse = {
      success: true,
      videoId: result.videoId,
      status: result.status,
      message: '뉴스 비디오 생성이 시작되었습니다.',
    };

    return res.status(202).json(response);
  } catch (error) {
    logger.error({ error }, '[NewsRouter] 생성 요청 실패');
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/news/status/:videoId
 *
 * 비디오 생성 상태 조회
 */
router.get('/status/:videoId', async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;

    const service = getService();
    const state = service.getStatus(videoId);

    if (!state) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
      });
    }

    const response: NewsVideoStatusResponse = {
      videoId: state.videoId,
      status: state.status,
      progress: state.progress,
      result: state.result,
      error: state.error,
    };

    return res.json(response);
  } catch (error) {
    logger.error({ error }, '[NewsRouter] 상태 조회 실패');
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/news/download/:videoId
 *
 * 비디오 다운로드 (로컬 파일 우선, 없으면 GCS fallback)
 */
router.get('/download/:videoId', async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    const config = new Config();

    const videoPath = path.join(config.videosDirPath, `${videoId}.mp4`);

    // 1. 로컬 파일이 있으면 직접 다운로드
    if (await fs.pathExists(videoPath)) {
      logger.info({ videoId, videoPath }, '[NewsRouter] 로컬 파일 다운로드');
      return res.download(videoPath, `${videoId}.mp4`, (err) => {
        if (err) {
          logger.error({ error: err }, '[NewsRouter] 다운로드 실패');
        }
      });
    }

    // 2. 로컬에 없으면 GCS에서 signed URL 생성
    logger.info({ videoId }, '[NewsRouter] 로컬 파일 없음 - GCS fallback 시도');

    try {
      const gcsService = new GoogleCloudStorageService(config);
      const gcsPath = `videos/${videoId}.mp4`;

      // GCS에 파일이 있는지 먼저 확인
      const exists = await gcsService.videoExists(videoId);
      if (!exists) {
        logger.warn({ videoId, gcsPath }, '[NewsRouter] GCS에도 파일 없음');
        return res.status(404).json({
          success: false,
          error: 'Video not found in GCS',
        });
      }

      // signed URL 생성 (24시간 유효)
      const signedUrl = await gcsService.generateSignedUrl(gcsPath, {
        action: 'read',
        expires: 24 * 60 * 60 * 1000, // 24시간 (밀리초)
      });

      logger.info({ videoId, gcsPath }, '[NewsRouter] GCS signed URL로 리다이렉트');
      return res.redirect(signedUrl);
    } catch (gcsError) {
      logger.warn({ videoId, error: gcsError }, '[NewsRouter] GCS fallback 실패');
    }

    // 3. 둘 다 없으면 404
    return res.status(404).json({
      success: false,
      error: 'Video not found (neither local nor GCS)',
    });
  } catch (error) {
    logger.error({ error }, '[NewsRouter] 다운로드 에러');
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/news/health
 *
 * 헬스 체크
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'news-project',
    timestamp: new Date().toISOString(),
  });
});

export { router as newsRouter };
