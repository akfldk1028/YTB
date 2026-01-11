/**
 * ElevenLabs Sound Effects Provider
 *
 * ElevenLabs AI를 사용한 효과음 생성
 * ISoundEffectsProvider 인터페이스 구현
 */

import * as fs from 'fs';
import * as path from 'path';
import { ISoundEffectsProvider, SoundEffectOptions, SoundEffectResult, SoundEffectPreset } from '../../interfaces';
import { ALL_PRESETS, getPresetById } from '../../presets';

// ElevenLabs 전용 프리셋 (텍스트 설명)
export const ELEVENLABS_PRESETS: Record<string, string> = {
  // Transitions
  WHOOSH: 'Quick whoosh sound transition, smooth and dynamic',
  DING: 'Soft notification ding, pleasant and clear',
  POP: 'Soft pop sound, playful and light',
  SWIPE: 'Fast swipe transition sound',

  // Emotions
  DRAMATIC_STING: 'Dramatic music sting, tension building',
  HAPPY_JINGLE: 'Short happy jingle, upbeat and cheerful',
  SAD_PIANO: 'Melancholic piano note, emotional',
  SUSPENSE: 'Suspenseful low drone, mysterious',

  // Actions
  FOOTSTEPS: 'Footsteps on wooden floor, gentle walking',
  DOOR_OPEN: 'Door creaking open slowly',
  TYPING: 'Keyboard typing sounds, mechanical',
  PHONE_BUZZ: 'Phone vibration notification',

  // Ambience
  RAIN: 'Gentle rain falling, calming ambience',
  COFFEE_SHOP: 'Coffee shop background ambience, murmurs and cups',
  FOREST: 'Forest ambience with birds chirping',
  CITY: 'City street ambience, cars and people',

  // Cat-themed
  CAT_MEOW: 'Cute cat meow sound, soft and adorable',
  CAT_PURR: 'Cat purring contentedly, relaxing',
  CAT_HISS: 'Cat hissing sound, startled',
  CAT_PAW: 'Cat paw padding on floor, soft steps',
};

export class ElevenLabsSoundEffects implements ISoundEffectsProvider {
  readonly name = 'elevenlabs';
  private apiKey: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor(options?: { apiKey?: string }) {
    const apiKey = options?.apiKey || process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ElevenLabs API key is required for Sound Effects');
    }
    this.apiKey = apiKey;
  }

  /**
   * 사용 가능 여부 확인
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Simple API check
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'xi-api-key': this.apiKey },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 지원하는 프리셋 목록
   */
  getPresets(): SoundEffectPreset[] {
    return ALL_PRESETS;
  }

  /**
   * 프리셋 ID로 효과음 생성
   */
  async generateFromPreset(
    presetId: string,
    outputPath: string,
    options?: SoundEffectOptions
  ): Promise<SoundEffectResult> {
    // 공통 프리셋에서 검색
    const preset = getPresetById(presetId);
    const query = preset?.query || ELEVENLABS_PRESETS[presetId];

    if (!query) {
      throw new Error(`Unknown preset: ${presetId}`);
    }

    return this.generateFromText(query, outputPath, {
      ...options,
      duration: options?.duration || preset?.duration,
    });
  }

  /**
   * 텍스트 설명으로 효과음 생성
   */
  async generateFromText(
    description: string,
    outputPath: string,
    options?: SoundEffectOptions
  ): Promise<SoundEffectResult> {
    const startTime = Date.now();

    console.log(`[ElevenLabsSoundEffects] Generating: "${description}"`);

    try {
      // 출력 디렉토리 생성
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // API 요청
      const response = await fetch(`${this.baseUrl}/sound-generation`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: description,
          duration_seconds: options?.duration ?? null,
          prompt_influence: options?.promptInfluence ?? 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs Sound Effects API error: ${response.status} - ${errorText}`);
      }

      // 오디오 저장
      const audioBuffer = await response.arrayBuffer();
      fs.writeFileSync(outputPath, Buffer.from(audioBuffer));

      // 실제 오디오 길이 계산
      const duration = await this.getAudioDuration(outputPath);

      console.log(`[ElevenLabsSoundEffects] Generated: ${outputPath} (${duration.toFixed(2)}s)`);

      return {
        path: outputPath,
        duration,
        description,
        source: 'elevenlabs',
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[ElevenLabsSoundEffects] Generation failed:', error);
      throw error;
    }
  }

  /**
   * Ambient 배경음 생성 (루프 가능)
   */
  async generateAmbience(
    description: string,
    outputPath: string,
    durationSeconds: number = 10
  ): Promise<SoundEffectResult> {
    const prompt = `${description}, ambient, continuous, loopable background`;
    return this.generateFromText(prompt, outputPath, {
      duration: Math.min(durationSeconds, 22), // Max 22 seconds
      promptInfluence: 0.4,
    });
  }

  /**
   * 장면 전환 효과음 생성
   */
  async generateTransition(
    type: 'whoosh' | 'ding' | 'pop' | 'swipe',
    outputPath: string
  ): Promise<SoundEffectResult> {
    const presetMap: Record<string, string> = {
      whoosh: 'WHOOSH',
      ding: 'DING',
      pop: 'POP',
      swipe: 'SWIPE',
    };
    return this.generateFromPreset(presetMap[type], outputPath, { duration: 1 });
  }

  /**
   * 여러 효과음 동시 생성
   */
  async generateMultiple(
    requests: Array<{ description: string; outputPath: string; options?: SoundEffectOptions }>
  ): Promise<SoundEffectResult[]> {
    console.log(`[ElevenLabsSoundEffects] Generating ${requests.length} sound effects`);

    const results = await Promise.all(
      requests.map((req) => this.generateFromText(req.description, req.outputPath, req.options))
    );

    return results;
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
}

export default ElevenLabsSoundEffects;
