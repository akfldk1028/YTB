/**
 * N8N 타임라인 데이터의 완전한 타입 정의
 */

// N8N에서 전송되는 원시 데이터 구조 - Timeline 형식
export interface N8NTimelineRawData {
  timeline_title: string;
  timeline_json: string; // JSON 문자열
  timeline_config: string; // JSON 문자열
}

// N8N에서 전송되는 원시 데이터 구조 - Storyboard 형식
export interface N8NStoryboardRawData {
  storyboard_title: string;
  storyboard_json: string; // JSON 문자열
  storyboard_config: string; // JSON 문자열
}

// N8N Raw 데이터 유니온 타입
export type N8NRawData = N8NTimelineRawData | N8NStoryboardRawData;

// timeline_json 파싱된 구조
export interface N8NTimelineData {
  timeline: {
    scenes: N8NScene[];
    soundtrack?: N8NSoundtrack;
  };
}

// timeline_config 파싱된 구조
export interface N8NTimelineConfig {
  timeline: {
    orientation: 'portrait' | 'landscape';
    quality?: '720p' | '1080p' | '4k';
    style?: string;
    branding?: {
      colors: string[];
    };
  };
}

// storyboard_json 파싱된 구조
export interface N8NStoryboardData {
  storyboard: N8NStoryboardShot[];
}

// storyboard_config 파싱된 구조  
export interface N8NStoryboardConfig {
  storyboard: {
    orientation: 'portrait' | 'landscape';
    quality?: '720p' | '1080p' | '4k';
    style?: string;
    branding?: {
      colors: string[];
    };
  };
}

// 스토리보드 샷 구조
export interface N8NStoryboardShot {
  shot: number;
  scene_type: 'hook' | 'reveal' | 'close' | string;
  duration: number;
  video: N8NStoryboardVideo;
  audio: N8NStoryboardAudio;
  text: N8NStoryboardText;
}

// 스토리보드 비디오 구조
export interface N8NStoryboardVideo {
  type: 'generated' | 'stock' | string;
  prompt: string;
  style?: string;
  camera?: string;
  camera_movement?: string;
  lighting?: string;
}

// 스토리보드 오디오 구조
export interface N8NStoryboardAudio {
  narration: string;
  background_music?: string;
  sound_effects?: string[];
}

// 스토리보드 텍스트 구조
export interface N8NStoryboardText {
  title: string;
  subtitle?: string;
  animation?: string;
  facts?: string[];
  position: string;
}

// 장면 구조
export interface N8NScene {
  id: string;
  duration: number;
  elements: N8NElement[];
}

// 요소들의 유니온 타입
export type N8NElement = N8NNarrationElement | N8NVideoElement | N8NTextOverlayElement;

// 내레이션 요소
export interface N8NNarrationElement {
  type: 'narration';
  text: string;
  voice: string;
  timing: {
    start: number;
    end: number;
  };
}

// 비디오 요소
export interface N8NVideoElement {
  type: 'video';
  prompt: string;
  searchTerms: string[];
  duration: number;
  effects?: string[];
  transition?: string;
}

// 텍스트 오버레이 요소
export interface N8NTextOverlayElement {
  type: 'text_overlay';
  content: string;
  style: string;
  position: string;
  timing: {
    start: number;
    end: number;
  };
}

// 사운드트랙 구조
export interface N8NSoundtrack {
  music: string;
  volume: number;
  fade: boolean;
  effects?: Array<{
    time: number;
    effect: string;
    volume: number;
  }>;
}

// 파싱된 최종 결과 (우리 API 형식으로 변환)
export interface ParsedVideoData {
  scenes: ParsedScene[];
  config: ParsedConfig;
  metadata: {
    title: string;
    totalDuration: number;
    sceneCount: number;
    originalStyle?: string;
  };
}

export interface ParsedScene {
  text: string;
  searchTerms: string[];
  voiceConfig: {
    voice: string;
  };
  duration?: number;
  videoPrompt?: string;
  textOverlays?: Array<{
    content: string;
    style: string;
    position: string;
    timing: { start: number; end: number };
  }>;
}

export interface ParsedConfig {
  orientation: 'portrait' | 'landscape';
  musicTag: string;
  quality?: '720p' | '1080p' | '4k';
  style?: string;
  soundtrack?: {
    music: string;
    volume: number;
    fade: boolean;
  };
}