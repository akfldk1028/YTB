import path from "path";
import cuid from "cuid";
import { TTSProvider } from "../libraries/TTSProvider";
import { Whisper } from "../libraries/Whisper";
import { FFMpeg } from "../libraries/FFmpeg";
import { logger } from "../../logger";
import type { Voices } from "../../types/shorts";

export interface AudioResult {
  url: string;
  duration: number;
  captions?: any[];
}

export interface AudioProcessingConfig {
  tempDirPath: string;
  port: number;
}

export class AudioProcessor {
  constructor(
    private ttsProvider: TTSProvider,
    private whisper: Whisper,
    private ffmpeg: FFMpeg,
    private config: AudioProcessingConfig
  ) {}

  async generateTTSAudio(text: string, voice?: Voices): Promise<AudioResult> {
    try {
      logger.debug({ text, voice }, "Generating TTS audio");
      
      // Generate TTS audio
      const ttsResult = await this.ttsProvider.generate(text, voice || 'baRq1qg6PxLsnSQ04d8c'); // el_axl
      
      // Create file paths
      const audioId = cuid();
      const tempWavFileName = `${audioId}.wav`;
      const tempMp3FileName = `${audioId}.mp3`;
      const tempWavPath = path.join(this.config.tempDirPath, tempWavFileName);
      const tempMp3Path = path.join(this.config.tempDirPath, tempMp3FileName);

      // Save audio files
      await this.ffmpeg.saveNormalizedAudio(ttsResult.audio, tempWavPath);
      await this.ffmpeg.saveToMp3(ttsResult.audio, tempMp3Path);

      // Generate captions using Whisper
      const captions = await this.whisper.CreateCaption(tempWavPath);

      // Create URL for the audio file
      const audioUrl = `http://localhost:${this.config.port}/api/tmp/${tempMp3FileName}`;
      
      return {
        url: audioUrl,
        duration: ttsResult.audioLength, // Already in seconds from TTS provider
        captions
      };
    } catch (error) {
      logger.error(error, "Failed to generate TTS audio");
      throw new Error(`TTS generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateCaptions(audioPath: string): Promise<any[]> {
    try {
      logger.debug({ audioPath }, "Generating captions for audio");
      return await this.whisper.CreateCaption(audioPath);
    } catch (error) {
      logger.error(error, "Failed to generate captions");
      throw new Error(`Caption generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async concatenateAudioFiles(audioPaths: string[], outputPath: string): Promise<string> {
    try {
      logger.debug({ audioPaths, outputPath }, "Concatenating audio files");
      // TODO: Implement audio concatenation using FFmpeg
      // For now, return the first audio file
      return audioPaths[0];
    } catch (error) {
      logger.error(error, "Failed to concatenate audio files");
      throw new Error(`Audio concatenation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}