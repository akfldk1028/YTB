/**
 * YTB-video-animation Types
 * 정적 이미지 → 애니메이션 비디오 변환 모듈 타입 정의
 *
 * 공식 문서: https://docs.x.ai/docs/guides/video-generations
 */

export enum VideoAnimationProvider {
  GROK = 'grok',
  MANIM = 'manim',
}

/** 공식 지원 화면 비율 (xAI Grok Imagine Video) */
export type GrokAspectRatio = 'auto' | '16:9' | '4:3' | '3:2' | '1:1' | '2:3' | '3:4' | '9:16';

/** 공식 지원 해상도 */
export type GrokResolution = '720p' | '480p';

export interface VideoAnimationRequest {
  /** 입력 이미지 경로 */
  imagePath: string;
  /** 목표 길이 (초), 1~15, 기본값 6 */
  duration: number;
  /** 동작 프롬프트 (영어, 최대 4096자) */
  motionPrompt: string;
  /** 화면 비율 (기본: 9:16 for Shorts) */
  aspectRatio?: GrokAspectRatio;
  /** 해상도 (기본: 720p) */
  resolution?: GrokResolution;
}

export interface VideoAnimationResult {
  success: boolean;
  /** 생성된 비디오 경로 */
  videoPath?: string;
  provider: VideoAnimationProvider;
  durationSeconds?: number;
  error?: string;
  /** 예상 비용 (USD) — $0.05/초 */
  costEstimate?: number;
}

/** Manim 올빼미 표정 모드 */
export type OwlMode = 'neutral' | 'thinking' | 'surprised' | 'pointing' | 'happy';

/** Manim 씬 타입별 애니메이션 요청 */
export interface ManimAnimationRequest extends VideoAnimationRequest {
  /** 씬 타입 (hook, explanation, formula, conclusion 등) */
  sceneType: string;
  /** LaTeX 수식 (formula 씬일 때) */
  latex?: string;
  /** 나레이션 텍스트 (올빼미 표정 결정용) */
  narrationText?: string;
  /** 올빼미 표정 모드 */
  owlMode?: OwlMode;
  /** 배경 이미지 경로 (NanoBanana 결과) */
  backgroundImagePath?: string;
  /** 수식 변수별 하이라이트 색상 */
  variableColors?: Record<string, string>;
  /** MathFormulaService가 렌더링한 수식 PNG 경로 (MathJax → sharp) */
  formulaPngPath?: string;
}

/** VideoAnimationService 초기화 설정 */
export interface VideoAnimationConfig {
  xaiApiKey?: string;
  /** Manim 애니메이션 활성화 (기본: false, manim 설치 필요) */
  enableManim?: boolean;
  tempDirPath: string;
}
