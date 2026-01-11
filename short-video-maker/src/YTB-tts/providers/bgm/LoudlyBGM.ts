/**
 * Loudly BGM Provider
 *
 * AI-powered background music generation using Loudly API.
 * Falls back to local BGM library when API is unavailable.
 * IBGMProvider 인터페이스 구현
 */

import * as path from 'path';
import * as fs from 'fs';
import { IBGMProvider, BGMOptions, BGMResult, BGMGenre, BGMMood } from '../../interfaces';
import {
  LoudlyConfig,
  LoudlyGenerateRequest,
  LoudlyGenerateResponse,
  LoudlySearchRequest,
  LoudlyTrack,
  LoudlyMood,
  LOUDLY_PRESETS,
} from './types';

// MusicMoodEnum → LoudlyMood 매핑
const MoodToLoudlyMood: Record<string, LoudlyMood> = {
  happy: 'happy',
  sad: 'sad',
  melancholic: 'sad',
  euphoric: 'energetic',
  excited: 'energetic',
  chill: 'calm',
  uneasy: 'mysterious',
  angry: 'dramatic',
  dark: 'dark',
  hopeful: 'uplifting',
  contemplative: 'calm',
  funny: 'playful',
};

export class LoudlyBGM implements IBGMProvider {
  readonly name = 'loudly';
  private apiKey: string | null;
  private baseUrl: string;
  private localMusicDir: string;

  constructor(options?: {
    apiKey?: string;
    baseUrl?: string;
    localMusicDir?: string;
  }) {
    this.apiKey = options?.apiKey || process.env.LOUDLY_API_KEY || null;
    this.baseUrl = options?.baseUrl || 'https://api.loudly.com/v1';
    this.localMusicDir = options?.localMusicDir || path.join(process.cwd(), 'static', 'music');

    if (!this.apiKey) {
      console.warn('[LoudlyBGM] API key not configured. Using local BGM fallback.');
    }
  }

  /**
   * 사용 가능 여부 확인
   */
  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  /**
   * 지원하는 장르 목록
   */
  getSupportedGenres(): BGMGenre[] {
    return [
      'pop', 'rock', 'electronic', 'hip-hop', 'jazz',
      'classical', 'ambient', 'folk', 'country', 'latin',
      'cinematic', 'lofi', 'acoustic',
    ] as BGMGenre[];
  }

  /**
   * 지원하는 분위기 목록
   */
  getSupportedMoods(): BGMMood[] {
    return [
      'happy', 'sad', 'energetic', 'calm', 'romantic',
      'dramatic', 'dark', 'uplifting', 'mysterious', 'playful',
      'nostalgic', 'epic', 'relaxing', 'inspiring',
    ] as BGMMood[];
  }

  /**
   * 텍스트 프롬프트로 BGM 생성
   */
  async generate(
    prompt: string,
    outputPath: string,
    options?: BGMOptions
  ): Promise<BGMResult> {
    const startTime = Date.now();

    console.log(`[LoudlyBGM] Generating BGM: "${prompt}"`);

    // tempo 처리: number | { min, max } 형태 지원
    let tempo: number | undefined;
    if (typeof options?.tempo === 'number') {
      tempo = options.tempo;
    } else if (options?.tempo && typeof options.tempo === 'object') {
      tempo = options.tempo.min || options.tempo.max;
    }

    const request: LoudlyGenerateRequest = {
      prompt,
      duration: options?.duration || 30,
      mood: options?.mood ? MoodToLoudlyMood[options.mood] || (options.mood as LoudlyMood) : undefined,
      genre: options?.genre as any,
      tempo,
      energy: options?.energy,
    };

    // API 사용 불가시 로컬 폴백
    if (!this.apiKey) {
      return this.generateFromLocal(prompt, outputPath, request);
    }

    try {
      const response = await this.callGenerateApi(request);
      const audioBuffer = await this.downloadAudio(response.audioUrl);

      // 파일 저장
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputPath, Buffer.from(audioBuffer));

      console.log(`[LoudlyBGM] Generated: ${response.title} (${response.duration}s)`);

      return {
        path: outputPath,
        duration: response.duration,
        prompt,
        trackId: response.id,
        trackTitle: response.title,
        genre: response.genre,
        mood: response.mood,
        source: 'loudly',
        license: 'Loudly - Perpetual Commercial License',
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.warn(`[LoudlyBGM] API failed, using local fallback:`, error);
      return this.generateFromLocal(prompt, outputPath, request);
    }
  }

