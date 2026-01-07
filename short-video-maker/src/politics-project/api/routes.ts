/**
 * PoliticsProject API Routes
 *
 * YouTube to Shorts 변환 API 엔드포인트
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import path from 'path';
import { logger } from '../../logger';
import { YouTubeToShortsWorkflow } from '../workflow';
import { APIRequest, APIResponse, WorkflowResult } from './types';

const router: RouterType = Router();

// Job 저장소 (실제로는 Redis/DB 사용 권장)
const jobs = new Map<string, WorkflowResult>();

// 기본 출력 디렉토리
const OUTPUT_BASE = process.env.POLITICS_OUTPUT_DIR || './output/politics';

/**
 * POST /api/politics/convert
 *
 * YouTube 영상을 Shorts로 변환
 */
router.post('/convert', async (req: Request, res: Response) => {
  try {
    const body = req.body as APIRequest;

    // youtubeUrl 또는 youtubeUrls 중 하나는 필수
    if (!body.youtubeUrl && (!body.youtubeUrls || body.youtubeUrls.length === 0)) {
      return res.status(400).json({
        jobId: '',
        status: 'failed',
        message: 'youtubeUrl or youtubeUrls is required'
      } as APIResponse);
    }

    const urlCount = body.youtubeUrls?.length || 1;
    logger.info({
      youtubeUrl: body.youtubeUrl,
      youtubeUrls: body.youtubeUrls,
      urlCount
    }, 'Convert API 호출');

    const workflow = new YouTubeToShortsWorkflow(OUTPUT_BASE);

    // 비동기 실행 (즉시 응답)
    const promise = workflow.run({
      youtubeUrl: body.youtubeUrl,
      youtubeUrls: body.youtubeUrls,
      options: body.options
    });

    // 임시 jobId 생성하여 즉시 응답
    const tempJobId = `pending-${Date.now()}`;

    promise.then(result => {
      jobs.set(result.jobId, result);
      logger.info({ jobId: result.jobId }, 'Job 완료');

      // 콜백 호출 (있는 경우)
      if (body.callbackUrl) {
        callCallback(body.callbackUrl, result);
      }
    });

    // 동기 실행 모드 (옵션)
    if (body.options && (body.options as unknown as { sync?: boolean }).sync) {
      const result = await promise;
      jobs.set(result.jobId, result);

      return res.json({
        jobId: result.jobId,
        status: result.status,
        message: result.error || 'Completed',
        outputs: result.outputs
      } as APIResponse);
    }

    return res.status(202).json({
      jobId: tempJobId,
      status: 'pending',
      message: 'Job started. Use /status/:jobId to check progress.'
    } as APIResponse);

  } catch (error) {
    logger.error({ error }, 'Convert API 에러');

    return res.status(500).json({
      jobId: '',
      status: 'failed',
      message: error instanceof Error ? error.message : 'Internal error'
    } as APIResponse);
  }
});

/**
 * GET /api/politics/status/:jobId
 *
 * 작업 상태 조회
 */
router.get('/status/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      jobId,
      status: 'failed',
      message: 'Job not found'
    } as APIResponse);
  }

  return res.json({
    jobId: job.jobId,
    status: job.status,
    message: job.error || 'OK',
    outputs: job.outputs
  } as APIResponse);
});

/**
 * GET /api/politics/health
 *
 * 헬스체크
 */
router.get('/health', (_req: Request, res: Response) => {
  return res.json({
    status: 'ok',
    module: 'politics-project',
    timestamp: new Date().toISOString()
  });
});

/**
 * 콜백 URL 호출
 */
async function callCallback(url: string, result: WorkflowResult): Promise<void> {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    });

    logger.info({ url, jobId: result.jobId }, '콜백 호출 완료');
  } catch (error) {
    logger.error({ error, url }, '콜백 호출 실패');
  }
}

export { router as politicsRouter };
