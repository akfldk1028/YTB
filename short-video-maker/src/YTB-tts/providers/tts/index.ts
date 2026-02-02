/**
 * TTS Providers Export
 */

export { ElevenLabsTTS, SHORTS_VOICE_PRESETS } from './ElevenLabsTTS';
export { GoogleTTS, GOOGLE_VOICE_PRESETS } from './GoogleTTS';
export {
  GeminiTTS,
  // Voice 목록
  GEMINI_KOREAN_VOICES,
  GEMINI_ENGLISH_VOICES,
  GEMINI_VOICES_BY_LANGUAGE,
  DEFAULT_VOICE_BY_LANGUAGE,
  NEWS_SHORTS_RECOMMENDED,
  // 타입
  type GeminiLanguage,
  type GeminiVoiceGender,
  type GeminiTTSConfig,
  type GeminiTTSResult,
} from './GeminiTTS';