  /**
   * 프리셋으로 BGM 생성
   *
   * 지원하는 시그니처:
   * - (presetId, outputPath, duration?) - 새 인터페이스: 파일 저장
   * - (presetId, duration?) - 기존 인터페이스: ArrayBuffer 반환
   */
  async generateFromPreset(
    presetId: string,
    outputPathOrDuration?: string | number,
    duration?: number
  ): Promise<any> {
    const preset = LOUDLY_PRESETS[presetId];
    if (!preset) {
      throw new Error(`Unknown preset: ${presetId}`);
    }

    // 시그니처 감지: 2번째 인자가 숫자면 기존 인터페이스
    if (typeof outputPathOrDuration === 'number' || outputPathOrDuration === undefined) {
      // 기존 인터페이스: (presetId, duration?) → ArrayBuffer 반환
      const actualDuration = outputPathOrDuration || preset.duration || 30;
      const tempPath = path.join(this.localMusicDir, `temp_bgm_${Date.now()}.mp3`);

      try {
        const result = await this.generate(preset.prompt, tempPath, {
          duration: actualDuration,
          mood: preset.mood,
          genre: preset.genre as any,
          energy: preset.energy,
        });

        const audioBuffer = fs.readFileSync(result.path);
        const arrayBuffer = audioBuffer.buffer.slice(
          audioBuffer.byteOffset,
          audioBuffer.byteOffset + audioBuffer.byteLength
        );
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }

        return {
          audio: arrayBuffer,
          duration: result.duration,
          prompt: result.prompt || preset.prompt,
          trackId: result.trackId,
          trackTitle: result.trackTitle,
          source: (result.source as 'loudly' | 'local') || 'local',
          license: result.license,
        };
      } catch (error) {
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
        throw error;
      }
    }

