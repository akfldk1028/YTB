/**
 * Loudly BGM API Client
 *
 * AI-powered background music generation using Loudly API.
 * Falls back to local BGM library when API is unavailable.
 *
 * Features:
 * - Text-to-Music generation
 * - Catalog search (3500+ tracks)
 * - Perpetual commercial license
 *
 * API Docs: https://loudly.com/developers
 */

import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../../logger';
import { MusicMoodEnum } from '../../../types/shorts';
import {
  LoudlyConfig,
  LoudlyGenerateRequest,
  LoudlyGenerateResponse,
  LoudlySearchRequest,
  LoudlyTrack,
  LoudlyPresets,
  LoudlyMood,
  BGMResult,
} from './types';

/**
 * Mood mapping: MusicMoodEnum → LoudlyMood
 */
const MoodToLoudlyMood: Record<string, LoudlyMood> = {
  [MusicMoodEnum.happy]: 'happy',
  [MusicMoodEnum.sad]: 'sad',
  [MusicMoodEnum.melancholic]: 'sad',
  [MusicMoodEnum.euphoric]: 'energetic',
  [MusicMoodEnum.excited]: 'energetic',
  [MusicMoodEnum.chill]: 'calm',
  [MusicMoodEnum.uneasy]: 'mysterious',
  [MusicMoodEnum.angry]: 'dramatic',
  [MusicMoodEnum.dark]: 'dark',
  [MusicMoodEnum.hopeful]: 'uplifting',
  [MusicMoodEnum.contemplative]: 'calm',
  [MusicMoodEnum.funny]: 'playful',
};

export class LoudlyBGM {
  private apiKey: string | null;
  private baseUrl: string;
  private localMusicDir: string;

  constructor(config?: LoudlyConfig, localMusicDir?: string) {
    this.apiKey = config?.apiKey || process.env.LOUDLY_API_KEY || null;
    this.baseUrl = config?.baseUrl || 'https://api.loudly.com/v1';
    this.localMusicDir = localMusicDir || path.join(process.cwd(), 'static', 'music');

    if (!this.apiKey) {
      logger.warn('Loudly API key not configured. Using local BGM fallback.');
    }
  }

  /**
   * Check if Loudly API is available
   */
  isApiAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Generate BGM from text prompt using Loudly AI
   */
  async generate(request: LoudlyGenerateRequest): Promise<BGMResult> {
    const startTime = Date.now();

    logger.info({
      prompt: request.prompt,
      duration: request.duration,
      mood: request.mood,
      genre: request.genre,
      apiAvailable: this.isApiAvailable(),
    }, '🎵 Generating BGM');

    // If API is not available, use local fallback
    if (!this.isApiAvailable()) {
      return this.generateFromLocal(request);
    }

    try {
      const response = await this.callGenerateApi(request);
      const audioBuffer = await this.downloadAudio(response.audioUrl);

      const elapsed = Date.now() - startTime;
      logger.info({
        trackId: response.id,
        title: response.title,
        duration: response.duration,
        elapsed: `${elapsed}ms`,
      }, '✅ BGM generated from Loudly');

      return {
        audio: audioBuffer,
        duration: response.duration,
        prompt: request.prompt,
        trackId: response.id,
        trackTitle: response.title,
        source: 'loudly',
        license: 'Loudly - Perpetual Commercial License',
      };
    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        prompt: request.prompt,
      }, '⚠️ Loudly API failed, falling back to local BGM');

