/**
 * FFmpeg Module - Facade Pattern
 *
 * Provides a unified interface to all FFmpeg operations.
 * Maintains backward compatibility with the original FFMpeg class.
 *
 * Modules:
 * - AudioProcessor: Audio operations (normalize, mix, concat)
 * - SubtitleFilter: Subtitle/caption filter generation
 * - VideoConcat: Video concatenation (simple, xfade)
 * - VideoEditor: Video editing (combine, trim, add subtitles)
 */

import { logger } from "../logger";
import { OrientationEnum, RenderConfig, TitleTextConfig } from "../types/shorts";
import { initFFmpeg, getVideoDuration } from "./utils";
import { AudioProcessor } from "./AudioProcessor";
import { SubtitleFilter } from "./SubtitleFilter";
import { VideoConcat } from "./VideoConcat";
import { VideoEditor } from "./VideoEditor";

// Re-export modules for direct access if needed
export { AudioProcessor } from "./AudioProcessor";
export { SubtitleFilter } from "./SubtitleFilter";
export { VideoConcat } from "./VideoConcat";
export { VideoEditor } from "./VideoEditor";
export * from "./utils";

/**
 * FFMpeg Facade Class
 *
 * Provides the same interface as the original FFMpeg class
 * but delegates to specialized modules internally.
 */
export class FFMpeg {
  private audioProcessor: AudioProcessor;
  private subtitleFilter: SubtitleFilter;
  private videoConcat: VideoConcat;
  private videoEditor: VideoEditor;

  constructor() {
    this.audioProcessor = new AudioProcessor();
    this.subtitleFilter = new SubtitleFilter();
    this.videoConcat = new VideoConcat();
    this.videoEditor = new VideoEditor();
  }

  /**
   * Initialize FFmpeg
   */
  static async init(): Promise<FFMpeg> {
    await initFFmpeg();
    return new FFMpeg();
  }

  // ===== Audio Operations =====

  async saveNormalizedAudio(audio: ArrayBuffer, outputPath: string): Promise<string> {
    return this.audioProcessor.saveNormalizedAudio(audio, outputPath);
  }

  async createMp3DataUri(audio: ArrayBuffer): Promise<string> {
    return this.audioProcessor.createMp3DataUri(audio);
  }

  async saveToMp3(audio: ArrayBuffer, filePath: string): Promise<string> {
    return this.audioProcessor.saveToMp3(audio, filePath);
  }

  /**
   * Save raw PCM audio to MP3 (for Gemini TTS)
   * Gemini TTS returns L16 PCM (24kHz, mono, 16-bit signed little-endian)
   */
  async savePcmToMp3(audio: ArrayBuffer, filePath: string): Promise<string> {
    return this.audioProcessor.savePcmToMp3(audio, filePath);
  }

  async generateSilentAudio(outputPath: string, duration: number): Promise<string> {
    return this.audioProcessor.generateSilentAudio(outputPath, duration);
  }

  async createAudioFromSoundEffects(
    soundEffects: Array<{ path: string; startTime: number; volume: number; loop?: boolean; seekStart?: number }>,
    outputPath: string,
    totalDuration: number
  ): Promise<string> {
    return this.audioProcessor.createAudioFromSoundEffects(soundEffects, outputPath, totalDuration);
  }

  async mixAudioTracks(
    mainAudioPath: string,
    overlayAudioPaths: Array<{ path: string; startTime: number; volume: number; loop?: boolean; seekStart?: number }>,
    outputPath: string,
    totalDuration: number
  ): Promise<string> {
    return this.audioProcessor.mixAudioTracks(mainAudioPath, overlayAudioPaths, outputPath, totalDuration);
  }

  async saveSoundEffectToFile(audioBuffer: ArrayBuffer, outputPath: string): Promise<string> {
    return this.audioProcessor.saveSoundEffectToFile(audioBuffer, outputPath);
  }

  async concatAudios(inputPaths: string[], outputPath: string): Promise<string> {
    return this.audioProcessor.concatAudios(inputPaths, outputPath);
  }

  // ===== Subtitle Filter Operations =====

  createSubtitleFilter(
    captions: any[],
    orientation: OrientationEnum,
    tempDir?: string
  ): { filter: string; textFilePaths: string[] } | null {
    return this.subtitleFilter.createSubtitleFilter(captions, orientation, tempDir);
  }

  createDualLanguageSubtitleFilter(
    primaryCaptions: any[],
    secondaryCaptions: any[],
    orientation: OrientationEnum,
    tempDir?: string
  ): { filter: string; textFilePaths: string[] } | null {
    return this.subtitleFilter.createDualLanguageSubtitleFilter(
      primaryCaptions,
      secondaryCaptions,
      orientation,
      tempDir
    );
  }