    // 새 인터페이스: (presetId, outputPath, duration?) → 파일 저장
    const outputPath = outputPathOrDuration;
    return this.generate(preset.prompt, outputPath, {
      duration: duration || preset.duration || 30,
      mood: preset.mood,
      genre: preset.genre,
      energy: preset.energy,
    });
  }

  /**
   * 분위기로 BGM 생성
   *
   * 지원하는 시그니처:
   * - (mood, outputPath, duration) - 새 인터페이스: 파일 저장
   * - (mood, duration) - 기존 인터페이스: ArrayBuffer 반환
   */
  async generateForMood(
    mood: string,
    outputPathOrDuration: string | number,
    duration: number = 30
  ): Promise<any> {
    const loudlyMood = MoodToLoudlyMood[mood] || 'calm';
    const prompt = `${loudlyMood} background music`;

    // 시그니처 감지: 2번째 인자가 숫자면 기존 인터페이스
    if (typeof outputPathOrDuration === 'number') {
      // 기존 인터페이스: (mood, duration) → ArrayBuffer 반환
      const actualDuration = outputPathOrDuration;
      const tempPath = path.join(this.localMusicDir, `temp_bgm_${Date.now()}.mp3`);

      try {
        const result = await this.generate(prompt, tempPath, {
          mood: loudlyMood,
          duration: actualDuration,
        });

        const audioBuffer = fs.readFileSync(result.path);
        const arrayBuffer = audioBuffer.buffer.slice(
          audioBuffer.byteOffset,
          audioBuffer.byteOffset + audioBuffer.byteLength
        );
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }

        return {
          audio: arrayBuffer,
          duration: result.duration,
          prompt: result.prompt || prompt,
          trackId: result.trackId,
          trackTitle: result.trackTitle,
          source: (result.source as 'loudly' | 'local') || 'local',
          license: result.license,
        };
      } catch (error) {
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
        throw error;
      }
    }

    // 새 인터페이스: (mood, outputPath, duration) → 파일 저장
    const outputPath = outputPathOrDuration;
    return this.generate(prompt, outputPath, {
      mood: loudlyMood,
      duration,
    });
  }

  /**
   * Loudly 카탈로그 검색 (내부용)
   */
  async searchCatalog(request: LoudlySearchRequest): Promise<LoudlyTrack[]> {
    if (!this.apiKey) {
      console.warn('[LoudlyBGM] API not available. Cannot search catalog.');
      return [];
    }

    console.log(`[LoudlyBGM] Searching: ${request.query || request.mood || request.genre}`);

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
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Loudly API error: ${response.status}`);
      }

      const data = await response.json();
      // name 속성 추가 (title을 name으로 복사)
      const tracks = (data.tracks || []).map((t: any) => ({
        ...t,
        name: t.title || t.name,
      }));
      return tracks;
    } catch (error) {
      console.error('[LoudlyBGM] Search failed:', error);
      return [];
    }
  }

  /**
   * 특정 트랙 다운로드
   */
  async getTrack(trackId: string, outputPath: string): Promise<BGMResult> {
    if (!this.apiKey) {
      throw new Error('Loudly API not available');
    }

    console.log(`[LoudlyBGM] Downloading track: ${trackId}`);

    try {
      const response = await fetch(`${this.baseUrl}/tracks/${trackId}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get track: ${response.status}`);
      }

      const track: LoudlyTrack = await response.json();
      const audioBuffer = await this.downloadAudio(track.audioUrl);

      // 파일 저장
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputPath, Buffer.from(audioBuffer));

      return {
        path: outputPath,
        duration: track.duration,
        prompt: track.title,
        trackId: track.id,
        trackTitle: track.title,
        genre: track.genre,
        mood: track.mood,
        source: 'loudly',
        license: 'Loudly - Perpetual Commercial License',
      };
    } catch (error) {
      console.error('[LoudlyBGM] Failed to get track:', error);
      throw error;
    }
  }

  // ==================== Private Methods ====================

  /**
   * Loudly Generate API 호출
   */
  private async callGenerateApi(request: LoudlyGenerateRequest): Promise<LoudlyGenerateResponse> {
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
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
   * 오디오 다운로드
   */
  private async downloadAudio(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status}`);
    }
    return response.arrayBuffer();
  }

  /**
   * 로컬 BGM 폴백 생성
   */
  private async generateFromLocal(
    prompt: string,
    outputPath: string,
    request: LoudlyGenerateRequest
  ): Promise<BGMResult> {
    console.log(`[LoudlyBGM] Using local BGM fallback`);

    // 로컬 음악 파일 목록
    const musicFiles = await this.getLocalMusicFiles();

    if (musicFiles.length === 0) {
      throw new Error('No local BGM files available');
    }

    // 분위기에 맞는 음악 선택
    const selectedFile = this.selectLocalMusic(musicFiles, request.mood);
    const filePath = path.join(this.localMusicDir, selectedFile);

    // 파일 복사
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.copyFileSync(filePath, outputPath);

    // 대략적인 길이 계산 (128kbps 기준)
    const stats = fs.statSync(filePath);
    const approximateDuration = Math.floor(stats.size / (128 * 1024 / 8));

    console.log(`[LoudlyBGM] Selected local: ${selectedFile}`);

    return {
      path: outputPath,
      duration: approximateDuration,
      prompt,
      trackTitle: selectedFile.replace('.mp3', ''),
      source: 'local',
      license: 'YouTube Audio Library - Free',
    };
  }

  /**
   * 로컬 음악 파일 목록 조회
   */
  private async getLocalMusicFiles(): Promise<string[]> {
    try {
      if (!fs.existsSync(this.localMusicDir)) {
        return [];
      }
      const files = fs.readdirSync(this.localMusicDir);
      return files.filter((f) => f.endsWith('.mp3'));
    } catch (error) {
      console.error('[LoudlyBGM] Failed to read local music directory:', error);
      return [];
    }
  }

  /**
   * 분위기에 맞는 로컬 음악 선택
   */
  private selectLocalMusic(files: string[], mood?: LoudlyMood): string {
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
      const matchingFiles = files.filter((file) =>
        keywords.some((keyword) => file.toLowerCase().includes(keyword.toLowerCase()))
      );

      if (matchingFiles.length > 0) {
        return matchingFiles[Math.floor(Math.random() * matchingFiles.length)];
      }
    }

    // 랜덤 선택
    return files[Math.floor(Math.random() * files.length)];
  }

}

export default LoudlyBGM;
