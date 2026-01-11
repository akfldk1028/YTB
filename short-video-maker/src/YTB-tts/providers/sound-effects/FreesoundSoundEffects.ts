/**
 * Freesound Sound Effects Provider
 *
 * Freesound.org API를 사용한 무료 효과음 (Creative Commons)
 * ISoundEffectsProvider 인터페이스 구현
 */

import * as fs from 'fs';
import * as path from 'path';
import { ISoundEffectsProvider, SoundEffectOptions, SoundEffectResult, SoundEffectPreset } from '../../interfaces';
import { ALL_PRESETS, getPresetById } from '../../presets';

// Freesound 검색 결과 타입
export interface FreesoundSearchResult {
  id: number;
  name: string;
  tags: string[];
  description: string;
  duration: number;
  previews: {
    'preview-hq-mp3': string;
    'preview-lq-mp3': string;
    'preview-hq-ogg': string;
    'preview-lq-ogg': string;
  };
  download: string;
  license: string;
  username: string;
}

// Freesound 전용 프리셋 (검색 쿼리)
export const FREESOUND_PRESETS: Record<string, string> = {
  // Transitions
  WHOOSH: 'whoosh transition fast',
  DING: 'notification ding bell',
  POP: 'pop bubble',
  SWIPE: 'swipe swoosh',

  // Emotions
  DRAMATIC_STING: 'dramatic orchestra hit',
  HAPPY_JINGLE: 'happy jingle short',
  SAD_PIANO: 'sad piano note',
  SUSPENSE: 'suspense tension drone',

  // Actions
  FOOTSTEPS: 'footsteps walking',
  DOOR_OPEN: 'door creak open',
  TYPING: 'keyboard typing',
  PHONE_BUZZ: 'phone vibrate notification',

  // Ambience
  RAIN: 'rain ambient gentle',
  COFFEE_SHOP: 'cafe ambience background',
  FOREST: 'forest birds ambient',
  CITY: 'city street traffic',

  // Cat-themed
  CAT_MEOW: 'cat meow cute',
  CAT_PURR: 'cat purring',
  CAT_HISS: 'cat hiss angry',
  CAT_PAW: 'cat footsteps',

  // Emotions/Reactions (CatProject 호환)
  LAUGH: 'laugh happy cute',
  SUCCESS: 'success celebration fanfare',
  MAGIC: 'magic sparkle fantasy',
  GASP: 'gasp surprised',
  AWW: 'aww cute adorable',
  CHEER: 'cheer celebration crowd',
};

export class FreesoundSoundEffects implements ISoundEffectsProvider {
  readonly name = 'freesound';
  private apiKey: string;
  private baseUrl = 'https://freesound.org/apiv2';

