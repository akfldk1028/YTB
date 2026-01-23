/**
 * YTB-books-project Types
 * 책 → Shorts 파이프라인 타입 정의
 */

import type { GhibliStyleConfig } from '../services/GhibliImageService';

// Re-export from service
export type { SceneImageResult, GhibliStyleConfig } from '../services/GhibliImageService';

/**
 * 책 청크 정보 (Neo4j에서 조회)
 */
export interface BookChunk {
  id: string;
  bookId: string;
  chunkIndex: number;
  text: string;
  summary?: string;
  entities?: string[];
  embedding?: number[];
}

/**
 * 씬 생성 입력
 */
export interface SceneGenerationInput {
  chunk: BookChunk;
  narrationText: string;
  imagePrompt: string;
  videoPrompt?: string;
  characterIds?: string[];
}

/**
 * 지브리 스타일 씬
 */
export interface GhibliScene {
  sceneIndex: number;
  narration: string;
  imagePrompt: string;
  videoPrompt?: string;
  style: GhibliStyleConfig;
}

/**
 * Shorts 생성 상태
 */
export type ShortsStatus = 'pending' | 'analyzed' | 'generating' | 'completed' | 'uploaded';

/**
 * 책 메타데이터
 */
export interface BookMetadata {
  id: string;
  title: string;
  author?: string;
  genre?: string;
  totalChunks: number;
  processedAt?: Date;
  /** Shorts 생성 상태 */
  shortsStatus?: ShortsStatus;
  /** Shorts 계획 ID */
  shortsPlanId?: string;
  /** 생성된 Shorts 수 */
  shortsTotal?: number;
}

/**
 * Shorts 생성 설정
 */
export interface ShortsGenerationConfig {
  /** 지브리 스타일 설정 */
  ghibliStyle?: GhibliStyleConfig;
  /** 영상 방향 (portrait for Shorts) */
  orientation?: 'portrait' | 'landscape';
  /** VEO3 I2V 사용 여부 */
  useVeo3?: boolean;
  /** TTS 설정 */
  tts?: {
    provider: 'gemini' | 'elevenlabs' | 'google';
    voice?: string;
    style?: string;
  };
  /** 자막 설정 */
  subtitles?: {
    korean: boolean;
    english: boolean;
    fontSize?: number;
  };
}

// ============================================
// Episode/Scene 타입 (시리즈 연속성)
// ============================================

/**
 * Episode 상태
 */
export type EpisodeStatus = 'draft' | 'approved' | 'producing' | 'completed' | 'uploaded';

/**
 * Scene 타입 (콘텐츠 유형)
 */
export type SceneType =
  | 'hook'
  | 'intro'
  | 'problem'
  | 'solution'
  | 'explanation'
  | 'example'
  | 'data'
  | 'comparison'
  | 'conclusion'
  | 'cta';

/**
 * 시각 유형
 */
export type VisualType =
  | 'text_overlay'
  | 'animation'
  | 'footage'
  | 'diagram'
  | 'chart'
  | 'comparison'
  | 'montage';

/**
 * 카메라 워크
 */
export type CameraType =
  | 'wide'
  | 'close_up'
  | 'zoom_in'
  | 'zoom_out'
  | 'pan_left'
  | 'pan_right'
  | 'static'
  | 'rotate';

/**
 * 전환 효과
 */
export type TransitionType =
  | 'cut'
  | 'fade'
  | 'swipe_left'
  | 'swipe_right'
  | 'swipe_up';

/**
 * Episode (에피소드) - Neo4j 노드
 * 하나의 Shorts 영상 = 하나의 Episode
 */
export interface Episode {
  id: string;
  documentId: string;
  episodeNumber: number;
  title: string;
  hook: string;
  cta: string;
  ctaAction: 'subscribe' | 'next_episode' | 'like' | 'comment';
  durationSec: number;
  sceneCount: number;
  keywords: string[];
  hashtags: string[];
  status: EpisodeStatus;
  createdAt?: Date;
  updatedAt?: Date;
  /** 이전 에피소드 ID (시리즈 연결) */
  previousEpisodeId?: string;
  /** 다음 에피소드 ID (시리즈 연결) */
  nextEpisodeId?: string;
  /** 마스터 이미지 경로 (GPT로 생성된 첫 이미지) */
  masterImagePath?: string;
  /** 생성된 비디오 경로 */
  videoPath?: string;
  /** YouTube 업로드 ID */
  youtubeId?: string;
}

/**
 * Scene (씬) - Neo4j 노드
 * Episode 내의 개별 장면 (5-10초)
 */
export interface Scene {
  id: string;
  episodeId: string;
  sceneNumber: number;
  type: SceneType;
  narration: string;
  onScreenText?: string;
  durationSec: number;
  visualType: VisualType;
  visualDesc: string;
  camera: CameraType;
  transition: TransitionType;
  /** 원본 청크 ID (Scene-[:BASED_ON]->Chunk) */
  sourceChunkIds?: string[];
  /** 언급된 엔티티 (Scene-[:MENTIONS]->Entity) */
  mentionedEntities?: string[];
  /** 생성된 이미지 경로 */
  imagePath?: string;
  /** 생성된 TTS 오디오 경로 */
  audioPath?: string;
  /** 생성된 비디오 클립 경로 */
  clipPath?: string;
}

/**
 * Episode 생성 입력
 */
export interface CreateEpisodeInput {
  documentId: string;
  episodeNumber: number;
  title: string;
  hook: string;
  cta: string;
  ctaAction?: 'subscribe' | 'next_episode' | 'like' | 'comment';
  keywords?: string[];
  hashtags?: string[];
  previousEpisodeId?: string;
}

/**
 * Scene 생성 입력
 */
export interface CreateSceneInput {
  episodeId: string;
  sceneNumber: number;
  type: SceneType;
  narration: string;
  onScreenText?: string;
  durationSec?: number;
  visualType?: VisualType;
  visualDesc: string;
  camera?: CameraType;
  transition?: TransitionType;
  sourceChunkIds?: string[];
  mentionedEntities?: string[];
}

/**
 * Episode + Scenes 전체 데이터
 */
export interface EpisodeWithScenes extends Episode {
  scenes: Scene[];
}

/**
 * 시리즈 전체 데이터
 */
export interface DocumentSeries {
  documentId: string;
  documentTitle: string;
  totalEpisodes: number;
  episodes: EpisodeWithScenes[];
  createdAt: Date;
  lastEpisodeNumber: number;
}
