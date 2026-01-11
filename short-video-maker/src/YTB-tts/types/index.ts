/**
 * YTB-TTS Common Types
 */

export type ProviderType = 'tts' | 'stt' | 'sound-effects' | 'bgm';

export type TTSProviderName = 'elevenlabs' | 'google' | 'kokoro';
export type SoundEffectsProviderName = 'elevenlabs' | 'freesound';
export type BGMProviderName = 'loudly' | 'local';
export type STTProviderName = 'whisper';

export interface AudioConfig {
  sampleRate?: number;      // 기본 44100
  channels?: number;        // 기본 2 (stereo)
  bitrate?: number;         // 기본 128k
  format?: 'mp3' | 'wav' | 'ogg' | 'aac';
}

export interface TimedAudio {
  path: string;
  startTime: number;        // 시작 시간 (초)
  duration: number;         // 길이 (초)
  volume?: number;          // 볼륨 (0~1)
}

export interface AudioMixConfig {
  backgroundVolume?: number;   // BGM 볼륨 (0~1)
  voiceVolume?: number;        // TTS 볼륨 (0~1)
  effectsVolume?: number;      // 효과음 볼륨 (0~1)
  normalizeOutput?: boolean;   // 출력 정규화
}
