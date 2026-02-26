/**
 * VeoInterpolationNode — VEO 3.1 Frame Interpolation n8n 노드
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ v11.0 VEO 파이프라인 전체 흐름 (이 파일은 Step 4)       │
 * │                                                         │
 * │ Step 1: BooksRouter                                     │
 * │   API { useVeo: true } → config.useVeo 설정             │
 * │                                                         │
 * │ Step 2: ContentPlannerService (커리큘럼 생성 시)         │
 * │   useVeoInterpolation=true → AI가 씬별                  │
 * │   firstFramePrompt / lastFramePrompt 생성               │
 * │   (없으면 visualDesc로 fallback — 품질 다소 저하)       │
 * │                                                         │
 * │ Step 3: EpisodeOrchestrator.generateEpisodeVideo()      │
 * │   useVeo=true → generateKeyframePairs() 호출            │
 * │   씬당 2장 이미지(first+last) 생성 via SceneImageService│
 * │   결과: imagePaths[] + keyframePairs[] 반환              │
 * │                                                         │
 * │ Step 4: VeoInterpolationNode.interpolate() ← 이 파일    │
 * │   firstFrame + lastFrame → VEO 3.1 API → 8초 보간 비디오│
 * │   VIDEO_SOURCE=runway → RunwayAPI 경유 (결제 중)        │
 * │   VIDEO_SOURCE=veo → GoogleVeoAPI 직접 호출             │
 * │   실패 시 Ken Burns fallback (BooksVideoService에서 처리)│
 * │                                                         │
 * │ Step 5: BooksVideoService.createShortVideo()            │
 * │   VEO 비디오를 씬 duration에 맞춰 트리밍                │
 * │   → concat → TTS + 자막 합성 → 최종 영상               │
 * └─────────────────────────────────────────────────────────┘
 *
 * n8n 패턴: VeoInterpolationInput → interpolate() → VeoInterpolationOutput
 *
 * 핵심 동작:
 * - config.videoSource에 따라 RunwayAPI 또는 GoogleVeoAPI 사용
 * - VIDEO_SOURCE=runway + RUNWAY_MODEL=veo3.1 → Runway 경유 VEO 3.1 (결제 중)
 * - VIDEO_SOURCE=veo → Google Gemini API 직접 호출
 * - VEO 3.1은 duration=8초 고정 출력
 * - 출력 비디오를 로컬 temp 파일로 다운로드
 * - 호출자(BooksVideoService)가 trimAndResizeVideo()로 씬 길이에 맞춤
 *
 * Fallback 체인: VEO 3.1 → Ken Burns (BooksVideoService Step 2에서 처리)
 *
 * @version 11.1.0
 */

import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../../config';
import { Config } from '../../../config';
import { GoogleVeoAPI } from '../../../short-creator/libraries/GoogleVeo';
import { RunwayAPI } from '../../../short-creator/libraries/RunwayAPI';
import { OrientationEnum } from '../../../types/shorts';
import { BOOKS_PROJECT_CONFIG } from './BooksVideoService';

// ============================================
// Input / Output Interfaces
// ============================================

export interface VeoInterpolationInput {
  /** 시작 키프레임 이미지 Buffer */
  firstFrameBuffer: Buffer;
  /** 종료 키프레임 이미지 Buffer */
  lastFrameBuffer: Buffer;
  /** 이미지 MIME 타입 */
  mimeType: string;
  /** 씬 전환 설명 (모션 프롬프트) */
  motionPrompt: string;
  /** TTS 기반 씬 길이 (초) — VEO 출력(8초)에서 트리밍할 목표 길이 */
  targetDuration: number;
  /** 영상 방향 */
  orientation: 'portrait' | 'landscape';
  /** 스타일 프로파일의 VEO 모션 힌트 (optional) */
  veoMotionHint?: string;
}

export interface VeoInterpolationOutput {
  success: boolean;
  /** 생성된 비디오 파일 경로 */
  videoPath?: string;
  /** VEO 출력 실제 길이 (8초 고정) */
  actualDuration?: number;
  /** targetDuration으로 트리밍 필요 여부 */
  needsTrimming?: boolean;
  /** 비용 추정 ($) */
  costEstimate?: number;
  /** 에러 메시지 */
  error?: string;
}

// ============================================
// Shared interface for both APIs
// ============================================

interface VideoAPI {
  supportsFrameInterpolation(): boolean;
  findVideo(
    searchTerms: string[],
    minDurationSeconds: number,
    excludeIds: string[],
    orientation: OrientationEnum,
    timeout: number,
    retryCounter: number,
    initialImage?: { data: string; mimeType: string },
    lastImage?: { data: string; mimeType: string }
  ): Promise<{ id: string; url: string; width: number; height: number }>;
}

// ============================================
// Node Implementation
// ============================================

export class VeoInterpolationNode {
  private videoApi: VideoAPI | null = null;
  private config: Config;

  constructor(config?: Config) {
    this.config = config || new Config();
  }

