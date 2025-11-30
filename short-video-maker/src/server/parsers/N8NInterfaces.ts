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

// YouTube 업로드 설정 구조
export interface N8NYouTubeUploadConfig {
  enabled: boolean;
  channelName: string;
  title?: string;  // "{{auto}}" for auto-generation from metadata
  description?: string;
  tags?: string[];
  privacy?: 'private' | 'unlisted' | 'public';
  categoryId?: string;
}

// 새로운 N8N RAW 데이터 구조 (format_type 포함)
export interface N8NNewRawData {
  category: string;
  language: string;
  viral_potential: number;
  format_type: 'timeline' | 'storyboard';
  topic_category: string;
  target_language: string;
  time_context?: N8NTimelineScenes;
  timeline?: N8NTimelineScenes;
  storyboard?: N8NNewStoryboardShot[];
  title: string;
  video_config: N8NVideoConfig;
  elevenlabs_config: N8NElevenLabsConfig;
  channel_config?: N8NChannelConfig;
  youtube_upload?: N8NYouTubeUploadConfig;
  timestamp?: string;
}

// Timeline의 scenes 구조
export interface N8NTimelineScenes {
  scenes: N8NNewTimelineScene[];
}

// 새로운 Timeline Scene 구조
export interface N8NNewTimelineScene {
  id: string;
  duration: number;
  text: string;
  search_keywords: string[];
  visual_style?: string;  // VEO3 지원
  mood?: string;          // VEO3 지원
  image_prompt?: string;  // VEO3 지원
  generate_multiple?: boolean;  // 다중 이미지 생성
  use_consistency?: boolean;    // 일관성 모드
  image_count?: number;         // 생성할 이미지 수
}

// 새로운 Storyboard Shot 구조
export interface N8NNewStoryboardShot {
  shot: number;
  duration: number;
  audio: {
    narration: string;
  };
  search_keywords: string[];
  visual_style: string;
  mood: string;
  image_prompt: string;
  generate_multiple?: boolean;  // 다중 이미지 생성
  use_consistency?: boolean;    // 일관성 모드
  image_count?: number;         // 생성할 이미지 수
}

// Video Config 구조
export interface N8NVideoConfig {
  orientation: 'portrait' | 'landscape';
  musicVolume: 'low' | 'medium' | 'high';
  subtitlePosition: 'top' | 'center' | 'bottom';
  quality: 'standard' | 'high' | 'premium';
  captionBackgroundColor?: string; // 🔥 TikTok 스타일 자막 하이라이트 색상
}

// ElevenLabs Config 구조
export interface N8NElevenLabsConfig {
  model_id: string;
  voice?: string; // 🔥 ElevenLabs voice ID (e.g., 'baRq1qg6PxLsnSQ04d8c' for Axl)
  voice_settings: {
    stability: number;
    similarity_boost: number;
    speed: number;
    style: string;
  };
  output_format: string;
}

// Channel Config 구조
export interface N8NChannelConfig {
  voice_preference: string;
  veo3_priority: boolean;
  channel_type: string;
  channel_name: string;
}

// N8N Raw 데이터 유니온 타입
export type N8NRawData = N8NTimelineRawData | N8NStoryboardRawData | N8NNewRawData;

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
    category?: string;
    language?: string;
    channel_type?: string;
    viral_potential?: number;
    format_type?: string;
    youtubeUpload?: N8NYouTubeUploadConfig;
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
  imagePrompt?: string; // For VEO2/3 motion prompt (detailed camera/motion instructions)
  needsImageGeneration?: boolean;
  imageData?: {
    prompt: string;
    style: string;
    mood: string;
    generateMultiple?: boolean;
    useConsistency?: boolean;
    count?: number;
    numberOfImages?: number;
  };
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
  quality?: '720p' | '1080p' | '4k' | 'standard' | 'high' | 'premium';
  style?: string;
  subtitlePosition?: 'top' | 'center' | 'bottom';
  useVeo3?: boolean;
  // 🔥 TTS Voice ID (ElevenLabs)
  voice?: string;
  // 🔥 TikTok 스타일 자막 하이라이트 색상
  captionBackgroundColor?: string;
  elevenlabs?: {
    model_id: string;
    voice?: string; // ElevenLabs voice ID
    voice_settings: {
      stability: number;
      similarity_boost: number;
      speed: number;
      style: string;
    };
    output_format: string;
  };
  soundtrack?: {
    music: string;
    volume: number;
    fade: boolean;
  };
}