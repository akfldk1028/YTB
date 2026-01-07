/**
 * Text Overlay Types
 *
 * 정적 텍스트 오버레이와 동적 자막을 위한 타입 정의
 * 모듈화되어 있어 나중에 확장 가능
 */

/**
 * 오버레이 모드
 * - static: 정적 텍스트 (영상 제목 등)
 * - dynamic: 동적 자막 (SRT 파일 기반)
 * - none: 오버레이 없음
 */
export type OverlayMode = 'static' | 'dynamic' | 'none';

/**
 * 텍스트 위치
 */
export type TextPosition = 'top' | 'bottom' | 'center';

/**
 * 정적 텍스트 옵션
 */
export interface StaticTextOptions {
  /** 표시할 텍스트 (기본: 영상 제목) */
  text: string;

  /** 텍스트 위치 (기본: top) */
  position: TextPosition;

  /** 글자 크기 (기본: 36) */
  fontSize: number;

  /** 글자 색상 (기본: white) */
  fontColor: string;

  /** 외곽선 색상 (기본: black) */
  outlineColor: string;

  /** 외곽선 두께 (기본: 2) */
  outlineWidth: number;

  /** 상하 여백 (기본: 50px) */
  marginY: number;

  /** 배경색 (선택, 예: 'black@0.5') */
  backgroundColor?: string;

  /** 배경 패딩 (기본: 10) */
  backgroundPadding?: number;
}

/**
 * 동적 자막 옵션 (SRT 파일 기반)
 */
export interface DynamicSubtitleOptions {
  /** SRT 자막 파일 경로 */
  subtitlePath: string;

  /** 글자 크기 (기본: 24) */
  fontSize: number;

  /** 글자 색상 (기본: white) */
  fontColor: string;

  /** 외곽선 두께 (기본: 2) */
  outlineWidth: number;

  /** 그림자 (기본: 1) */
  shadow: number;
}

/**
 * 통합 오버레이 옵션
 */
export interface OverlayOptions {
  /** 오버레이 모드 */
  mode: OverlayMode;

  /** 정적 텍스트 옵션 (mode가 'static'일 때 사용) */
  static?: Partial<StaticTextOptions>;

  /** 동적 자막 옵션 (mode가 'dynamic'일 때 사용) */
  dynamic?: Partial<DynamicSubtitleOptions>;
}

/**
 * 기본 정적 텍스트 옵션
 */
export const DEFAULT_STATIC_OPTIONS: StaticTextOptions = {
  text: '',
  position: 'top',
  fontSize: 36,
  fontColor: 'white',
  outlineColor: 'black',
  outlineWidth: 2,
  marginY: 50,
  backgroundPadding: 10
};

/**
 * 기본 동적 자막 옵션
 */
export const DEFAULT_DYNAMIC_OPTIONS: Omit<DynamicSubtitleOptions, 'subtitlePath'> = {
  fontSize: 24,
  fontColor: 'white',
  outlineWidth: 2,
  shadow: 1
};

/**
 * 기본 오버레이 옵션 (정적 텍스트 모드)
 */
export const DEFAULT_OVERLAY_OPTIONS: OverlayOptions = {
  mode: 'static',
  static: DEFAULT_STATIC_OPTIONS
};
