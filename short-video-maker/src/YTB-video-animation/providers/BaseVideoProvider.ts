/**
 * BaseVideoProvider
 * 비디오 애니메이션 프로바이더 추상 베이스 클래스
 *
 * 패턴: GoogleVeoAPI (src/short-creator/libraries/GoogleVeo.ts) 참고
 */

import fs from 'fs-extra';
import { logger } from '../../config';
import type { VideoAnimationRequest, VideoAnimationResult } from '../types';

export abstract class BaseVideoProvider {
  protected apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 비디오 생성 (하위 클래스에서 구현)
   */
  abstract generateVideo(request: VideoAnimationRequest): Promise<VideoAnimationResult>;

  /**
   * 요청 유효성 검증
   */
  protected async validateRequest(request: VideoAnimationRequest): Promise<string | null> {
    // imagePath 존재 확인
    if (!request.imagePath) {
      return 'imagePath is required';
    }
    const exists = await fs.pathExists(request.imagePath);
    if (!exists) {
      return `Image file not found: ${request.imagePath}`;
    }

    // duration 범위 체크 (1~30초)
    if (request.duration < 1 || request.duration > 30) {
      return `Duration must be between 1 and 30 seconds, got: ${request.duration}`;
    }

    // motionPrompt 필수
    if (!request.motionPrompt || request.motionPrompt.trim().length === 0) {
      return 'motionPrompt is required';
    }

    return null;
  }
}
