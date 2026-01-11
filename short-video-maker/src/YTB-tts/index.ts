/**
 * YTB-TTS Module
 *
 * TTS, Sound Effects, BGM, STT 통합 오디오 모듈
 *
 * 사용 예시:
 * ```typescript
 * import { AudioProviderFactory, ElevenLabsTTS, GoogleTTS } from './YTB-tts';
 *
 * // Factory를 통한 생성
 * const tts = AudioProviderFactory.createTTSProvider('elevenlabs');
 * const sfx = AudioProviderFactory.createSoundEffectsProvider('freesound');
 * const bgm = AudioProviderFactory.createBGMProvider('loudly');
 *
 * // 직접 생성
 * const tts2 = new ElevenLabsTTS({ apiKey: 'xxx' });
 * const google = new GoogleTTS({ defaultLanguage: 'ko-KR' });
 * ```
 */

// ==================== Interfaces ====================
export * from './interfaces';

// ==================== Types ====================
export * from './types';

// ==================== Presets ====================
export * from './presets';

// ==================== Providers ====================
export * from './providers';

// ==================== Factories ====================
export * from './factories';
