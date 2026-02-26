/**
 * BaseVideoGenProvider
 * text/prompt 기반 비디오 생성 프로바이더 추상 베이스
 *
 * 기존 BaseVideoProvider (YTB-video-animation)와 달리 image 대신 text/prompt 기반
 */

import type { VideoGenRequest, VideoGenResult } from '../types';

export abstract class BaseVideoGenProvider {
  protected apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  abstract generateVideo(request: VideoGenRequest): Promise<VideoGenResult>;

  protected validateRequest(request: VideoGenRequest): string | null {
    if (!request.prompt || request.prompt.trim().length === 0) {
      return 'prompt is required';
    }
    if (request.duration < 1 || request.duration > 30) {
      return `Duration must be between 1 and 30 seconds, got: ${request.duration}`;
    }
    return null;
  }
}
