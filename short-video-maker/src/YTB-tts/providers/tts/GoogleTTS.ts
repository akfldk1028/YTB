/**
 * Google Cloud TTS Provider
 *
 * Google Cloud Text-to-Speech API를 사용한 TTS 구현
 * ITTSProvider 인터페이스 구현
 */

import * as textToSpeech from '@google-cloud/text-to-speech';
import * as fs from 'fs';
import * as path from 'path';
import { ITTSProvider, TTSVoice, TTSOptions, TTSResult } from '../../interfaces';
import { VoiceEnum, type Voices } from '../../../types/shorts';

// Google TTS 음성 프리셋
export const GOOGLE_VOICE_PRESETS = {
  // 한국어 음성
  KO_FEMALE_A: { name: 'ko-KR-Neural2-A', language: 'ko-KR', gender: 'female' as const },
  KO_FEMALE_B: { name: 'ko-KR-Neural2-B', language: 'ko-KR', gender: 'female' as const },
  KO_MALE_C: { name: 'ko-KR-Neural2-C', language: 'ko-KR', gender: 'male' as const },
  KO_STUDIO_A: { name: 'ko-KR-Studio-A', language: 'ko-KR', gender: 'female' as const },
  KO_STUDIO_B: { name: 'ko-KR-Studio-B', language: 'ko-KR', gender: 'male' as const },

  // 일본어 음성
  JA_FEMALE_A: { name: 'ja-JP-Neural2-B', language: 'ja-JP', gender: 'female' as const },
  JA_MALE_C: { name: 'ja-JP-Neural2-C', language: 'ja-JP', gender: 'male' as const },
  JA_FEMALE_D: { name: 'ja-JP-Neural2-D', language: 'ja-JP', gender: 'female' as const },

  // 영어 음성
  EN_FEMALE_A: { name: 'en-US-Neural2-C', language: 'en-US', gender: 'female' as const },
  EN_MALE_D: { name: 'en-US-Neural2-D', language: 'en-US', gender: 'male' as const },
  EN_FEMALE_E: { name: 'en-US-Neural2-E', language: 'en-US', gender: 'female' as const },
  EN_FEMALE_F: { name: 'en-US-Neural2-F', language: 'en-US', gender: 'female' as const },
  EN_MALE_J: { name: 'en-US-Neural2-J', language: 'en-US', gender: 'male' as const },
} as const;

// 언어 코드 매핑
const LANGUAGE_MAP: Record<string, string> = {
  ko: 'ko-KR',
  ja: 'ja-JP',
  en: 'en-US',
  zh: 'cmn-CN',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
};

export class GoogleTTS implements ITTSProvider {
  readonly name = 'google';
  private client: textToSpeech.TextToSpeechClient;
  private defaultLanguage: string;
  private defaultVoice: string;

  constructor(options?: {
    defaultLanguage?: string;
    defaultVoice?: string;
  }) {
    this.client = new textToSpeech.TextToSpeechClient();
    this.defaultLanguage = options?.defaultLanguage || 'ko-KR';
    this.defaultVoice = options?.defaultVoice || GOOGLE_VOICE_PRESETS.KO_FEMALE_A.name;
  }

  /**
   * 사용 가능 여부 확인
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.listVoices({ languageCode: 'ko-KR' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 사용 가능한 음성 목록 조회
   */
  async getVoices(languageCode?: string): Promise<TTSVoice[]> {
    try {
      const [response] = await this.client.listVoices({
        languageCode: languageCode || undefined,
      });

      return (response.voices || []).map(voice => ({
        id: voice.name || '',
        name: voice.name || '',
        language: voice.languageCodes?.[0] || 'unknown',
        gender: this.mapSsmlGender(voice.ssmlGender),
        description: `${voice.name} (${voice.languageCodes?.join(', ')})`,
      }));
    } catch (error) {
      console.error('[GoogleTTS] Failed to get voices:', error);
      return [];
    }
  }

