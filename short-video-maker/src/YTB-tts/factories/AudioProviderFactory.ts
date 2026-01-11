/**
 * Audio Provider Factory
 *
 * TTS, Sound Effects, BGM, STT 프로바이더를 생성하는 팩토리
 */

import { ITTSProvider, ISoundEffectsProvider, IBGMProvider, ISTTProvider } from '../interfaces';
import { TTSProviderName, SoundEffectsProviderName, BGMProviderName, STTProviderName } from '../types';

// Providers
import { ElevenLabsTTS, GoogleTTS } from '../providers/tts';
import { ElevenLabsSoundEffects, FreesoundSoundEffects } from '../providers/sound-effects';
import { LoudlyBGM } from '../providers/bgm';
import { WhisperSTT, WhisperConfig } from '../providers/stt';

/**
 * TTS Provider 생성 옵션
 */
export interface TTSProviderOptions {
  apiKey?: string;
  defaultVoiceId?: string;
  defaultModel?: string;
  defaultLanguage?: string;
}

/**
 * Sound Effects Provider 생성 옵션
 */
export interface SoundEffectsProviderOptions {
  apiKey?: string;
}

/**
 * BGM Provider 생성 옵션
 */
export interface BGMProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  localMusicDir?: string;
}

/**
 * STT Provider 생성 옵션
 */
export interface STTProviderOptions extends WhisperConfig {}

/**
 * Audio Provider Factory
 */
export class AudioProviderFactory {
  /**
   * TTS Provider 생성
   */
  static createTTSProvider(
    name: TTSProviderName,
    options?: TTSProviderOptions
  ): ITTSProvider {
    switch (name) {
      case 'elevenlabs':
        return new ElevenLabsTTS(options);
      case 'google':
        return new GoogleTTS(options);
      case 'kokoro':
        // Kokoro는 ElevenLabs로 폴백 (음성 매핑 포함)
        console.warn('[Factory] Kokoro TTS not available, falling back to ElevenLabs');
        return new ElevenLabsTTS(options);
      default:
        throw new Error(`Unknown TTS provider: ${name}`);
    }
  }

  /**
   * Sound Effects Provider 생성
   */
  static createSoundEffectsProvider(
    name: SoundEffectsProviderName,
    options?: SoundEffectsProviderOptions
  ): ISoundEffectsProvider {
    switch (name) {
      case 'elevenlabs':
        return new ElevenLabsSoundEffects(options);
      case 'freesound':
        return new FreesoundSoundEffects(options);
      default:
        throw new Error(`Unknown Sound Effects provider: ${name}`);
    }
  }

  /**
   * BGM Provider 생성
   */
  static createBGMProvider(
    name: BGMProviderName,
    options?: BGMProviderOptions
  ): IBGMProvider {
    switch (name) {
      case 'loudly':
        return new LoudlyBGM(options);
      case 'local':
        // Local은 Loudly의 폴백 모드 사용
        return new LoudlyBGM({ ...options, apiKey: undefined });
      default:
        throw new Error(`Unknown BGM provider: ${name}`);
    }
  }

  /**
   * STT Provider 생성
   */
  static createSTTProvider(
    name: STTProviderName,
    options: STTProviderOptions
  ): ISTTProvider {
    switch (name) {
      case 'whisper':
        return new WhisperSTT(options);
      default:
        throw new Error(`Unknown STT provider: ${name}`);
    }
  }

  /**
   * 환경변수 기반 기본 TTS Provider 생성
   */
  static getDefaultTTSProvider(): ITTSProvider {
    if (process.env.ELEVENLABS_API_KEY) {
      return new ElevenLabsTTS();
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return new GoogleTTS();
    }
    throw new Error('No TTS provider configured. Set ELEVENLABS_API_KEY or GOOGLE_APPLICATION_CREDENTIALS');
  }

  /**
   * 환경변수 기반 기본 Sound Effects Provider 생성
   */
  static getDefaultSoundEffectsProvider(): ISoundEffectsProvider {
    if (process.env.ELEVENLABS_API_KEY) {
      return new ElevenLabsSoundEffects();
    }
    if (process.env.FREESOUND_API_KEY) {
      return new FreesoundSoundEffects();
    }
    throw new Error('No Sound Effects provider configured. Set ELEVENLABS_API_KEY or FREESOUND_API_KEY');
  }

  /**
   * 환경변수 기반 기본 BGM Provider 생성
   */
  static getDefaultBGMProvider(localMusicDir?: string): IBGMProvider {
    return new LoudlyBGM({ localMusicDir });
  }
}

export default AudioProviderFactory;