  /**
   * Video API 초기화 (lazy)
   * config.videoSource에 따라 RunwayAPI 또는 GoogleVeoAPI 선택
   */
  private ensureVideoApi(): VideoAPI {
    if (this.videoApi) return this.videoApi;

    const useRunway = this.config.videoSource === 'runway';

    if (useRunway) {
      // Runway 경유 VEO 3.1 (결제 중)
      const apiKey = this.config.runwayApiKey;
      if (!apiKey) {
        throw new Error('RUNWAY_API_KEY is required when VIDEO_SOURCE=runway');
      }

      this.videoApi = new RunwayAPI(
        apiKey,
        this.config.runwayModel, // 'veo3.1'
        this.config.runwayVeoAudio
      );

      logger.info({
        provider: 'runway',
        model: this.config.runwayModel,
        supportsInterpolation: this.videoApi.supportsFrameInterpolation()
      }, '[VeoInterpolationNode] Initialized with Runway API');
    } else {
      // Google Gemini API 직접
      const apiKey = this.config.googleGeminiApiKey;
      if (!apiKey) {
        throw new Error('GOOGLE_GEMINI_API_KEY is required for VEO 3.1 Frame Interpolation');
      }

      this.videoApi = new GoogleVeoAPI(
        apiKey,
        '', // projectId (unused in Gemini API)
        'us-central1', // region (unused in Gemini API)
        BOOKS_PROJECT_CONFIG.veoModel
      );

      logger.info({
        provider: 'google',
        model: BOOKS_PROJECT_CONFIG.veoModel,
        supportsInterpolation: this.videoApi.supportsFrameInterpolation()
      }, '[VeoInterpolationNode] Initialized with Google VEO API');
    }

    return this.videoApi;
  }

  /**
   * 키프레임 쌍 → VEO 3.1 → 보간 비디오 생성
   *
   * @param input VeoInterpolationInput
   * @returns VeoInterpolationOutput
   */
  async interpolate(input: VeoInterpolationInput): Promise<VeoInterpolationOutput> {
    const {
      firstFrameBuffer,
      lastFrameBuffer,
      mimeType,
      motionPrompt,
      targetDuration,
      orientation,
      veoMotionHint
    } = input;

    const provider = this.config.videoSource === 'runway' ? 'Runway' : 'Google';

    logger.info({
      provider,
      firstFrameSize: firstFrameBuffer.length,
      lastFrameSize: lastFrameBuffer.length,
      mimeType,
      targetDuration,
      orientation,
      motionPromptPreview: motionPrompt.substring(0, 80)
    }, `[VeoInterpolationNode] Starting frame interpolation via ${provider}`);

    try {
      const videoApi = this.ensureVideoApi();

      if (!videoApi.supportsFrameInterpolation()) {
        return {
          success: false,
          error: `Provider ${provider} does not support frame interpolation`
        };
      }

      // Prepare image data
      const firstFrameData = {
        data: firstFrameBuffer.toString('base64'),
        mimeType
      };
      const lastFrameData = {
        data: lastFrameBuffer.toString('base64'),
        mimeType
      };

      // Build motion prompt with style hint
      const fullMotionPrompt = veoMotionHint
        ? `${motionPrompt}. ${veoMotionHint}`
        : motionPrompt;

      const orientationEnum = orientation === 'portrait'
        ? OrientationEnum.portrait
        : OrientationEnum.landscape;

      // VEO 3.1 Frame Interpolation — duration=8 forced by API
      const video = await videoApi.findVideo(
        [fullMotionPrompt],
        8, // VEO 3.1 interpolation requires duration=8
        [],
        orientationEnum,
        120000, // 2 minute timeout
        0,
        firstFrameData,
        lastFrameData
      );

      if (!video || !video.url) {
        return {
          success: false,
          error: `${provider} VEO 3.1 returned no video`
        };
      }

      // Download VEO output video
      const tempDir = path.join(this.config.tempDirPath, `veo_interpolation_${Date.now()}`);
      await fs.ensureDir(tempDir);
      const videoPath = path.join(tempDir, 'veo_output.mp4');

      const response = await fetch(video.url);
      if (!response.ok) {
        return {
          success: false,
          error: `Failed to download VEO video: ${response.status}`
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(videoPath, buffer);

      logger.info({
        provider,
        videoPath,
        videoSize: buffer.length,
        actualDuration: 8,
        targetDuration,
        needsTrimming: targetDuration < 8
      }, `[VeoInterpolationNode] VEO video downloaded via ${provider}`);

      return {
        success: true,
        videoPath,
        actualDuration: 8,
        needsTrimming: targetDuration < 8,
        costEstimate: 0.15 // estimated VEO 3.1 cost per interpolation
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, provider }, '[VeoInterpolationNode] Frame interpolation failed');

      return {
        success: false,
        error: errorMessage
      };
    }
  }
}

// ============================================
// Factory
// ============================================

let nodeInstance: VeoInterpolationNode | null = null;

export function getVeoInterpolationNode(): VeoInterpolationNode {
  if (!nodeInstance) {
    nodeInstance = new VeoInterpolationNode();
  }
  return nodeInstance;
}