  /**
   * 텍스트를 음성으로 변환
   */
  async synthesize(
    text: string,
    outputPath: string,
    options?: TTSOptions
  ): Promise<TTSResult> {
    const startTime = Date.now();

    try {
      // 출력 디렉토리 생성
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 언어 코드 결정
      const languageCode = this.resolveLanguageCode(options?.language);
      const voiceName = options?.voiceId || this.getDefaultVoiceForLanguage(languageCode);

      // TTS 요청
      const [response] = await this.client.synthesizeSpeech({
        input: { text },
        voice: {
          languageCode,
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: options?.speed || 1.0,
          pitch: options?.pitch || 0,
          volumeGainDb: options?.volumeGainDb || 0,
          effectsProfileId: options?.effectsProfileId || ['small-bluetooth-speaker-class-device'],
        },
      });

      // 오디오 저장
      if (response.audioContent) {
        fs.writeFileSync(outputPath, response.audioContent);
      } else {
        throw new Error('No audio content received');
      }

      // 오디오 길이 계산
      const duration = await this.getAudioDuration(outputPath);

      return {
        path: outputPath,
        duration,
        text,
        voiceId: voiceName,
        language: languageCode,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[GoogleTTS] Synthesis failed:', error);
      throw error;
    }
  }

  /**
   * 배치 합성 (여러 텍스트 한번에 처리)
   */
  async synthesizeBatch(
    texts: string[],
    outputDir: string,
    options?: TTSOptions
  ): Promise<TTSResult[]> {
    const results: TTSResult[] = [];

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (let i = 0; i < texts.length; i++) {
      const outputPath = path.join(outputDir, `audio_${i.toString().padStart(3, '0')}.mp3`);
      const result = await this.synthesize(texts[i], outputPath, options);
      results.push(result);
    }

    return results;
  }

  /**
   * SSML 텍스트를 음성으로 변환
   */
  async synthesizeSSML(
    ssml: string,
    outputPath: string,
    options?: TTSOptions
  ): Promise<TTSResult> {
    const startTime = Date.now();

    try {
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const languageCode = this.resolveLanguageCode(options?.language);
      const voiceName = options?.voiceId || this.getDefaultVoiceForLanguage(languageCode);

      const [response] = await this.client.synthesizeSpeech({
        input: { ssml },
        voice: {
          languageCode,
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: options?.speed || 1.0,
          pitch: options?.pitch || 0,
        },
      });

      if (response.audioContent) {
        fs.writeFileSync(outputPath, response.audioContent);
      } else {
        throw new Error('No audio content received');
      }

      const duration = await this.getAudioDuration(outputPath);

      return {
        path: outputPath,
        duration,
        text: ssml,
        voiceId: voiceName,
        language: languageCode,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[GoogleTTS] SSML Synthesis failed:', error);
      throw error;
    }
  }

  /**
   * 프리셋 음성 가져오기
   */
  getPresetVoice(presetName: keyof typeof GOOGLE_VOICE_PRESETS): {
    name: string;
    language: string;
    gender: 'male' | 'female';
  } {
    return GOOGLE_VOICE_PRESETS[presetName];
  }

  /**
   * 언어 코드 해석
   */
  private resolveLanguageCode(language?: string): string {
    if (!language) return this.defaultLanguage;
    return LANGUAGE_MAP[language.toLowerCase()] || language;
  }

  /**
   * 언어별 기본 음성 반환
   */
  private getDefaultVoiceForLanguage(languageCode: string): string {
    const voiceMap: Record<string, string> = {
      'ko-KR': GOOGLE_VOICE_PRESETS.KO_FEMALE_A.name,
      'ja-JP': GOOGLE_VOICE_PRESETS.JA_FEMALE_A.name,
      'en-US': GOOGLE_VOICE_PRESETS.EN_FEMALE_A.name,
    };
    return voiceMap[languageCode] || this.defaultVoice;
  }

  /**
   * SSML 성별을 문자열로 변환
   */
  private mapSsmlGender(ssmlGender: number | string | null | undefined): 'male' | 'female' | 'neutral' {
    if (ssmlGender === 1 || ssmlGender === 'MALE') return 'male';
    if (ssmlGender === 2 || ssmlGender === 'FEMALE') return 'female';
    return 'neutral';
  }

  /**
   * 오디오 파일 길이 계산
   */
  private async getAudioDuration(filePath: string): Promise<number> {
    try {
      const { execSync } = require('child_process');
      const result = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
        { encoding: 'utf-8' }
      );
      return parseFloat(result.trim());
    } catch {
      // ffprobe 실패시 대략적인 계산
      const stats = fs.statSync(filePath);
      return stats.size / 16000;
    }
  }

  // ==================== Backward Compatibility Methods ====================
  // 기존 코드와의 호환성을 위한 메서드들

  /**
   * 기존 인터페이스 호환 generate 메서드
   * TTSProvider.ts, ShortCreator.ts 등에서 사용하는 인터페이스
   *
   * @param text - 변환할 텍스트
   * @param voice - 음성 ID (Kokoro 스타일 또는 Google voice name)
   * @returns { audio: ArrayBuffer, audioLength: number }
   */
  async generate(
    text: string,
    voice: string,
  ): Promise<{
    audio: ArrayBuffer;
    audioLength: number;
  }> {
    // Kokoro voice를 Google voice로 매핑
    const googleVoice = this.mapKokoroToGoogleVoice(voice);
    const languageCode = googleVoice.languageCode;
    const voiceName = googleVoice.name;

    try {
      // TTS 요청 (LINEAR16 형식으로 ArrayBuffer 반환)
      const [response] = await this.client.synthesizeSpeech({
        input: { text },
        voice: {
          languageCode,
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: 'LINEAR16',
          sampleRateHertz: 16000, // Whisper와 호환을 위해 16kHz 사용
        },
      });

      if (!response.audioContent) {
        throw new Error('No audio content received from Google TTS');
      }

      // 오디오 길이 계산 (16kHz, 16-bit PCM 기준)
      const audioBuffer = Buffer.from(response.audioContent as Uint8Array);
      const audioArrayBuffer = audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      );
      const audioLength = audioArrayBuffer.byteLength / (16000 * 2); // 초 단위

      console.log(`[GoogleTTS] Generated audio: ${audioLength.toFixed(2)}s, ${audioArrayBuffer.byteLength} bytes`);

      return {
        audio: audioArrayBuffer,
        audioLength,
      };
    } catch (error) {
      console.error('[GoogleTTS] Generate failed:', error);
      throw error;
    }
  }

