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
        logger.info({ hasAlignment: true }, "🎤 Using ElevenLabs alignment for captions");
        captions = this.convertAlignmentToCaptions(text, ttsResult.alignment);
      } else {
        // Fallback to Whisper (slower, may timeout in Cloud Run)
        logger.info({ hasAlignment: false }, "🎤 No alignment data, falling back to Whisper");
        try {
          captions = await this.whisper.CreateCaption(tempWavPath);
          logger.info({ captionCount: captions.length }, "🎤 Whisper captions generated");

          // 🔥 FIX: Whisper with English model (base.en) can't transcribe Korean
          // Check if Whisper returned unreliable captions:
          // 1. Empty captions
          // 2. Original text contains Korean but Whisper returned non-Korean (garbage)
          const hasKorean = /[\uac00-\ud7af]/.test(text);  // Check if input has Korean characters

          // 🔥 DEBUG: Log raw Unicode code points to verify encoding
          const firstCharCode = text.charCodeAt(0);
          const textHex = text.substring(0, 5).split('').map(c => c.charCodeAt(0).toString(16)).join(',');
          logger.info({
            firstCharCode,
            textHex,
            textLength: text.length,
            hasKoreanDetected: hasKorean
          }, "🔥 DEBUG: Korean detection check");
          const whisperText = captions.map(c => c.text).join('');
          const whisperHasKorean = /[\uac00-\ud7af]/.test(whisperText);

          if (captions.length === 0 || (hasKorean && !whisperHasKorean)) {
            logger.warn({
              hasKorean,
              whisperHasKorean,
              whisperText: whisperText.substring(0, 30),
              originalText: text.substring(0, 30)
            }, "🎤 Whisper returned unreliable captions for Korean audio, using simple text-based captions");
            captions = this.generateSimpleCaptions(text, ttsResult.audioLength);
            logger.info({ captionCount: captions.length }, "🎤 Simple captions generated as fallback (Korean detected)");
          }
        } catch (whisperError) {
          logger.warn({ error: whisperError }, "🎤 Whisper failed, using simple text-based captions");
          // Last resort: simple text-based captions
          captions = this.generateSimpleCaptions(text, ttsResult.audioLength);
          logger.info({ captionCount: captions.length }, "🎤 Simple captions generated");
        }
      }

      // Create URL for the audio file
      const audioUrl = `http://localhost:${this.config.port}/api/tmp/${tempMp3FileName}`;

      // 🔥 Log final caption result before returning
      logger.info({
        captionCount: captions.length,
        firstCaption: captions[0] ? JSON.stringify(captions[0]) : null,
        lastCaption: captions.length > 0 ? JSON.stringify(captions[captions.length - 1]) : null,
        audioDuration: ttsResult.audioLength
      }, "🎤 AudioProcessor returning captions");

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
          // 🔥 FIX: Return startMs/endMs in MILLISECONDS (not start/end in seconds)
          // FFmpeg createDualLanguageSubtitleFilter expects startMs/endMs format
          captions.push({
            text: currentWord.trim(),
            startMs: Math.round(wordStartTime * 1000),
            endMs: Math.round(wordEndTime * 1000)
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
      // 🔥 FIX: Return startMs/endMs in MILLISECONDS
      captions.push({
        text: currentWord.trim(),
        startMs: Math.round(wordStartTime * 1000),
        endMs: Math.round(wordEndTime * 1000)
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
   * 🔥 FIX: Returns startMs/endMs in MILLISECONDS to match FFmpeg expectation
   */
  private generateSimpleCaptions(text: string, duration: number): any[] {
    const words = text.split(/\s+/).filter(w => w.trim());
    if (words.length === 0) return [];

    const timePerWord = duration / words.length;
    const captions: any[] = [];

    for (let i = 0; i < words.length; i++) {
      // 🔥 FIX: Use startMs/endMs in milliseconds
      captions.push({
        text: words[i],
        startMs: Math.round(i * timePerWord * 1000),
        endMs: Math.round((i + 1) * timePerWord * 1000)
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

  /**
   * 🔥 Generate English captions synced to Korean audio timing
   * Uses Korean TTS captions timing with English text
   */
  generateSyncedEnglishCaptions(
    englishText: string,
    koreanCaptions: any[],
    totalDuration: number
  ): any[] {
    if (!englishText || !koreanCaptions || koreanCaptions.length === 0) {
      return [];
    }

    // Split English text into words
    const englishWords = englishText.split(/\s+/).filter(w => w.trim());
    if (englishWords.length === 0) return [];

    // Option 1: Distribute English words evenly across Korean caption timing
    const firstCaption = koreanCaptions[0];
    const lastCaption = koreanCaptions[koreanCaptions.length - 1];
    const koreanStartTime = firstCaption?.startMs ?? (firstCaption?.start ? firstCaption.start * 1000 : 0);
    const koreanEndTime = lastCaption?.endMs ?? (lastCaption?.end ? lastCaption.end * 1000 : totalDuration * 1000);
    const totalTime = koreanEndTime - koreanStartTime;
    const timePerWord = totalTime / englishWords.length;

    const englishCaptions: any[] = [];

    for (let i = 0; i < englishWords.length; i++) {
      englishCaptions.push({
        text: englishWords[i],
        startMs: koreanStartTime + (i * timePerWord),
        endMs: koreanStartTime + ((i + 1) * timePerWord),
        // Also include start/end in seconds for compatibility
        start: (koreanStartTime + (i * timePerWord)) / 1000,
        end: (koreanStartTime + ((i + 1) * timePerWord)) / 1000
      });
    }

    logger.debug({
      englishWordCount: englishWords.length,
      koreanCaptionCount: koreanCaptions.length,
      totalDuration: totalTime / 1000
    }, "🔥 Generated synced English captions");

    return englishCaptions;
  }
}