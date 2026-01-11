import { logger } from '../../../config';

/**
 * Freesound Sound Effects API
 *
 * Free sound effects from Freesound.org (Creative Commons)
 * API: https://freesound.org/docs/api/
 *
 * Use cases:
 * - Background ambient sounds (rain, coffee shop, forest)
 * - Action sound effects (footsteps, door opening, typing)
 * - Scene transitions (whoosh, ding, pop)
 * - Animal sounds (cat meow, purr, etc.)
 */

export interface FreesoundConfig {
  apiKey: string;
  clientId?: string;
}

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

export interface SoundEffectResult {
  audio: ArrayBuffer;
  duration: number;
  prompt: string;
  soundId?: number;
  soundName?: string;
  license?: string;
}

/**
 * Preset sound effect queries for common use cases
 */
export const FreesoundPresets: Record<string, string> = {
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
  CHEER: 'cheer celebration crowd'
};

export class FreesoundSoundEffects {
  private apiKey: string;
  private baseUrl = 'https://freesound.org/apiv2';

  constructor(config: FreesoundConfig) {
    if (!config.apiKey) {
      throw new Error('Freesound API key is required');
    }
    this.apiKey = config.apiKey;
  }

  /**
   * Search for sounds on Freesound
   */
  async search(query: string, maxDuration?: number): Promise<FreesoundSearchResult[]> {
    logger.info({ query, maxDuration }, '🔍 Searching Freesound');

    const params = new URLSearchParams({
      query,
      token: this.apiKey,
      fields: 'id,name,tags,description,duration,previews,download,license,username',
      page_size: '5',
      sort: 'rating_desc'
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

      logger.info({
        query,
        resultCount: data.results?.length || 0
      }, '✅ Freesound search completed');

      return data.results || [];
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        query
      }, '❌ Freesound search failed');
      throw error;
    }
  }

  /**
   * Download a sound preview (no OAuth required)
   */
  async downloadPreview(sound: FreesoundSearchResult): Promise<ArrayBuffer> {
    const previewUrl = sound.previews['preview-hq-mp3'];

    logger.info({
      soundId: sound.id,
      name: sound.name,
      url: previewUrl
    }, '⬇️ Downloading sound preview');

    try {
      const response = await fetch(previewUrl);

      if (!response.ok) {
        throw new Error(`Failed to download preview: ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();

      logger.info({
        soundId: sound.id,
        size: audioBuffer.byteLength
      }, '✅ Sound preview downloaded');

      return audioBuffer;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        soundId: sound.id
      }, '❌ Preview download failed');
      throw error;
    }
  }

  /**
   * Generate (search and download) a sound effect from a text description
   * Compatible with ElevenLabs interface
   */
  async generate(request: { text: string; duration_seconds?: number | null }): Promise<SoundEffectResult> {
    const startTime = Date.now();

    logger.info({
      prompt: request.text,
      maxDuration: request.duration_seconds
    }, '🎵 Generating sound effect with Freesound');

    try {
      // Search for matching sounds
      const results = await this.search(
        request.text,
        request.duration_seconds ? request.duration_seconds + 2 : 10 // Add buffer for duration filter
      );

      if (results.length === 0) {
        throw new Error(`No sounds found for query: "${request.text}"`);
      }

      // Pick the best match (first result, sorted by rating)
      const bestMatch = results[0];

      // Download the preview
      const audioBuffer = await this.downloadPreview(bestMatch);

      const elapsed = Date.now() - startTime;
      logger.info({
        prompt: request.text,
        soundId: bestMatch.id,
        soundName: bestMatch.name,
        duration: bestMatch.duration,
        elapsed: `${elapsed}ms`
      }, '✅ Sound effect generated successfully');

      return {
        audio: audioBuffer,
        duration: bestMatch.duration,
        prompt: request.text,
        soundId: bestMatch.id,
        soundName: bestMatch.name,
        license: bestMatch.license
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        prompt: request.text
      }, '❌ Failed to generate sound effect');
      throw error;
    }
  }

  /**
   * Generate multiple sound effects in parallel
   */
  async generateMultiple(requests: { text: string; duration_seconds?: number | null }[]): Promise<SoundEffectResult[]> {
    logger.info({ count: requests.length }, '🎵 Generating multiple sound effects');

    const results = await Promise.all(
      requests.map(req => this.generate(req).catch(err => {
        logger.warn({ prompt: req.text, error: err.message }, '⚠️ Sound effect failed, skipping');
        return null;
      }))
    );

    const successfulResults = results.filter((r): r is SoundEffectResult => r !== null);

    logger.info({
      requested: requests.length,
      successful: successfulResults.length
    }, '✅ Multiple sound effects generated');

    return successfulResults;
  }

  /**
   * Generate a sound effect from a preset
   */
  async generateFromPreset(
    preset: keyof typeof FreesoundPresets,
    durationSeconds?: number
  ): Promise<SoundEffectResult> {
    const query = FreesoundPresets[preset];
    if (!query) {
      throw new Error(`Unknown preset: ${preset}`);
    }
    return this.generate({
      text: query,
      duration_seconds: durationSeconds ?? null
    });
  }

  /**
   * Generate ambient background sound
   */
  async generateAmbience(
    description: string,
    durationSeconds: number = 10
  ): Promise<SoundEffectResult> {
    const query = `${description} ambient background loop`;
    return this.generate({
      text: query,
      duration_seconds: durationSeconds
    });
  }

  /**
   * Generate scene transition sound
   */
  async generateTransition(
    type: 'whoosh' | 'ding' | 'pop' | 'swipe' = 'whoosh'
  ): Promise<SoundEffectResult> {
    const presetMap: Record<string, keyof typeof FreesoundPresets> = {
      whoosh: 'WHOOSH',
      ding: 'DING',
      pop: 'POP',
      swipe: 'SWIPE'
    };
    return this.generateFromPreset(presetMap[type], 2);
  }
}

export default FreesoundSoundEffects;