  constructor(options?: { apiKey?: string }) {
    const apiKey = options?.apiKey || process.env.FREESOUND_API_KEY;
    if (!apiKey) {
      throw new Error('Freesound API key is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * 사용 가능 여부 확인
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/search/text/?query=test&token=${this.apiKey}&page_size=1`
      );
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
    const query = preset?.query || FREESOUND_PRESETS[presetId];

    if (!query) {
      throw new Error(`Unknown preset: ${presetId}`);
    }

    return this.generateFromText(query, outputPath, {
      ...options,
      duration: options?.duration || preset?.duration,
    });
  }

  /**
   * 텍스트 설명으로 효과음 검색 및 다운로드
   */
  async generateFromText(
    description: string,
    outputPath: string,
    options?: SoundEffectOptions
  ): Promise<SoundEffectResult> {
    const startTime = Date.now();

    console.log(`[FreesoundSoundEffects] Searching: "${description}"`);

    try {
      // 출력 디렉토리 생성
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 검색
      const results = await this.search(description, options?.duration ? options.duration + 2 : 10);

      if (results.length === 0) {
        throw new Error(`No sounds found for query: "${description}"`);
      }

      // 최적 결과 선택 (평점 순)
      const bestMatch = results[0];

      // 프리뷰 다운로드
      const audioBuffer = await this.downloadPreview(bestMatch);
      fs.writeFileSync(outputPath, Buffer.from(audioBuffer));

      console.log(`[FreesoundSoundEffects] Downloaded: ${bestMatch.name} (${bestMatch.duration.toFixed(2)}s)`);

      return {
        path: outputPath,
        duration: bestMatch.duration,
        description,
        source: 'freesound',
        soundId: bestMatch.id,
        soundName: bestMatch.name,
        license: bestMatch.license,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[FreesoundSoundEffects] Generation failed:', error);
      throw error;
    }
  }

  /**
   * Freesound 검색
   */
  async search(query: string, maxDuration?: number): Promise<FreesoundSearchResult[]> {
    const params = new URLSearchParams({
      query,
      token: this.apiKey,
      fields: 'id,name,tags,description,duration,previews,download,license,username',
      page_size: '5',
      sort: 'rating_desc',
    });

    if (maxDuration) {
      params.append('filter', `duration:[0 TO ${maxDuration}]`);
    }

    try {
      const response = await fetch(`${this.baseUrl}/search/text/?${params}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Freesound API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('[FreesoundSoundEffects] Search failed:', error);
      throw error;
    }
  }

  /**
   * 프리뷰 다운로드 (OAuth 불필요)
   */
  async downloadPreview(sound: FreesoundSearchResult): Promise<ArrayBuffer> {
    const previewUrl = sound.previews['preview-hq-mp3'];

    try {
      const response = await fetch(previewUrl);

      if (!response.ok) {
        throw new Error(`Failed to download preview: ${response.status}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.error('[FreesoundSoundEffects] Download failed:', error);
      throw error;
    }
  }

  /**
   * Ambient 배경음 검색
   */
  async generateAmbience(
    description: string,
    outputPath: string,
    durationSeconds: number = 10
  ): Promise<SoundEffectResult> {
    const query = `${description} ambient background loop`;
    return this.generateFromText(query, outputPath, {
      duration: durationSeconds,
    });
  }

  /**
   * 장면 전환 효과음 검색
   * - outputPath 있으면: 파일 저장, SoundEffectResult 반환
   * - outputPath 없으면: ArrayBuffer 반환 (기존 인터페이스)
   */
  async generateTransition(
    type: 'whoosh' | 'ding' | 'pop' | 'swipe',
    outputPath?: string
  ): Promise<any> {
    const presetMap: Record<string, string> = {
      whoosh: 'WHOOSH',
      ding: 'DING',
      pop: 'POP',
      swipe: 'SWIPE',
    };

    // outputPath가 있으면 새 인터페이스 (파일 저장)
    if (outputPath) {
      return this.generateFromPreset(presetMap[type], outputPath, { duration: 2 });
    }

    // outputPath가 없으면 기존 인터페이스 (ArrayBuffer 반환)
    const query = FREESOUND_PRESETS[presetMap[type]];
    return this.generate({ text: query, duration_seconds: 2 });
  }

  /**
   * 여러 효과음 동시 검색 및 다운로드
   */
  async generateMultiple(
    requests: Array<{ description: string; outputPath: string; options?: SoundEffectOptions }>
  ): Promise<SoundEffectResult[]> {
    console.log(`[FreesoundSoundEffects] Generating ${requests.length} sound effects`);

    const results = await Promise.all(
      requests.map((req) =>
        this.generateFromText(req.description, req.outputPath, req.options).catch((err) => {
          console.warn(`[FreesoundSoundEffects] Failed: ${req.description}`, err.message);
          return null;
        })
      )
    );

    return results.filter((r): r is SoundEffectResult => r !== null);
  }

  // ============================================================================
  // Backward Compatibility Methods (기존 인터페이스 지원)
  // ============================================================================

  /**
   * 기존 인터페이스 호환용 generate 메서드
   * @param request { text: string; duration_seconds?: number | null }
   * @returns { audio: ArrayBuffer, duration, prompt, soundId, soundName, license }
   */
  async generate(
    request: { text: string; duration_seconds?: number | null }
  ): Promise<LegacySoundEffectResult> {
    console.log(`[FreesoundSoundEffects] Generating (legacy): "${request.text}"`);

    try {
      // 검색
      const results = await this.search(
        request.text,
        request.duration_seconds ? request.duration_seconds + 2 : 10
      );

      if (results.length === 0) {
        throw new Error(`No sounds found for query: "${request.text}"`);
      }

      // 최적 결과 선택
      const bestMatch = results[0];

      // 프리뷰 다운로드
      const audioBuffer = await this.downloadPreview(bestMatch);

      console.log(`[FreesoundSoundEffects] Downloaded (legacy): ${bestMatch.name} (${bestMatch.duration.toFixed(2)}s)`);

      return {
        audio: audioBuffer,
        duration: bestMatch.duration,
        prompt: request.text,
        soundId: bestMatch.id,
        soundName: bestMatch.name,
        license: bestMatch.license
      };
    } catch (error) {
      console.error('[FreesoundSoundEffects] Generation failed:', error);
      throw error;
    }
  }
}

/**
 * 기존 인터페이스 호환용 SoundEffectResult
 * 원본 FreesoundSoundEffects가 반환하던 형태
 */
export interface LegacySoundEffectResult {
  audio: ArrayBuffer;
  duration: number;
  prompt: string;
  soundId?: number;
  soundName?: string;
  license?: string;
}

export default FreesoundSoundEffects;
