/**
 * YTB News Project - 타입 정의
 *
 * 원칙: 실제 사용하는 필드만 정의
 * 기존 타입은 import해서 재사용
 */

// 🔥 기존 타입 import (재사용)
import type { Caption } from '../types/shorts';
export type { Caption };

// ============================================
// 1. n8n 입력 (finalNode.json) - 사용하는 필드만
// ============================================

/**
 * News 씬
 */
export interface NewsScene {
  scene_id: number;
  scene_type?: 'intro' | 'news' | 'outro';
  narration: string;       // TTS 텍스트
  image_prompt: string;    // 이미지 생성 프롬프트
  duration: number;        // 예상 길이
  text_overlay?: string;   // 화면 텍스트
}

/**
 * News 비디오
 */
export interface NewsVideo {
  video_id: string;
  title: string;
  theme?: string;
  scenes: NewsScene[];
  source_news?: Array<{ title: string; link: string; rank: number }>;
  youtube?: {
    finalTitle: string;
    finalHashtags: string[];
    defaultPrivacy: string;
  };
}

/**
 * 이미지 생성 모드
 * - 'pexels_stock': Pexels 스톡 이미지만 사용 (실패시 에러)
 * - 'nanoBanana': AI 생성만 사용 (기존 방식)
 * - 'hybrid': Pexels 우선, 실패시 AI fallback (권장)
 */
export type ImageGenerationMode = 'pexels_stock' | 'nanoBanana' | 'hybrid';

/**
 * n8n 페이로드 (핵심만)
 */
export interface NewsPayload {
  workflow_version: string;
  channel: {
    name: string;
    display_name: string;
  };
  global_config: {
    // 🔥 이미지 생성 모드 (n8n에서 제어 가능)
    image_generation?: ImageGenerationMode;
    audio: {
      voice: string;
      tts_provider?: 'elevenlabs' | 'google';  // TTS 프로바이더 선택
    };
    video: {
      orientation: 'portrait' | 'landscape';
    };
    nanoBanana?: {
      defaultStyle?: string;
    };
    youtube?: {
      enabled: boolean;
      channelName: string;
    };
  };
  videos: NewsVideo[];
}

// ============================================
// 2. 내부 처리용 타입
// ============================================

/**
 * 처리된 씬 (이미지 + 오디오 생성 후)
 */
export interface ProcessedScene {
  scene_id: number;
  imagePath: string;
  audioPath: string;
  audioDuration: number;
  captions: Caption[];
  textOverlay?: string;
}

/**
 * 비디오 처리 상태
 */
export type VideoStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'error';

/**
 * 비디오 결과
 */
export interface NewsVideoResult {
  videoId: string;
  status: VideoStatus;
  outputPath?: string;
  duration?: number;
  error?: string;
  youtubeUrl?: string;
}

// ============================================
// 3. API 타입
// ============================================

/**
 * API 요청
 */
export interface CreateNewsVideoRequest {
  payload: NewsPayload;
  options?: {
    callbackUrl?: string;
    skipYouTubeUpload?: boolean;
  };
}

/**
 * API 응답
 */
export interface CreateNewsVideoResponse {
  success: boolean;
  videoId: string;
  status: VideoStatus;
  message: string;
}

/**
 * 상태 조회 응답
 */
export interface NewsVideoStatusResponse {
  videoId: string;
  status: VideoStatus;
  progress?: {
    current: number;
    total: number;
    step: string;
  };
  result?: NewsVideoResult;
  error?: string;
}

/**
 * 콜백 페이로드
 */
export interface NewsCallbackPayload {
  videoId: string;
  status: 'completed' | 'error';
  result?: NewsVideoResult;
  error?: string;
}
