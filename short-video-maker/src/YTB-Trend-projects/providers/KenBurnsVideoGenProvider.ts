/**
 * KenBurnsVideoGenProvider
 * FFmpeg zoompan 기반 Ken Burns 이펙트 — 무료 ($0)
 *
 * 2단계:
 *   1. NanoBanana로 이미지 생성 (GhibliImageService 재사용)
 *   2. FFmpeg createKenBurnsVideoFromImage()
 *
 * 비용: ~$0.02 (이미지) + $0 (FFmpeg) = 최저 비용
 */

import path from 'path';
import fs from 'fs-extra';
import { BaseVideoGenProvider } from './BaseVideoGenProvider';
import { VideoGenProvider } from '../types';
import type { VideoGenRequest, VideoGenResult } from '../types';
import { VideoEditor } from '../../YTB-ffmpeg/VideoEditor';
import { logger } from '../../config';

const KEN_BURNS_EFFECTS = ['zoom_in', 'zoom_out', 'pan_right', 'pan_left'] as const;
type KenBurnsEffect = typeof KEN_BURNS_EFFECTS[number];

export class KenBurnsVideoGenProvider extends BaseVideoGenProvider {
  private tempDirPath: string;
  private videoEditor: VideoEditor;
  private defaultEffect?: KenBurnsEffect;
  private effectCounter = 0;

  constructor(tempDirPath: string, motionStyle?: string) {
    super(''); // no API key needed
    this.tempDirPath = tempDirPath;
    this.videoEditor = new VideoEditor();

    // motionStyle이 유효한 Ken Burns 이펙트면 사용, 아니면 순환
    if (motionStyle && KEN_BURNS_EFFECTS.includes(motionStyle as KenBurnsEffect)) {
      this.defaultEffect = motionStyle as KenBurnsEffect;
    }
  }

  async generateVideo(request: VideoGenRequest): Promise<VideoGenResult> {
    const validationError = this.validateRequest(request);
    if (validationError) {
      return { success: false, provider: VideoGenProvider.KENBURNS, error: validationError };
    }

    if (!request.imagePath) {
      return { success: false, provider: VideoGenProvider.KENBURNS, error: 'imagePath is required for Ken Burns' };
    }

    const exists = await fs.pathExists(request.imagePath);
    if (!exists) {
      return { success: false, provider: VideoGenProvider.KENBURNS, error: `Image not found: ${request.imagePath}` };
    }

    try {
      const outputPath = path.join(this.tempDirPath, `kb_trend_${Date.now()}.mp4`);
      await fs.ensureDir(this.tempDirPath);

      // styleHint 또는 defaultEffect 사용, 없으면 순환
      let effect: KenBurnsEffect;
      const hint = request.styleHint;
      if (hint && KEN_BURNS_EFFECTS.includes(hint as KenBurnsEffect)) {
        effect = hint as KenBurnsEffect;
      } else if (this.defaultEffect) {
        effect = this.defaultEffect;
      } else {
        effect = KEN_BURNS_EFFECTS[this.effectCounter % KEN_BURNS_EFFECTS.length];
        this.effectCounter++;
      }

      const dimensions = request.aspectRatio === '16:9' ? '1920x1080' : '1080x1920';

      await this.videoEditor.createKenBurnsVideoFromImage(
        request.imagePath,
        outputPath,
        request.duration,
        dimensions,
        effect,
      );

      logger.info({ outputPath, effect, duration: request.duration }, '[KenBurns] Video generated (free)');

      return {
        success: true,
        videoPath: outputPath,
        provider: VideoGenProvider.KENBURNS,
        costEstimate: 0,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[KenBurns] Failed');
      return { success: false, provider: VideoGenProvider.KENBURNS, error: msg };
    }
  }
}
