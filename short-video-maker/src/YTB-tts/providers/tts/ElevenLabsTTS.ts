/**
 * ElevenLabs TTS Provider
 *
 * ElevenLabs API를 사용한 고품질 TTS 구현
 * ITTSProvider 인터페이스 구현
 */

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import * as fs from 'fs';
import * as path from 'path';
import { ITTSProvider, TTSVoice, TTSOptions, TTSResult } from '../../interfaces';
import { VoiceEnum, type Voices } from '../../../types/shorts';

// ElevenLabs Voice ID 매핑 (Kokoro 호환)
const VOICE_ID_MAP: Record<string, string> = {
  // Kokoro voices -> ElevenLabs voices
  'af_heart': 'EXAVITQu4vr4xnSDxMaL',      // Sarah
  'af_bella': 'EXAVITQu4vr4xnSDxMaL',      // Sarah
  'af_nicole': 'XrExE9yKIg1WjnnlVkGX',     // Matilda
  'af_sarah': 'EXAVITQu4vr4xnSDxMaL',      // Sarah
  'af_sky': 'jBpfuIE2acCO8z3wKNLl',        // Gigi
  'am_adam': 'pNInz6obpgDQGcFmaJgB',       // Adam
  'am_michael': 'flq6f7yk4E4fJM5XTYuZ',    // Michael
  'bf_emma': 'LcfcDJNUP1GQjkzn1xUU',       // Emily
  'bf_isabella': 'XrExE9yKIg1WjnnlVkGX',   // Matilda
  'bm_george': 'JBFqnCBsd6RMkjVDRZzb',     // George
  'bm_lewis': 'TX3LPaxmHKxFdv7VOQHJ',      // Liam
};