  /**
   * Kokoro voice ID를 Google voice로 매핑
   * 🔥 FIX: 이미 Google TTS 형식인 voice는 그대로 사용
   */
  private mapKokoroToGoogleVoice(voiceInput: string): { languageCode: string; name: string } {
    // 🔥 이미 Google TTS voice 형식이면 그대로 사용 (ko-KR-*, en-US-*, ja-JP-* 등)
    const googleVoicePattern = /^([a-z]{2}-[A-Z]{2})-(.+)$/;
    const match = voiceInput.match(googleVoicePattern);
    if (match) {
      const languageCode = match[1];  // 예: 'ko-KR'
      console.log(`[GoogleTTS] Using direct Google TTS voice: ${voiceInput} (language: ${languageCode})`);
      return { languageCode, name: voiceInput };
    }

    // Kokoro 음성을 Google TTS 음성으로 매핑 (legacy)
    const voiceMap: Record<string, { languageCode: string; name: string }> = {
      // Female voices
      'af_heart': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B' },
      'af_alloy': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B' },
      'af_aoede': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B' },
      'af_bella': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B' },
      'af_jessica': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B' },
      'af_kore': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B' },
      'af_nicole': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B' },
      'af_nova': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B' },
      'af_river': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B' },
      'af_sarah': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B' },
      'af_sky': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B' },
      'bf_emma': { languageCode: 'en-US', name: 'en-US-Neural2-C' },
      'bf_isabella': { languageCode: 'en-US', name: 'en-US-Neural2-E' },
      'bf_alice': { languageCode: 'en-GB', name: 'en-GB-Neural2-A' },
      'bf_lily': { languageCode: 'en-US', name: 'en-US-Neural2-F' },

      // Male voices
      'am_adam': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-C' },
      'am_echo': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-C' },
      'am_eric': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-C' },
      'am_fenrir': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-C' },
      'am_liam': { languageCode: 'en-US', name: 'en-US-Neural2-D' },
      'am_michael': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-C' },
      'am_onyx': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-C' },
      'am_puck': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-C' },
      'am_santa': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-C' },
      'bm_george': { languageCode: 'en-GB', name: 'en-GB-Neural2-B' },
      'bm_lewis': { languageCode: 'en-GB', name: 'en-GB-Neural2-D' },
      'bm_daniel': { languageCode: 'en-GB', name: 'en-GB-Neural2-B' },
      'bm_fable': { languageCode: 'en-US', name: 'en-US-Neural2-J' },
    };

    const mappedVoice = voiceMap[voiceInput];
    if (mappedVoice) {
      return mappedVoice;
    }

    // 🔥 FIX: 기본값으로 Neural2-B 사용 (Neural2-A 금지!)
    console.warn(`[GoogleTTS] Unknown voice "${voiceInput}", using Neural2-B as default`);
    return { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B' };
  }

  /**
   * 사용 가능한 음성 목록 (기존 호환)
   */
  listAvailableVoices(): Voices[] {
    return Object.values(VoiceEnum) as Voices[];
  }

  /**
   * Factory method for backward compatibility
   */
  static async init(config?: { projectId?: string; keyFilename?: string }): Promise<GoogleTTS> {
    const instance = new GoogleTTS({
      defaultLanguage: 'ko-KR',
    });

    // 초기화 확인
    const available = await instance.isAvailable();
    if (!available) {
      console.warn('[GoogleTTS] API may not be available');
    }

    console.log('[GoogleTTS] Initialized successfully');
    return instance;
  }
}

export default GoogleTTS;