      return this.generateFromLocal(request);
    }
  }

  /**
   * Generate BGM from preset
   */
  async generateFromPreset(
    preset: keyof typeof LoudlyPresets,
    duration?: number
  ): Promise<BGMResult> {
    const presetConfig = LoudlyPresets[preset];
    if (!presetConfig) {
      throw new Error(`Unknown preset: ${preset}`);
    }

    return this.generate({
      ...presetConfig,
      duration: duration || presetConfig.duration || 30,
    });
  }

  /**
   * Generate BGM for a specific mood
   */
  async generateForMood(
    mood: MusicMoodEnum | string,
    duration: number = 30
  ): Promise<BGMResult> {
    const loudlyMood = MoodToLoudlyMood[mood] || 'calm';

    return this.generate({
      prompt: `${loudlyMood} background music`,
      mood: loudlyMood,
      duration,
    });
  }

  /**
   * Search Loudly catalog
   */
  async search(request: LoudlySearchRequest): Promise<LoudlyTrack[]> {
    if (!this.isApiAvailable()) {
      logger.warn('Loudly API not available. Cannot search catalog.');
      return [];
    }

    logger.info({
      query: request.query,
      genre: request.genre,
      mood: request.mood,
    }, '🔍 Searching Loudly catalog');

    try {
      const params = new URLSearchParams();
      if (request.query) params.append('query', request.query);
      if (request.genre) params.append('genre', request.genre);
      if (request.mood) params.append('mood', request.mood);
      if (request.minDuration) params.append('min_duration', String(request.minDuration));
      if (request.maxDuration) params.append('max_duration', String(request.maxDuration));
      params.append('limit', String(request.limit || 10));
      if (request.offset) params.append('offset', String(request.offset));

      const response = await fetch(`${this.baseUrl}/tracks/search?${params}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Loudly API error: ${response.status}`);
      }

      const data = await response.json();
      return data.tracks || [];
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
      }, '❌ Loudly search failed');
      return [];
    }
  }

  /**
   * Download and get BGM from a specific track ID
   */
  async getTrack(trackId: string): Promise<BGMResult> {
    if (!this.isApiAvailable()) {
      throw new Error('Loudly API not available');
    }

    logger.info({ trackId }, '⬇️ Downloading track from Loudly');

    try {
      const response = await fetch(`${this.baseUrl}/tracks/${trackId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get track: ${response.status}`);
      }

      const track: LoudlyTrack = await response.json();
      const audioBuffer = await this.downloadAudio(track.audioUrl);

      return {
        audio: audioBuffer,
        duration: track.duration,
        prompt: track.title,
        trackId: track.id,
        trackTitle: track.title,
        source: 'loudly',
        license: 'Loudly - Perpetual Commercial License',
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        trackId,
      }, '❌ Failed to get track');
      throw error;
    }
  }

  // ==================== Private Methods ====================

  /**
   * Call Loudly Generate API
   */
  private async callGenerateApi(request: LoudlyGenerateRequest): Promise<LoudlyGenerateResponse> {
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        duration: request.duration || 30,
        genre: request.genre,
        mood: request.mood,
        tempo: request.tempo,
        energy: request.energy,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Loudly API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Download audio from URL
   */
  private async downloadAudio(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status}`);
    }
    return response.arrayBuffer();
  }

  /**
   * Generate BGM from local library (fallback)
   */
  private async generateFromLocal(request: LoudlyGenerateRequest): Promise<BGMResult> {
    logger.info({
      prompt: request.prompt,
      mood: request.mood,
      localDir: this.localMusicDir,
    }, '🎵 Using local BGM fallback');

    // Get local music files
    const musicFiles = await this.getLocalMusicFiles();

    if (musicFiles.length === 0) {
      throw new Error('No local BGM files available');
    }

    // Select music based on mood or randomly
    const selectedFile = this.selectLocalMusic(musicFiles, request.mood);

    // Read file
    const filePath = path.join(this.localMusicDir, selectedFile);
    const audioBuffer = await fs.readFile(filePath);

    // Get duration (approximate from file size, ~128kbps)
    const approximateDuration = Math.floor(audioBuffer.length / (128 * 1024 / 8));

    logger.info({
      file: selectedFile,
      duration: approximateDuration,
    }, '✅ Local BGM selected');

    return {
      audio: audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      ),
      duration: approximateDuration,
      prompt: request.prompt,
      trackTitle: selectedFile.replace('.mp3', ''),
      source: 'local',
      license: 'YouTube Audio Library - Free',
    };
  }

  /**
   * Get list of local music files
   */
  private async getLocalMusicFiles(): Promise<string[]> {
    try {
      if (!await fs.pathExists(this.localMusicDir)) {
        return [];
      }

      const files = await fs.readdir(this.localMusicDir);
      return files.filter(f => f.endsWith('.mp3'));
    } catch (error) {
      logger.error({ error }, 'Failed to read local music directory');
      return [];
    }
  }

  /**
   * Select local music based on mood
   */
  private selectLocalMusic(files: string[], mood?: LoudlyMood): string {
    // Mood-based keywords for matching
    const moodKeywords: Record<string, string[]> = {
      happy: ['happy', 'upbeat', 'fun', 'playing', 'animals'],
      sad: ['sad', 'melancholic', 'heartbeat', 'hopeless', 'remembering'],
      calm: ['chill', 'crystaline', 'contemplative', 'soliloquy'],
      energetic: ['champion', 'loud', 'engines', 'buckle'],
      dark: ['sinister', 'dark', 'night', 'hunt', 'curse', 'witches', 'phantom'],
      playful: ['banjo', 'seagull', 'baby', 'doops', 'quirky'],
      dramatic: ['dramatic', 'epic', 'traversing', 'phantom'],
      uplifting: ['hopeful', 'freedom', 'aurora', 'boulevard'],
      romantic: ['romantic', 'love', 'heart'],
      mysterious: ['jetski', 'uneasy', 'phantom'],
      nostalgic: ['remembering', 'soliloquy'],
      epic: ['traversing', 'hunt', 'sinister'],
      relaxing: ['chill', 'crystaline', 'cafecito', 'organic'],
      inspiring: ['hopeful', 'champion', 'freedom'],
    };

    if (mood && moodKeywords[mood]) {
      const keywords = moodKeywords[mood];
      const matchingFiles = files.filter(file =>
        keywords.some(keyword =>
          file.toLowerCase().includes(keyword.toLowerCase())
        )
      );

      if (matchingFiles.length > 0) {
        return matchingFiles[Math.floor(Math.random() * matchingFiles.length)];
      }
    }

    // Random selection if no mood match
    return files[Math.floor(Math.random() * files.length)];
  }
}

export default LoudlyBGM;
