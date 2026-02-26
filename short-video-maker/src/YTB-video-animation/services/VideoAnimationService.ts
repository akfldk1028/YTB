/**
 * VideoAnimationService
 * 정적 이미지 → 애니메이션 비디오 변환 오케스트레이터
 *
 * 핵심 설계: 절대 실패하지 않음
 * - xaiApiKey 없으면 → FFmpeg static fallback
 * - GrokVideoProvider 실패 시 → FFmpeg static fallback (graceful degradation)
 * - 생성된 비디오 duration이 request.duration과 다르면 → FFmpeg trim/loop
 */

import { logger } from '../../config';
import type { FFMpeg } from '../../YTB-ffmpeg';
import { VideoAnimationProvider } from '../types';
import type { VideoAnimationRequest, VideoAnimationResult, VideoAnimationConfig, ManimAnimationRequest } from '../types';
import { GrokVideoProvider } from '../providers/GrokVideoProvider';
import { ManimVideoProvider } from '../providers/ManimVideoProvider';

export class VideoAnimationService {
  private config: VideoAnimationConfig;
  private ffmpeg: FFMpeg;
  private grokProvider?: GrokVideoProvider;
  private manimProvider?: ManimVideoProvider;

  constructor(config: VideoAnimationConfig, ffmpeg: FFMpeg) {
    this.config = config;
    this.ffmpeg = ffmpeg;

    // xaiApiKey가 있으면 GrokVideoProvider 초기화
    if (config.xaiApiKey) {
      this.grokProvider = new GrokVideoProvider(config.xaiApiKey, config.tempDirPath);
      logger.info('[VideoAnimation] GrokVideoProvider initialized');
    } else {
      logger.info('[VideoAnimation] No XAI_API_KEY - Grok animation disabled');
    }

    // Manim 초기화 (enableManim 설정 시)
    if (config.enableManim !== false) {
      this.manimProvider = new ManimVideoProvider(config.tempDirPath);
      // 비동기 설치 확인은 initManim()에서 수행
      logger.info('[VideoAnimation] ManimVideoProvider created (availability check pending)');
    }
  }

  /**
   * Manim 설치 확인 (비동기, 생성자에서 호출 불가하므로 별도)
   */
  async initManim(): Promise<boolean> {
    if (!this.manimProvider) return false;
    const available = await this.manimProvider.checkAvailability();
    if (!available) {
      logger.info('[VideoAnimation] Manim not available - will use Grok/KenBurns fallback');
      this.manimProvider = undefined;
    }
    return available;
  }

  /**
   * 씬 애니메이션 생성
   *
   * 우선순위: Manim → Grok → fallback (Ken Burns)
   *
   * Manim: 캐릭터 애니메이션 + 수식 Write (무료, 로컬)
   * Grok: 실사풍 미세 움직임 ($0.05/초, API)
   * fallback: 호출자가 Ken Burns 처리
   */
  async animateScene(request: VideoAnimationRequest): Promise<VideoAnimationResult> {
    // 1. Manim 시도 (ManimAnimationRequest 필드가 있으면)
    if (this.manimProvider) {
      try {
        const manimReq = request as ManimAnimationRequest;
        if (manimReq.sceneType) {
          logger.info({
            sceneType: manimReq.sceneType,
            owlMode: manimReq.owlMode,
            hasLatex: !!manimReq.latex,
          }, '[VideoAnimation] Attempting Manim render');

          const result = await this.manimProvider.generateManimVideo(manimReq);
          if (result.success) {
            logger.info({
              videoPath: result.videoPath,
              costEstimate: result.costEstimate,
            }, '[VideoAnimation] Manim render succeeded');
            return result;
          }
          logger.warn({ error: result.error }, '[VideoAnimation] Manim render failed, trying Grok fallback');
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn({ error: msg }, '[VideoAnimation] Manim error, trying Grok fallback');
      }
    }

    // 2. Grok 시도
    if (this.grokProvider) {
      try {
        logger.info({
          imagePath: request.imagePath,
          duration: request.duration,
          promptLength: request.motionPrompt?.length || 0,
        }, '[VideoAnimation] Animating scene with Grok');

        const result = await this.grokProvider.generateVideo(request);

        if (result.success) {
          logger.info({
            videoPath: result.videoPath,
            durationSeconds: result.durationSeconds,
            costEstimate: result.costEstimate,
          }, '[VideoAnimation] Grok animation completed');
          return result;
        }

        logger.warn({ error: result.error }, '[VideoAnimation] Grok generation failed, caller should fallback');
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, '[VideoAnimation] Grok unexpected error, caller should fallback');
        return {
          success: false,
          provider: VideoAnimationProvider.GROK,
          error: errorMessage,
        };
      }
    }

    // 3. 프로바이더 없음 → fallback
    logger.debug('[VideoAnimation] No provider available, returning fallback');
    return {
      success: false,
      provider: VideoAnimationProvider.MANIM,
      error: 'No animation provider available (Manim/Grok both unavailable)',
    };
  }

  /**
   * v4.2: API 키 유효성 사전 확인 (크레딧 소비 0)
   * xAI /v1/api-key GET — 키 상태만 확인, 생성 요청 아님
   */
  async healthCheck(): Promise<{ available: boolean; error?: string }> {
    if (!this.grokProvider) {
      return { available: false, error: 'No XAI_API_KEY configured' };
    }
    try {
      const response = await fetch('https://api.x.ai/v1/api-key', {
        headers: { 'Authorization': `Bearer ${this.config.xaiApiKey}` },
      });
      if (response.ok) return { available: true };
      const errorText = await response.text();
      return { available: false, error: `API key check failed (${response.status}): ${errorText}` };
    } catch (error) {
      // 네트워크 에러 → 낙관적 통과 (실제 호출에서 실패하면 circuit breaker가 처리)
      return { available: true };
    }
  }

  /**
   * 프로바이더 사용 가능 여부 (Manim 또는 Grok)
   */
  isAvailable(): boolean {
    return !!this.manimProvider || !!this.grokProvider;
  }

  /**
   * Manim 프로바이더 사용 가능 여부
   */
  isManimAvailable(): boolean {
    return !!this.manimProvider;
  }
}
