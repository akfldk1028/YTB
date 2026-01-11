/**
 * Loudly BGM API Types
 *
 * Loudly API: https://loudly.com/developers
 * - Text-to-Music AI generation
 * - 3500+ royalty-free tracks
 * - Perpetual commercial license
 */

export interface LoudlyConfig {
  apiKey: string;
  /** Base URL (default: https://api.loudly.com/v1) */
  baseUrl?: string;
}

/**
 * BGM Generation Request
 */
export interface LoudlyGenerateRequest {
  /** Text prompt for music generation (e.g., "happy upbeat music for cat video") */
  prompt: string;
  /** Duration in seconds (default: 30) */
  duration?: number;
  /** Genre filter */
  genre?: LoudlyGenre;
  /** Mood filter */
  mood?: LoudlyMood;
  /** Tempo in BPM (60-180) */
  tempo?: number;
  /** Energy level (0.0 to 1.0) */
  energy?: number;
}

/**
 * BGM Generation Response
 */
export interface LoudlyGenerateResponse {
  /** Unique track ID */
  id: string;
  /** Track title */
  title: string;
  /** Audio file URL */
  audioUrl: string;
  /** Duration in seconds */
  duration: number;
  /** Genre */
  genre: string;
  /** Mood */
  mood: string;
  /** BPM */
  tempo: number;
  /** License info */
  license: {
    type: string;
    commercial: boolean;
    attribution: boolean;
  };
}

/**
 * Search/Browse Request
 */
export interface LoudlySearchRequest {
  /** Search query */
  query?: string;
  /** Genre filter */
  genre?: LoudlyGenre;
  /** Mood filter */
  mood?: LoudlyMood;
  /** Minimum duration in seconds */
  minDuration?: number;
  /** Maximum duration in seconds */
  maxDuration?: number;
  /** Results per page (default: 10) */
  limit?: number;
  /** Page offset */
  offset?: number;
}

/**
 * Track from catalog
 */
export interface LoudlyTrack {
  id: string;
  name: string;           // BGMTrack 호환
  title: string;
  artist: string;
  audioUrl: string;
  previewUrl: string;
  duration: number;
  genre: string;
  mood: string;
  tempo: number;
  tags: string[];
}

/**
 * Available genres
 */
export type LoudlyGenre =
  | 'pop'
  | 'rock'
  | 'electronic'
  | 'hip-hop'
  | 'jazz'
  | 'classical'
  | 'ambient'
  | 'folk'
  | 'country'
  | 'r&b'
  | 'latin'
  | 'cinematic'
  | 'lofi'
  | 'acoustic';

/**
 * Available moods
 */
export type LoudlyMood =
  | 'happy'
  | 'sad'
  | 'energetic'
  | 'calm'
  | 'romantic'
  | 'dramatic'
  | 'dark'
  | 'uplifting'
  | 'mysterious'
  | 'playful'
  | 'nostalgic'
  | 'epic'
  | 'relaxing'
  | 'inspiring';

/**
 * Preset BGM configurations
 */
export const LOUDLY_PRESETS: Record<string, LoudlyGenerateRequest> = {
  // 고양이 영상용
  CAT_CUTE: {
    prompt: 'cute playful music for cat video',
    mood: 'playful',
    genre: 'acoustic',
    energy: 0.6,
  },
  CAT_CHILL: {
    prompt: 'relaxing lofi music for cat sleeping',
    mood: 'calm',
    genre: 'lofi',
    energy: 0.3,
  },
  CAT_HAPPY: {
    prompt: 'happy upbeat music for cat playing',
    mood: 'happy',
    genre: 'pop',
    energy: 0.7,
  },

  // 일반 Shorts용
  SHORTS_UPBEAT: {
    prompt: 'energetic upbeat music for short video',
    mood: 'energetic',
    genre: 'electronic',
    energy: 0.8,
  },
  SHORTS_CHILL: {
    prompt: 'chill lofi beats for short content',
    mood: 'relaxing',
    genre: 'lofi',
    energy: 0.4,
  },
  SHORTS_DRAMATIC: {
    prompt: 'dramatic cinematic music for storytelling',
    mood: 'dramatic',
    genre: 'cinematic',
    energy: 0.7,
  },

  // 감정별
  EMOTIONAL_SAD: {
    prompt: 'emotional sad piano music',
    mood: 'sad',
    genre: 'classical',
    energy: 0.3,
  },
  EMOTIONAL_ROMANTIC: {
    prompt: 'romantic love music',
    mood: 'romantic',
    genre: 'acoustic',
    energy: 0.5,
  },
  EMOTIONAL_EPIC: {
    prompt: 'epic orchestral music',
    mood: 'epic',
    genre: 'cinematic',
    energy: 0.9,
  },
};
