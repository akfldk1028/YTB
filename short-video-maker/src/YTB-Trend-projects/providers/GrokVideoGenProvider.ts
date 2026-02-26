/**
 * GrokVideoGenProvider
 * Grok image→video 래핑 (기존 GrokVideoProvider 재사용)
 *
 * 2단계: 이미지 필요 → Grok 애니메이션
 * 비용: $0.05/초 per scene
 */

import { BaseVideoGenProvider } from './BaseVideoGenProvider';
import { VideoGenProvider } from '../types';
import type { VideoGenRequest, VideoGenResult } from '../types';
import { GrokVideoProvider } from '../../YTB-video-animation/providers/GrokVideoProvider';
import { logger } from '../../config';

const COST_PER_SECOND = 0.05;

export class GrokVideoGenProvider extends BaseVideoGenProvider {
  private grokProvider: GrokVideoProvider;

  constructor(apiKey: string, tempDirPath: string) {
    super(apiKey);
    this.grokProvider = new GrokVideoProvider(apiKey, tempDirPath);
  }

  async generateVideo(request: VideoGenRequest): Promise<VideoGenResult> {
    const validationError = this.validateRequest(request);
    if (validationError) {
      return { success: false, provider: VideoGenProvider.GROK_IMG2V, error: validationError };
    }

    if (!request.imagePath) {
      return {
        success: false,
        provider: VideoGenProvider.GROK_IMG2V,
        error: 'imagePath is required for Grok image-to-video',
      };
    }

    try {
      const result = await this.grokProvider.generateVideo({
        imagePath: request.imagePath,
        duration: request.duration,
        motionPrompt: request.prompt,
        aspectRatio: (request.aspectRatio as '9:16' | '16:9') || '9:16',
      });

      if (!result.success) {
        return {
          success: false,
          provider: VideoGenProvider.GROK_IMG2V,
          error: result.error || 'Grok generation failed',
        };
      }

      const costEstimate = COST_PER_SECOND * request.duration;

      logger.info({
        videoPath: result.videoPath,
        duration: request.duration,
        cost: `$${costEstimate.toFixed(2)}`,
      }, '[GrokVideoGen] Video generated');

      return {
        success: true,
        videoPath: result.videoPath,
        provider: VideoGenProvider.GROK_IMG2V,
        costEstimate,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[GrokVideoGen] Failed');
      return { success: false, provider: VideoGenProvider.GROK_IMG2V, error: msg };
    }
  }
}