  createTitleTextFilter(
    titleText: TitleTextConfig,
    orientation: OrientationEnum,
    videoDuration: number,
    tempDir?: string,
    language?: 'english' | 'korean'
  ): { filter: string; textFilePath?: string } | null {
    return this.subtitleFilter.createTitleTextFilter(titleText, orientation, videoDuration, tempDir, language);
  }

  // ===== Video Concatenation Operations =====

  async concatVideos(inputPaths: string[], outputPath: string): Promise<string> {
    return this.videoConcat.concatVideos(inputPaths, outputPath);
  }

  async concatVideosWithXfade(
    inputPaths: string[],
    outputPath: string,
    transitionDuration?: number,
    transitionType?: string
  ): Promise<string> {
    return this.videoConcat.concatVideosWithXfade(inputPaths, outputPath, transitionDuration, transitionType);
  }

  // ===== Video Editor Operations =====

  async combineVideoWithAudioAndCaptions(
    videoPath: string,
    audioPath: string,
    captions: any[],
    outputPath: string,
    durationSeconds: number,
    orientation: OrientationEnum,
    config: RenderConfig,
    skipSubtitles?: boolean,
    sceneOverlays?: Array<{ text: string; startMs: number; endMs: number }>  // 🔥 씬별 제목
  ): Promise<string> {
    return this.videoEditor.combineVideoWithAudioAndCaptions(
      videoPath,
      audioPath,
      captions,
      outputPath,
      durationSeconds,
      orientation,
      config,
      skipSubtitles,
      sceneOverlays
    );
  }

  async trimVideo(inputPath: string, outputPath: string, duration: number): Promise<void> {
    return this.videoEditor.trimVideo(inputPath, outputPath, duration);
  }

  async trimAndResizeVideo(
    inputPath: string,
    outputPath: string,
    duration: number,
    dimensions: { width: number; height: number }
  ): Promise<void> {
    return this.videoEditor.trimAndResizeVideo(inputPath, outputPath, duration, dimensions);
  }

  async addSubtitlesToVideo(
    inputVideoPath: string,
    outputVideoPath: string,
    captions: any[],
    orientation: OrientationEnum
  ): Promise<string> {
    return this.videoEditor.addSubtitlesToVideo(inputVideoPath, outputVideoPath, captions, orientation);
  }

  async addDualLanguageSubtitles(
    inputVideoPath: string,
    outputVideoPath: string,
    primaryCaptions: any[],
    secondaryCaptions: any[],
    orientation: OrientationEnum
  ): Promise<string> {
    return this.videoEditor.addDualLanguageSubtitles(
      inputVideoPath,
      outputVideoPath,
      primaryCaptions,
      secondaryCaptions,
      orientation
    );
  }

  async addTitleAndSubtitlesToVideo(
    inputVideoPath: string,
    outputVideoPath: string,
    titleText: TitleTextConfig | null,
    primaryCaptions: any[],
    secondaryCaptions: any[] | null,
    orientation: OrientationEnum,
    videoDuration: number,
    language?: 'english' | 'korean'
  ): Promise<string> {
    return this.videoEditor.addTitleAndSubtitlesToVideo(
      inputVideoPath,
      outputVideoPath,
      titleText,
      primaryCaptions,
      secondaryCaptions,
      orientation,
      videoDuration,
      language
    );
  }

  async createStaticVideoFromImage(
    imagePath: string,
    outputPath: string,
    duration: number,
    dimensions: string
  ): Promise<void> {
    return this.videoEditor.createStaticVideoFromImage(imagePath, outputPath, duration, dimensions);
  }

  async createStaticVideoFromMultipleImages(
    imageDataList: Array<{ imagePath: string; duration: number }>,
    outputPath: string,
    dimensions: string
  ): Promise<void> {
    return this.videoEditor.createStaticVideoFromMultipleImages(imageDataList, outputPath, dimensions);
  }

  async extractAudioFromVideo(videoPath: string, outputAudioPath: string): Promise<void> {
    return this.videoEditor.extractAudioFromVideo(videoPath, outputAudioPath);
  }

  async replaceVideoAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    audioDuration: number
  ): Promise<void> {
    return this.videoEditor.replaceVideoAudio(videoPath, audioPath, outputPath, audioDuration);
  }

  // ===== Utility Operations =====

  async getVideoDuration(videoPath: string): Promise<number> {
    return getVideoDuration(videoPath);
  }
}

export default FFMpeg;
