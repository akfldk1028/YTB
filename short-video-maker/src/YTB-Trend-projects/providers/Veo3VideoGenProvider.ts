/**
 * Veo3VideoGenProvider
 * Google Veo3 text→video (기존 GoogleVeoAPI 래핑)
 *
 * 이미지 불필요 — 텍스트 프롬프트 → 비디오 직접 생성
 * 모델: veo-3.0-fast-generate-001
 * Duration: 6초 또는 8초 (API 제약)
 * 비용: ~$0.10/씬 (추정)
 */

import path from 'path';
import fs from 'fs-extra';
import { BaseVideoGenProvider } from './BaseVideoGenProvider';
import { VideoGenProvider } from '../types';
import type { VideoGenRequest, VideoGenResult } from '../types';
import { GoogleVeoAPI } from '../../short-creator/libraries/GoogleVeo';
import { OrientationEnum } from '../../types/shorts';
import { logger } from '../../config';

const COST_PER_SCENE = 0.10; // 추정

export class Veo3VideoGenProvider extends BaseVideoGenProvider {
  private veoApi: GoogleVeoAPI;
  private tempDirPath: string;

  constructor(
    apiKey: string,
    tempDirPath: string,
    veoModel?: "veo-2.0-generate-001" | "veo-3.0-generate-001" | "veo-3.0-fast-generate-001" | "veo-3.1-generate-preview",
  ) {
    super(apiKey);
    this.tempDirPath = tempDirPath;

    // Veo3 전용이므로 veo-2.0은 fast로 fallback
    const effectiveModel = veoModel === 'veo-2.0-generate-001'
      ? 'veo-3.0-fast-generate-001'
      : (veoModel || 'veo-3.0-fast-generate-001');

    this.veoApi = new GoogleVeoAPI(
      apiKey,
      '', // projectId not used for Gemini API
      'us-central1',
      effectiveModel,
    );
  }

  async generateVideo(request: VideoGenRequest): Promise<VideoGenResult> {
    const validationError = this.validateRequest(request);
    if (validationError) {
      return { success: false, provider: VideoGenProvider.VEO3_T2V, error: validationError };
    }

    try {
      const orientation = request.aspectRatio === '16:9'
        ? OrientationEnum.landscape
        : OrientationEnum.portrait;

      // Veo3 duration: 6 or 8
      const duration = request.duration <= 6 ? 6 : 8;

      const video = await this.veoApi.findVideo(
        [request.prompt],
        duration,
        [],
        orientation,
      );

      if (!video.url) {
        return {
          success: false,
          provider: VideoGenProvider.VEO3_T2V,
          error: 'Veo3 returned no video URL',
        };
      }

      // 다운로드
      const outputPath = path.join(this.tempDirPath, `veo3_trend_${Date.now()}.mp4`);
      await fs.ensureDir(this.tempDirPath);

      const response = await fetch(video.url);
      if (!response.ok) {
        throw new Error(`Failed to download Veo3 video: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(outputPath, buffer);

      logger.info({
        outputPath,
        sizeKB: Math.round(buffer.length / 1024),
        duration,
        cost: `$${COST_PER_SCENE.toFixed(2)}`,
      }, '[Veo3VideoGen] Video generated');

      return {
        success: true,
        videoPath: outputPath,
        provider: VideoGenProvider.VEO3_T2V,
        costEstimate: COST_PER_SCENE,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[Veo3VideoGen] Failed');
      return { success: false, provider: VideoGenProvider.VEO3_T2V, error: msg };
    }
  }
}