// Shorts에 최적화된 ElevenLabs 음성 프리셋
export const SHORTS_VOICE_PRESETS = {
  // 여성 음성
  ARFA: { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Arfa', description: '젊고 활기찬 여성' },
  MATILDA: { voiceId: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', description: '성숙하고 따뜻한 여성' },
  SARAH: { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: '자연스럽고 친근한 여성' },

  // 남성 음성
  AXL: { voiceId: 'iP95p4xoKVk53GoZ742B', name: 'Axl', description: '젊고 역동적인 남성' },
  ADAM: { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: '깊고 안정적인 남성' },
  GEORGE: { voiceId: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', description: '성숙하고 신뢰감 있는 남성' },

  // 특수 음성
  SHIMMER: { voiceId: 'N2lVS1w4EtoT3dr4eOWO', name: 'Shimmer', description: '부드럽고 감성적' },
  RIVER: { voiceId: 'SAz9YHcvj6GT2YYXdXww', name: 'River', description: '중성적이고 차분한' },
} as const;

export class ElevenLabsTTS implements ITTSProvider {
  readonly name = 'elevenlabs';
  private client: ElevenLabsClient;
  private defaultVoiceId: string;
  private defaultModel: string;

  constructor(options?: {
    apiKey?: string;
    defaultVoiceId?: string;
    defaultModel?: string;
  }) {
    const apiKey = options?.apiKey || process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY is required');
    }

    this.client = new ElevenLabsClient({ apiKey });
    this.defaultVoiceId = options?.defaultVoiceId || SHORTS_VOICE_PRESETS.SARAH.voiceId;
    this.defaultModel = options?.defaultModel || 'eleven_multilingual_v2';
  }

  /**
   * 사용 가능 여부 확인
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.voices.getAll();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 사용 가능한 음성 목록 조회
   */
  async getVoices(): Promise<TTSVoice[]> {
    try {
      const response = await this.client.voices.getAll();
      return response.voices.map((voice: any) => ({
        id: voice.voiceId || voice.voice_id,
        name: voice.name || 'Unknown',
        language: 'multi',  // ElevenLabs는 다국어 지원
        gender: this.inferGender(voice.name || ''),
        description: voice.description || undefined,
        previewUrl: voice.previewUrl || voice.preview_url || undefined,
      }));
    } catch (error) {
      console.error('[ElevenLabsTTS] Failed to get voices:', error);
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

    // Voice ID 결정 (kokoro voice mapping 포함)
    let voiceId = options?.voiceId || options?.voice || this.defaultVoiceId;
    if (voiceId && VOICE_ID_MAP[voiceId]) {
      voiceId = VOICE_ID_MAP[voiceId];
    }

    try {
      // 출력 디렉토리 생성
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // TTS 요청 (with timestamps for duration calculation)
      const sdkResponseRaw = await this.client.textToSpeech.convertWithTimestamps(voiceId, {
        text,
        modelId: options?.model || this.defaultModel,
      });

      // SDK response 구조 처리
      const response = (sdkResponseRaw as any).data || sdkResponseRaw;

      if (!response.audioBase64) {
        throw new Error('ElevenLabs response missing audioBase64 field');
      }

      // Base64를 파일로 저장
      const audioBuffer = Buffer.from(response.audioBase64, 'base64');
      fs.writeFileSync(outputPath, audioBuffer);

      // alignment 데이터에서 오디오 길이 계산
      let duration: number;
      if (response.alignment && response.alignment.characterEndTimesSeconds?.length > 0) {
        duration = Math.max(...response.alignment.characterEndTimesSeconds);
      } else {
        // fallback: ffprobe 또는 추정
        duration = await this.getAudioDuration(outputPath);
      }

      return {
        path: outputPath,
        duration,
        text,
        voiceId,
        model: options?.model || this.defaultModel,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[ElevenLabsTTS] Synthesis failed:', error);
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
   * Kokoro voice ID를 ElevenLabs voice ID로 변환
   */
  mapKokoroVoice(kokoroVoiceId: string): string {
    return VOICE_ID_MAP[kokoroVoiceId] || this.defaultVoiceId;
  }

  /**
   * 프리셋 음성 가져오기
   */
  getPresetVoice(presetName: keyof typeof SHORTS_VOICE_PRESETS): {
    voiceId: string;
    name: string;
    description: string;
  } {
    return SHORTS_VOICE_PRESETS[presetName];
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
      return stats.size / 16000; // 대략적인 추정
    }
  }

  /**
   * 음성 이름에서 성별 추론
   */
  private inferGender(name: string): 'male' | 'female' | 'neutral' {
    const femaleName = ['sarah', 'emily', 'matilda', 'gigi', 'bella', 'nicole', 'arfa'];
    const maleName = ['adam', 'michael', 'george', 'liam', 'axl', 'lewis'];

    const lowerName = name.toLowerCase();
    if (femaleName.some(n => lowerName.includes(n))) return 'female';
    if (maleName.some(n => lowerName.includes(n))) return 'male';
    return 'neutral';
  }

  // ==================== Backward Compatibility Methods ====================
  // 기존 코드와의 호환성을 위한 메서드들

  /**
   * 기존 인터페이스 호환 generate 메서드
   * TTSProvider.ts, ShortCreator.ts 등에서 사용하는 인터페이스
   *
   * @param text - 변환할 텍스트
   * @param voice - 음성 ID (Kokoro 스타일 또는 ElevenLabs voice ID)
   * @returns { audio: ArrayBuffer, audioLength: number, alignment?: {...} }
   */
  async generate(
    text: string,
    voice: string,
  ): Promise<{
    audio: ArrayBuffer;
    audioLength: number;
    alignment?: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  }> {
    // Voice ID 결정 (kokoro voice mapping 포함)
    let voiceId = voice || this.defaultVoiceId;
    if (voiceId && VOICE_ID_MAP[voiceId]) {
      voiceId = VOICE_ID_MAP[voiceId];
    }

    try {
      // TTS 요청 (with timestamps for duration calculation)
      const sdkResponseRaw = await this.client.textToSpeech.convertWithTimestamps(voiceId, {
        text,
        modelId: this.defaultModel,
      });

      // SDK response 구조 처리
      const response = (sdkResponseRaw as any).data || sdkResponseRaw;

      if (!response.audioBase64) {
        throw new Error('ElevenLabs response missing audioBase64 field');
      }

      // Base64를 ArrayBuffer로 변환
      const audioBuffer = Buffer.from(response.audioBase64, 'base64');
      const audioArrayBuffer = audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      );

      // alignment 데이터에서 오디오 길이 계산
      let audioLength: number;
      if (response.alignment && response.alignment.characterEndTimesSeconds?.length > 0) {
        audioLength = Math.max(...response.alignment.characterEndTimesSeconds);
      } else {
        // fallback: 파일 크기로 추정 (128kbps 기준)
        audioLength = (audioArrayBuffer.byteLength * 8) / 128000;
      }

      // SDK response를 기존 interface에 맞게 변환
      const alignmentConverted = response.alignment ? {
        characters: response.alignment.characters,
        character_start_times_seconds: response.alignment.characterStartTimesSeconds,
        character_end_times_seconds: response.alignment.characterEndTimesSeconds,
      } : undefined;

      console.log(`[ElevenLabsTTS] Generated audio: ${audioLength.toFixed(2)}s, ${audioArrayBuffer.byteLength} bytes`);

      return {
        audio: audioArrayBuffer,
        audioLength,
        alignment: alignmentConverted,
      };
    } catch (error) {
      console.error('[ElevenLabsTTS] Generate failed:', error);
      throw error;
    }
  }

  /**
   * 사용 가능한 음성 목록 (기존 호환)
   * Kokoro 스타일 음성 이름 반환
   */
  listAvailableVoices(): Voices[] {
    return Object.values(VoiceEnum) as Voices[];
  }

  /**
   * Factory method for backward compatibility
   * @param config - { apiKey?: string }
   */
  static async init(config?: { apiKey?: string }): Promise<ElevenLabsTTS> {
    const instance = new ElevenLabsTTS({
      apiKey: config?.apiKey,
    });

    // 초기화 확인
    const available = await instance.isAvailable();
    if (!available) {
      console.warn('[ElevenLabsTTS] API may not be available');
    }

    console.log('[ElevenLabsTTS] Initialized successfully');
    return instance;
  }
}

export default ElevenLabsTTS;
