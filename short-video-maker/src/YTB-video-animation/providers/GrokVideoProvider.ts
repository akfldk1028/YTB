/**
 * GrokVideoProvider
 * xAI Grok Imagine API (grok-imagine-video) — 정적 이미지 → 1~15초 애니메이션 클립
 *
 * API (확인된 공식 REST):
 *   생성: POST https://api.x.ai/v1/videos/generations
 *   폴링: GET  https://api.x.ai/v1/videos/{request_id}
 *
 * 모델: grok-imagine-video
 * 가격: $0.05/초
 *
 * 패턴: GoogleVeoAPI (src/short-creator/libraries/GoogleVeo.ts) 참고
 * 재시도: 3회, 지수 백오프 (5s, 10s, 15s)
 */

import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../config';
import { BaseVideoProvider } from './BaseVideoProvider';
import { VideoAnimationProvider } from '../types';
import type { VideoAnimationRequest, VideoAnimationResult } from '../types';

const GROK_API_BASE = 'https://api.x.ai/v1';
const MODEL = 'grok-imagine-video';
const POLL_INTERVAL_MS = 10_000;    // 10초
const POLL_TIMEOUT_MS = 180_000;     // 3분
const MAX_RETRIES = 3;
const COST_PER_SECOND = 0.05;       // $0.05/초 (공식 가격)
const MAX_DURATION = 15;             // 공식 최대 15초

/** POST /v1/videos/generations 응답 */
interface GrokCreateResponse {
  request_id: string;
}

/** GET /v1/videos/{request_id} 응답 (완료 시) */
interface GrokPollResponse {
  video?: {
    url: string;
    duration: number;
  };
  model?: string;
  status?: string;
  error?: {
    message: string;
    code?: string;
  };
}

export class GrokVideoProvider extends BaseVideoProvider {
  private tempDirPath: string;

  constructor(apiKey: string, tempDirPath: string) {
    super(apiKey);
    this.tempDirPath = tempDirPath;
  }

  async generateVideo(request: VideoAnimationRequest): Promise<VideoAnimationResult> {
    // 유효성 검증
    const validationError = await this.validateRequest(request);
    if (validationError) {
      return {
        success: false,
        provider: VideoAnimationProvider.GROK,
        error: validationError,
      };
    }

    // 재시도 루프
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await this._generateVideoAttempt(request);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // v4.2: 429/크레딧 소진 → 재시도 무의미, 즉시 실패 반환
        const is429 = errorMessage.includes('(429)') || errorMessage.includes('credits') || errorMessage.includes('spending limit');
        if (is429) {
          logger.warn({ error: errorMessage }, '[GrokVideo] 429/credits exhausted — skip retries');
          return {
            success: false,
            provider: VideoAnimationProvider.GROK,
            error: errorMessage,
          };
        }

        const isLastAttempt = attempt >= MAX_RETRIES - 1;

        if (isLastAttempt) {
          logger.error({ error: errorMessage, attempt, maxRetries: MAX_RETRIES }, '[GrokVideo] All retries exhausted');
          return {
            success: false,
            provider: VideoAnimationProvider.GROK,
            error: `Grok API failed after ${MAX_RETRIES} attempts: ${errorMessage}`,
          };
        }

        const waitTime = 5000 * (attempt + 1); // 5s, 10s, 15s
        logger.warn({ error: errorMessage, attempt, waitTime }, `[GrokVideo] Attempt ${attempt + 1} failed, retrying in ${waitTime / 1000}s`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // 여기 도달 안 함 (for 루프에서 반드시 return)
    return {
      success: false,
      provider: VideoAnimationProvider.GROK,
      error: 'Unexpected error',
    };
  }

  private async _generateVideoAttempt(request: VideoAnimationRequest): Promise<VideoAnimationResult> {
    // 이미지를 base64로 읽기
    const imageBuffer = await fs.readFile(request.imagePath);
    const ext = path.extname(request.imagePath).toLowerCase();
    const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    // Grok API는 duration을 integer(i32)만 허용 — 반올림 필수
    const clampedDuration = Math.round(Math.min(Math.max(request.duration, 1), MAX_DURATION));

    // 비디오 생성 요청
    logger.info({
      model: MODEL,
      imagePath: request.imagePath,
      duration: clampedDuration,
      promptLength: request.motionPrompt.length,
      aspectRatio: request.aspectRatio || '9:16',
    }, '[GrokVideo] Starting video generation');

    const requestBody = {
      model: MODEL,
      prompt: request.motionPrompt,
      image_url: dataUrl,
      duration: clampedDuration,
      aspect_ratio: request.aspectRatio || '9:16',
      resolution: request.resolution || '720p',
    };

    const createResponse = await fetch(`${GROK_API_BASE}/videos/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Grok API creation failed (${createResponse.status}): ${errorText}`);
    }

    const createResult = await createResponse.json() as GrokCreateResponse;
    const requestId = createResult.request_id;

    if (!requestId) {
      throw new Error('No request_id returned from Grok API');
    }

    logger.info({ requestId }, '[GrokVideo] Polling for completion');

    // 폴링
    const startTime = Date.now();
    let pollCount = 0;

    while (true) {
      const elapsed = Date.now() - startTime;
      if (elapsed > POLL_TIMEOUT_MS) {
        throw new Error(`Grok video generation timed out after ${Math.round(elapsed / 1000)}s`);
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      pollCount++;

      const pollResponse = await fetch(`${GROK_API_BASE}/videos/${requestId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!pollResponse.ok) {
        logger.warn({ status: pollResponse.status, pollCount }, '[GrokVideo] Poll request failed, retrying');
        continue;
      }

      const pollResult = await pollResponse.json() as GrokPollResponse;

      logger.debug({
        requestId,
        hasVideo: !!pollResult.video,
        status: pollResult.status,
        pollCount,
        elapsedSeconds: Math.round(elapsed / 1000),
      }, `[GrokVideo] Poll #${pollCount}`);

      if (pollResult.error) {
        throw new Error(`Grok video generation failed: ${pollResult.error.message}`);
      }

      if (pollResult.video?.url) {
        const totalSeconds = Math.round((Date.now() - startTime) / 1000);
        const actualDuration = pollResult.video.duration || clampedDuration;
        logger.info({ requestId, totalSeconds, pollCount, actualDuration }, '[GrokVideo] Generation completed');
        return await this._downloadAndSaveVideo(pollResult.video.url, actualDuration, clampedDuration);
      }
    }
  }

  private async _downloadAndSaveVideo(
    videoUrl: string,
    actualDuration: number,
    requestedDuration: number,
  ): Promise<VideoAnimationResult> {
    // 비디오 다운로드 → temp 파일 저장
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }

    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    const outputPath = path.join(
      this.tempDirPath,
      `grok_anim_${Date.now()}.mp4`
    );

    await fs.ensureDir(this.tempDirPath);
    await fs.writeFile(outputPath, videoBuffer);

    const costEstimate = COST_PER_SECOND * requestedDuration;

    logger.info({
      outputPath,
      sizeKB: Math.round(videoBuffer.length / 1024),
      actualDuration,
      costEstimate: `$${costEstimate.toFixed(2)}`,
    }, '[GrokVideo] Video saved');

    return {
      success: true,
      videoPath: outputPath,
      provider: VideoAnimationProvider.GROK,
      durationSeconds: actualDuration,
      costEstimate,
    };
  }
}
