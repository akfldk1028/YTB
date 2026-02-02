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
  scene_type?: string;     // 'intro' | 'news' | 'news_1' | 'news_2' | ... | 'outro'
  news_rank?: number;      // v1.6 형식: scene_type='news' + news_rank=1,2,3,4
  narration: string;       // TTS 내용 텍스트
  news_title?: string;     // 🔥 TTS로 읽을 뉴스 제목 (narration 앞에 읽음)
  image_prompt: string;    // 이미지 생성 프롬프트
  duration: number;        // 예상 길이
  text_overlay?: string;   // 화면 텍스트 (2줄 제목)
}

/**
 * News 비디오
 */
export interface NewsVideo {
  video_id: string;
  title: string;
  theme?: string;
  scenes: NewsScene[];
  hashtags?: string[];  // 🔥 n8n payload: video.hashtags
  firstComment?: string;  // 🔥 업로드 후 첫 댓글 (출처 고지 등)
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
 * 🔥 폰트 프리셋
 * - 'nanum': NanumGothicBold (시스템 설치, 한글 안정)
 * - 'blackhansans': BlackHanSans (임팩트 강한 제목용)
 * - 'gmarket': GmarketSansBold (깔끔한 본문용)
 * - 'malgun': 맑은고딕 (Windows 전용)
 */
export type FontPreset = 'nanum' | 'blackhansans' | 'gmarket' | 'malgun';

/**
 * 🔥 프로젝트별 폰트 설정
 * n8n에서 프로젝트마다 다른 폰트를 지정 가능
 */
export interface FontConfig {
  // 제목 폰트 (상단 text_overlay)
  title_font?: FontPreset;
  // 자막 폰트 (본문 narration)
  subtitle_font?: FontPreset;
  // 자막 크기 (기본: portrait=90, landscape=72)
  subtitle_size?: number;
  // 제목 크기 (기본: portrait=52, landscape=42)
  title_size?: number;
  // 색상 설정
  title_color?: string;      // 제목 텍스트 색 (기본: 000000 검정)
  title_bg_color?: string;   // 제목 배경 색 (기본: FFEB3B 노랑)
  subtitle_color?: string;   // 자막 텍스트 색 (기본: FFFFFF 흰색)
}

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
      tts_provider?: 'elevenlabs' | 'google' | 'gemini';  // TTS 프로바이더 선택
      // 🔥 TTS 스타일 (Gemini Director's Notes)
      // 예: "발랄하고 에너지 넘치는 뉴스 앵커" 또는 "차분하고 신뢰감 있는 앵커"
      tts_style?: string;
    };
    video: {
      orientation: 'portrait' | 'landscape';
    };
    // 🔥 프로젝트별 폰트 설정 (한글/영어 프로젝트별로 다르게)
    font?: FontConfig;
    nanoBanana?: {
      defaultStyle?: string;
    };
    // 🔥 n8n payload 구조에 맞게 수정
    youtube?: {
      channelName: string;
      channelId?: string;
      defaultTags?: string[];
      defaultPrivacyStatus?: 'private' | 'unlisted' | 'public';
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
  downloadUrl?: string;  // 🔥 GCS 다운로드 URL (서명된 URL)
  gcsPath?: string;      // 🔥 GCS 경로 (gs://bucket/path)
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
