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

      // Generate TTS audio (with timestamps if available from ElevenLabs)
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

      // Generate captions: use alignment from TTS if available, otherwise fallback to Whisper
      let captions: any[];

      if (ttsResult.alignment) {
        // Use alignment data from ElevenLabs (fast, no Whisper needed)
        logger.debug({ hasAlignment: true }, "Using ElevenLabs alignment for captions");
        captions = this.convertAlignmentToCaptions(text, ttsResult.alignment);
      } else {
        // Fallback to Whisper (slower, may timeout in Cloud Run)
        logger.debug({ hasAlignment: false }, "No alignment data, falling back to Whisper");
        try {
          captions = await this.whisper.CreateCaption(tempWavPath);
        } catch (whisperError) {
          logger.warn({ error: whisperError }, "Whisper failed, using simple text-based captions");
          // Last resort: simple text-based captions
          captions = this.generateSimpleCaptions(text, ttsResult.audioLength);
        }
      }

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

  /**
   * Convert ElevenLabs alignment data to caption format
   * Groups characters into words based on spaces and punctuation
   */
  private convertAlignmentToCaptions(
    text: string,
    alignment: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    }
  ): any[] {
    const captions: any[] = [];
    let currentWord = '';
    let wordStartTime = 0;
    let wordEndTime = 0;

    for (let i = 0; i < alignment.characters.length; i++) {
      const char = alignment.characters[i];
      const startTime = alignment.character_start_times_seconds[i];
      const endTime = alignment.character_end_times_seconds[i];

      // Start new word
      if (currentWord === '') {
        wordStartTime = startTime;
      }

      // Check if this is a word boundary (space or punctuation)
      if (char === ' ' || char === '\n') {
        if (currentWord.trim()) {
          captions.push({
            text: currentWord.trim(),
            start: wordStartTime,
            end: wordEndTime
          });
        }
        currentWord = '';
      } else {
        currentWord += char;
        wordEndTime = endTime;
      }
    }

    // Add the last word if exists
    if (currentWord.trim()) {
      captions.push({
        text: currentWord.trim(),
        start: wordStartTime,
        end: wordEndTime
      });
    }

    logger.debug({
      inputTextLength: text.length,
      captionCount: captions.length,
      totalDuration: captions.length > 0 ? captions[captions.length - 1].end : 0
    }, "Converted alignment to captions");

    return captions;
  }

  /**
   * Generate simple text-based captions when no alignment data is available
   * Distributes words evenly across the audio duration
   */
  private generateSimpleCaptions(text: string, duration: number): any[] {
    const words = text.split(/\s+/).filter(w => w.trim());
    if (words.length === 0) return [];

    const timePerWord = duration / words.length;
    const captions: any[] = [];

    for (let i = 0; i < words.length; i++) {
      captions.push({
        text: words[i],
        start: i * timePerWord,
        end: (i + 1) * timePerWord
      });
    }

    return captions;
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