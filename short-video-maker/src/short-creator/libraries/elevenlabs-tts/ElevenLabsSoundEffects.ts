import { logger } from '../../../config';

/**
 * ElevenLabs Sound Effects API
 *
 * Generates sound effects from text descriptions using ElevenLabs AI.
 * API: POST https://api.elevenlabs.io/v1/sound-generation
 *
 * Use cases:
 * - Background ambient sounds (rain, coffee shop, forest)
 * - Action sound effects (footsteps, door opening, typing)
 * - Scene transitions (whoosh, ding, pop)
 * - Emotional cues (dramatic music sting, happy jingle)
 */

export interface SoundEffectConfig {
  apiKey: string;
}

export interface SoundEffectRequest {
  /** Description of the sound effect to generate */
  text: string;
  /** Duration in seconds (0.5 to 22 seconds). If null, auto-determined */
  duration_seconds?: number | null;
  /** How much the prompt influences the output (0.0 to 1.0, default 0.3) */
  prompt_influence?: number;
}

export interface SoundEffectResult {
  /** Generated audio as ArrayBuffer */
  audio: ArrayBuffer;
  /** Duration of the audio in seconds */
  duration: number;
  /** Original prompt used */
  prompt: string;
}

/**
 * Common sound effect presets for video production
 */
export const SoundEffectPresets = {
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

  // Cat-themed (for cat shorts!)
  CAT_MEOW: 'Cute cat meow sound, soft and adorable',
  CAT_PURR: 'Cat purring contentedly, relaxing',
  CAT_HISS: 'Cat hissing sound, startled',
  CAT_PAW: 'Cat paw padding on floor, soft steps'
};

export class ElevenLabsSoundEffects {
  private apiKey: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor(config: SoundEffectConfig) {
    if (!config.apiKey) {
      throw new Error('ElevenLabs API key is required for Sound Effects');
    }
    this.apiKey = config.apiKey;
  }

  /**
   * Generate a sound effect from a text description
   */
  async generate(request: SoundEffectRequest): Promise<SoundEffectResult> {
    const startTime = Date.now();

    logger.info({
      prompt: request.text,
      duration: request.duration_seconds
    }, '🎵 Generating sound effect with ElevenLabs');

    try {
      const response = await fetch(`${this.baseUrl}/sound-generation`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: request.text,
          duration_seconds: request.duration_seconds ?? null,
          prompt_influence: request.prompt_influence ?? 0.3
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs Sound Effects API error: ${response.status} - ${errorText}`);
      }

      // Response is binary audio (application/octet-stream)
      const audioBuffer = await response.arrayBuffer();

      // Estimate duration (ElevenLabs returns MP3, typical bitrate ~128kbps)
      // More accurate: use ffprobe, but for now estimate from file size
      const estimatedDuration = request.duration_seconds ?? Math.max(1, audioBuffer.byteLength / 16000);

      const elapsed = Date.now() - startTime;
      logger.info({
        prompt: request.text,
        duration: estimatedDuration,
        audioSize: audioBuffer.byteLength,
        elapsed: `${elapsed}ms`
      }, '✅ Sound effect generated successfully');

      return {
        audio: audioBuffer,
        duration: estimatedDuration,
        prompt: request.text
      };
    } catch (error) {
      logger.error({ error, prompt: request.text }, '❌ Failed to generate sound effect');
      throw error;
    }
  }

  /**
   * Generate multiple sound effects in parallel
   */
  async generateMultiple(requests: SoundEffectRequest[]): Promise<SoundEffectResult[]> {
    logger.info({
      count: requests.length
    }, '🎵 Generating multiple sound effects');

    const results = await Promise.all(
      requests.map(req => this.generate(req))
    );

    logger.info({
      count: results.length,
      totalSize: results.reduce((sum, r) => sum + r.audio.byteLength, 0)
    }, '✅ All sound effects generated');

    return results;
  }

  /**
   * Generate a sound effect from a preset
   */
  async generateFromPreset(
    preset: keyof typeof SoundEffectPresets,
    durationSeconds?: number
  ): Promise<SoundEffectResult> {
    const promptText = SoundEffectPresets[preset];
    return this.generate({
      text: promptText,
      duration_seconds: durationSeconds ?? null
    });
  }

  /**
   * Generate ambient background sound (loopable)
   */
  async generateAmbience(
    description: string,
    durationSeconds: number = 10
  ): Promise<SoundEffectResult> {
    // Add "loopable" hint to prompt for better loop-friendly audio
    const prompt = `${description}, ambient, continuous, loopable background`;
    return this.generate({
      text: prompt,
      duration_seconds: Math.min(durationSeconds, 22), // Max 22 seconds
      prompt_influence: 0.4 // Slightly higher for ambience
    });
  }

  /**
   * Generate scene transition sound
   */
  async generateTransition(
    type: 'whoosh' | 'ding' | 'pop' | 'swipe' = 'whoosh'
  ): Promise<SoundEffectResult> {
    const presetMap: Record<string, keyof typeof SoundEffectPresets> = {
      whoosh: 'WHOOSH',
      ding: 'DING',
      pop: 'POP',
      swipe: 'SWIPE'
    };
    return this.generateFromPreset(presetMap[type], 1); // Short 1-second transition
  }
}

export default ElevenLabsSoundEffects;
