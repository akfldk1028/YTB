export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_AUDIO_DURATION = 3;
// 🔥 ElevenLabs Rachel - 무료 사용 가능한 기본 음성 (Female, American)
// 유료 음성 대안: Axl (baRq1qg6PxLsnSQ04d8c) - Shorts 최적화, 에너지 넘침
export const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"; // Rachel (premade, free)

export const VIDEO_DIMENSIONS = {
  PORTRAIT: "1080x1920",
  LANDSCAPE: "1920x1080"
} as const;

export const SUPPORTED_IMAGE_FORMATS = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const SUPPORTED_VIDEO_FORMATS = ['video/mp4', 'video/webm'] as const;
export const SUPPORTED_AUDIO_FORMATS = ['audio/mp3', 'audio/wav'] as const;

export const ERROR_TYPES = {
  QUOTA_EXCEEDED: 'quota_exceeded',
  AUTHENTICATION_ERROR: 'authentication_error',
  NETWORK_ERROR: 'network_error',
  VIDEO_GENERATION_ERROR: 'video_generation_error',
  AUDIO_GENERATION_ERROR: 'audio_generation_error',
  TRANSCRIPTION_ERROR: 'transcription_error',
  VIDEO_PROCESSING_ERROR: 'video_processing_error',
  UNKNOWN_ERROR: 'unknown_error'
} as const;

export const VIDEO_STATUS = {
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed'
} as const;