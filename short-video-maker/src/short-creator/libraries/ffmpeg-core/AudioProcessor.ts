/**
 * FFmpeg Audio Processing Module
 *
 * Handles audio operations:
 * - Audio normalization and conversion
 * - Sound effect mixing
 * - Audio concatenation
 * - Silent audio generation
 */

import { Readable } from "node:stream";
import { logger } from "../../../logger";
import { ffmpeg } from "./utils";

export class AudioProcessor {
  /**
   * Normalize audio for Whisper (16kHz mono WAV)
   */
  async saveNormalizedAudio(
    audio: ArrayBuffer,
    outputPath: string
  ): Promise<string> {
    logger.debug("Normalizing audio for Whisper");
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputStream)
        .audioCodec("pcm_s16le")
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat("wav")
        .on("end", () => {
          logger.debug("Audio normalization complete");
          resolve(outputPath);
        })
        .on("error", (error: unknown) => {
          logger.error(error, "Error normalizing audio:");
          reject(error);
        })
        .save(outputPath);
    });
  }

  /**
   * Create MP3 data URI from audio buffer
   */
  async createMp3DataUri(audio: ArrayBuffer): Promise<string> {
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);
    return new Promise((resolve, reject) => {
      const chunk: Buffer[] = [];

      ffmpeg()
        .input(inputStream)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .toFormat("mp3")
        .on("error", (err) => {
          reject(err);
        })
        .pipe()
        .on("data", (data: Buffer) => {
          chunk.push(data);
        })
        .on("end", () => {
          const buffer = Buffer.concat(chunk);
          resolve(`data:audio/mp3;base64,${buffer.toString("base64")}`);
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  /**
   * Save audio buffer to MP3 file
   */
  async saveToMp3(audio: ArrayBuffer, filePath: string): Promise<string> {
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputStream)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .toFormat("mp3")
        .save(filePath)
        .on("end", () => {
          logger.debug("Audio conversion complete");
          resolve(filePath);
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  /**
   * Generate silent audio track
   * Used for skipTTS mode where only sound effects are needed
   */
  async generateSilentAudio(outputPath: string, duration: number): Promise<string> {
    logger.info({
      outputPath,
      duration
    }, "Generating silent audio track");

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input('anullsrc=r=44100:cl=stereo')
        .inputFormat('lavfi')
        .duration(duration)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .on('end', () => {
          logger.info({ outputPath }, "Silent audio generated");
          resolve(outputPath);
        })
        .on('error', (error) => {
          logger.error({ error: error.message }, "Failed to generate silent audio");
          reject(error);
        })
        .save(outputPath);
    });
  }

  /**
   * Create audio track from sound effects only (skipTTS mode)
   * Creates a silent base track and mixes sound effects on top
   *
   * @param soundEffects - Array of sound effects with timing
   * @param outputPath - Output file path
   * @param totalDuration - Total duration of output audio (seconds)
   */
  async createAudioFromSoundEffects(
    soundEffects: Array<{
      path: string;
      startTime: number;
      volume: number;
    }>,
    outputPath: string,
    totalDuration: number
  ): Promise<string> {
    logger.info({
      soundEffectCount: soundEffects.length,
      totalDuration,
      outputPath
    }, "Creating audio from sound effects only (skipTTS mode)");

    return new Promise((resolve, reject) => {
      try {
        const ffmpegCommand = ffmpeg();

        // Add silent audio as base track (anullsrc)
        ffmpegCommand
          .input('anullsrc=r=44100:cl=stereo')
          .inputFormat('lavfi')
          .inputOption(`-t ${totalDuration}`);

        // Add all sound effect inputs
        soundEffects.forEach((sfx) => {
          ffmpegCommand.input(sfx.path);
        });

        // Build filter: delay each sfx, then mix with silent base
        const filterParts: string[] = [];
        const mixInputs: string[] = ['[0:a]']; // Silent base is [0:a]

        soundEffects.forEach((sfx, index) => {
          const inputIndex = index + 1; // SFX inputs start from [1:a]
          const delayMs = Math.floor(sfx.startTime * 1000);
          const boostedVolume = sfx.volume * 3; // Boost for audibility

          filterParts.push(
            `[${inputIndex}:a]adelay=${delayMs}|${delayMs},volume=${boostedVolume}[a${inputIndex}]`
          );
          mixInputs.push(`[a${inputIndex}]`);
        });

        // Mix all streams (base + delayed sfx)
        const mixFilter = `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=3[out]`;
        filterParts.push(mixFilter);

        ffmpegCommand
          .complexFilter(filterParts.join(';'))
          .outputOption('-map [out]')
          .audioCodec('libmp3lame')
          .audioBitrate('192k')
          .on('start', (commandLine) => {
            logger.debug('FFmpeg createAudioFromSoundEffects command: ' + commandLine);
          })
          .on('end', () => {
            logger.info({ outputPath, count: soundEffects.length }, "Sound effects audio created");
            resolve(outputPath);
          })
          .on('error', (error) => {
            logger.error(error, "FFmpeg sound effects creation failed");
            reject(error);
          })
          .save(outputPath);
      } catch (error) {
        logger.error(error, "Error setting up FFmpeg sound effects creation");
        reject(error);
      }
    });
  }

  /**
   * Mix multiple audio tracks together
   * Used for combining TTS audio with sound effects and background music
   *
   * @param mainAudioPath - Primary audio (TTS narration)
   * @param overlayAudioPaths - Array of audio overlays [{path, startTime, volume}]
   * @param outputPath - Output file path
   * @param totalDuration - Total duration of output audio
   */
  async mixAudioTracks(
    mainAudioPath: string,
    overlayAudioPaths: Array<{
      path: string;
      startTime: number;     // Start time in seconds
      volume: number;        // Volume level (0.0 to 1.0)
      loop?: boolean;        // Loop for background music
    }>,
    outputPath: string,
    totalDuration: number
  ): Promise<string> {
    logger.info({
      mainAudioPath,
      overlayCount: overlayAudioPaths.length,
      totalDuration,
      outputPath
    }, "Mixing audio tracks with sound effects");

    return new Promise((resolve, reject) => {
      try {
        const ffmpegCommand = ffmpeg()
          .input(mainAudioPath);

        // Add all overlay audio inputs
        overlayAudioPaths.forEach((overlay) => {
          if (overlay.loop) {
            ffmpegCommand.input(overlay.path).inputOption('-stream_loop -1');
          } else {
            ffmpegCommand.input(overlay.path);
          }
        });

        if (overlayAudioPaths.length === 0) {
          // No overlays, just copy main audio
          ffmpegCommand
            .audioCodec('libmp3lame')
            .audioBitrate('192k')
            .duration(totalDuration)
            .on('end', () => {
              logger.info({ outputPath }, "Audio mixing complete (no overlays)");
              resolve(outputPath);
            })
            .on('error', (error) => {
              logger.error(error, "FFmpeg audio mixing failed");
              reject(error);
            })
            .save(outputPath);
          return;
        }

        // Build adelay and volume filters for each overlay
        const filterParts: string[] = [];
        const mixInputs: string[] = ['[0:a]'];

        // Build weights for amix
        const weights: number[] = [1]; // Base track weight

        overlayAudioPaths.forEach((overlay, index) => {
          const inputIndex = index + 1;
          const delayMs = Math.floor(overlay.startTime * 1000);
          // Boost sound effect volume (amix will still normalize)
          const boostedVolume = overlay.volume * 3;

          filterParts.push(
            `[${inputIndex}:a]adelay=${delayMs}|${delayMs},volume=${boostedVolume}[a${inputIndex}]`
          );
          mixInputs.push(`[a${inputIndex}]`);
          weights.push(1);
        });

        // Mix all audio streams together
        const weightsStr = weights.join(' ');
        const mixFilter = `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=3:weights='${weightsStr}'[out]`;
        const filterComplex = [...filterParts, mixFilter].join(';');

        ffmpegCommand
          .complexFilter(filterComplex)
          .outputOption('-map [out]')
          .audioCodec('libmp3lame')
          .audioBitrate('192k')
          .duration(totalDuration)
          .on('start', (commandLine) => {
            logger.debug('FFmpeg audio mix command: ' + commandLine);
          })
          .on('end', () => {
            logger.info({ outputPath, overlayCount: overlayAudioPaths.length }, "Audio mixing complete");
            resolve(outputPath);
          })
          .on('error', (error) => {
            logger.error(error, "FFmpeg audio mixing failed");
            reject(error);
          })
          .save(outputPath);

      } catch (error) {
        logger.error(error, "Error setting up FFmpeg audio mixing");
        reject(error);
      }
    });
  }

  /**
   * Save sound effect audio buffer to file
   */
  async saveSoundEffectToFile(
    audioBuffer: ArrayBuffer,
    outputPath: string
  ): Promise<string> {
    logger.debug({ outputPath, size: audioBuffer.byteLength }, "Saving sound effect to file");

    const inputStream = new Readable();
    inputStream.push(Buffer.from(audioBuffer));
    inputStream.push(null);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputStream)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .audioChannels(2)
        .toFormat('mp3')
        .on('end', () => {
          logger.debug({ outputPath }, "Sound effect saved");
          resolve(outputPath);
        })
        .on('error', (error) => {
          logger.error(error, "Error saving sound effect");
          reject(error);
        })
        .save(outputPath);
    });
  }

  /**
   * Concatenate multiple audio files
   */
  async concatAudios(inputPaths: string[], outputPath: string): Promise<string> {
    logger.debug({ inputPaths, outputPath }, "Concatenating audio files with FFmpeg");

    return new Promise(async (resolve, reject) => {
      try {
        if (inputPaths.length === 0) {
          reject(new Error("No audio input paths provided"));
          return;
        }

        if (inputPaths.length === 1) {
          // Single file, just copy
          const fs = await import("fs-extra");
          fs.copyFileSync(inputPaths[0], outputPath);
          resolve(outputPath);
          return;
        }

        // fluent-ffmpeg concat filter
        let ffmpegCommand = ffmpeg();

        // Add all input files
        for (const inputPath of inputPaths) {
          ffmpegCommand = ffmpegCommand.input(inputPath);
        }

        // concat filter (audio only)
        const filterComplex = inputPaths.map((_, i) => `[${i}:a]`).join('') +
          `concat=n=${inputPaths.length}:v=0:a=1[outa]`;

        ffmpegCommand
          .complexFilter(filterComplex)
          .outputOptions('-map', '[outa]')
          .audioCodec('libmp3lame')
          .audioBitrate('192k')
          .on('start', (commandLine) => {
            logger.debug('FFmpeg audio concat command: ' + commandLine);
          })
          .on('progress', (progress) => {
            logger.debug(`Audio concat progress: ${Math.floor(progress.percent || 0)}% done`);
          })
          .on('end', () => {
            logger.debug({ outputPath }, "Audio concatenation complete");
            resolve(outputPath);
          })
          .on('error', (error) => {
            logger.error(error, "FFmpeg audio concatenation failed");
            reject(error);
          })
          .save(outputPath);

      } catch (error) {
        logger.error(error, "Error setting up FFmpeg audio concatenation");
        reject(error);
      }
    });
  }
}

export default AudioProcessor;
