/**
 * YTB-books-project Types
 * 책 → Shorts 파이프라인 타입 정의
 */

import type { SceneImageConfig } from '../services/SceneImageService';

// Re-export from service (+ backwards compat aliases)
export type { SceneImageResult, SceneImageConfig } from '../services/SceneImageService';
/** @deprecated Use SceneImageConfig */
export type GhibliStyleConfig = SceneImageConfig;

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
  latexFormulas?: string[];      // v3.1.0: Neo4j에서 가져온 LaTeX 수식 목록
  sectionTitle?: string;         // v3.1.0: 청크의 섹션 제목
  keywords?: string[];           // v12.1: AI 시맨틱 청킹 키워드
  chunkType?: 'chapter' | 'section' | 'concept';  // v12.1: 청크 유형
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
 * Book 씬 (스타일 프로파일 기반)
 */
export interface BookScene {
  sceneIndex: number;
  narration: string;
  imagePrompt: string;
  videoPrompt?: string;
  style: SceneImageConfig;
}
/** @deprecated Use BookScene */
export type GhibliScene = BookScene;

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
  /** 씬 이미지 스타일 설정 */
  imageStyle?: SceneImageConfig;
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
  /** v8.1: YouTube SEO 설명문 (ContentPlanner 생성) */
  description?: string;
  /** v8.1: 에피소드 요약 (다음 에피소드 컨텍스트 + YouTube 설명용) */
  summary?: string;
  /** v8.1: YouTube 업로드 시각 */
  uploadedAt?: Date;
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
  /** v3.3.0: 이 씬이 설명할 수식 (LaTeX) — 커리큘럼에서 할당 */
  assignedFormula?: string;
  /** v3.3.0: 수식 이름 (예: "Reconstruction Loss") */
  formulaName?: string;
  /** v3.3.0: 수식의 고등학생 수준 비유 (예: "원본과 복사본 비교하기") */
  formulaMetaphor?: string;
  /** v11.0: VEO 보간용 시작 키프레임 이미지 프롬프트 (ContentPlanner가 생성) */
  firstFramePrompt?: string;
  /** v11.0: VEO 보간용 종료 키프레임 이미지 프롬프트 (ContentPlanner가 생성) */
  lastFramePrompt?: string;
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
  /** v8.1: YouTube SEO 설명문 */
  description?: string;
  /** v8.1: 에피소드 요약 */
  summary?: string;
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
  /** v3.3.0: 커리큘럼에서 할당된 수식 (LaTeX) */
  assignedFormula?: string;
  /** v3.3.0: 수식 이름 */
  formulaName?: string;
  /** v3.3.0: 수식 비유 */
  formulaMetaphor?: string;
  /** v11.0: VEO 보간용 시작 키프레임 이미지 프롬프트 */
  firstFramePrompt?: string;
  /** v11.0: VEO 보간용 종료 키프레임 이미지 프롬프트 */
  lastFramePrompt?: string;
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

// ============================================
// v3.4.0: Document별 비디오 설정
// ============================================

/**
 * 콘텐츠 유형별 기본 설정 프리셋
 */
export type DocumentContentType = 'math_science' | 'humanities' | 'social_science' | 'general';

/**
 * v3.4.0: Document별 비디오 생성 설정
 * contentType별 기본값 + 문서별 override로 여러 PDF가 서로 간섭하지 않음
 */
export interface DocumentVideoConfig {
  /** 콘텐츠 유형 (기본 프리셋 결정) */
  contentType: DocumentContentType;
  /** v3.7.0: 비주얼 스타일 ID (ghibli, math_character 등) — 미설정 시 contentType에서 자동 추론 */
  style?: string;
  /** 씬당 나레이션 최대 글자수 */
  maxNarrationLength?: number;
  /** 수식 씬 나레이션 최대 글자수 */
  maxFormulaNarrationLength?: number;
  /** 수식 오버레이 활성화 */
  enableMathFormulas?: boolean;
  /** 수식 위치 */
  mathFormulaPosition?: 'center' | 'top' | 'bottom';
  /** 에피소드당 최대 씬 수 */
  maxScenesPerEpisode?: number;
  /** 씬당 최대 초 */
  maxSceneDuration?: number;
  /** TTS voice 이름 */
  ttsVoice?: string;
  /** TTS 성별 */
  ttsGender?: 'female' | 'male';
  /** 크로스페이드 초 */
  crossfadeDuration?: number;
  /** 자막 Y 위치 */
  subtitleYPosition?: string;
}

/**
 * contentType별 기본값 프리셋
 */
export const DOCUMENT_CONFIG_PRESETS: Record<DocumentContentType, DocumentVideoConfig> = {
  math_science: {
    contentType: 'math_science',
    maxNarrationLength: 35,
    maxFormulaNarrationLength: 60,
    enableMathFormulas: true,
    mathFormulaPosition: 'top',
    maxScenesPerEpisode: 10,
    maxSceneDuration: 8,
    crossfadeDuration: 0.15,
    subtitleYPosition: 'h*0.88',
  },
  humanities: {
    contentType: 'humanities',
    maxNarrationLength: 40,
    maxFormulaNarrationLength: 60,
    enableMathFormulas: false,
    mathFormulaPosition: 'top',
    maxScenesPerEpisode: 10,
    maxSceneDuration: 8,
    crossfadeDuration: 0.15,
    subtitleYPosition: 'h*0.88',
  },
  social_science: {
    contentType: 'social_science',
    maxNarrationLength: 38,
    maxFormulaNarrationLength: 60,
    enableMathFormulas: true,
    mathFormulaPosition: 'top',
    maxScenesPerEpisode: 10,
    maxSceneDuration: 8,
    crossfadeDuration: 0.15,
    subtitleYPosition: 'h*0.88',
  },
  general: {
    contentType: 'general',
    maxNarrationLength: 35,
    maxFormulaNarrationLength: 60,
    enableMathFormulas: false,
    mathFormulaPosition: 'top',
    maxScenesPerEpisode: 10,
    maxSceneDuration: 8,
    crossfadeDuration: 0.15,
    subtitleYPosition: 'h*0.88',
  },
};
