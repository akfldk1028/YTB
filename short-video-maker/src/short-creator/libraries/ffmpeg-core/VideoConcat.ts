/**
 * FFmpeg Video Concatenation Module
 *
 * Handles video concatenation operations:
 * - Simple concat (no re-encoding)
 * - xfade transitions (smooth scene transitions)
 */

import path from "path";
import fs from "fs-extra";
import { logger } from "../../../logger";
import { ffmpeg, getVideoDuration, runFFmpegSpawn } from "./utils";

export class VideoConcat {
  /**
   * Concatenate videos using FFmpeg concat demuxer
   * No re-encoding for fastest concatenation
   */
  async concatVideos(inputPaths: string[], outputPath: string): Promise<string> {
    logger.info({ inputPaths, outputPath }, "Concatenating videos with FFmpeg spawn");

    if (inputPaths.length === 0) {
      throw new Error("No input paths provided");
    }

    if (inputPaths.length === 1) {
      // Single file, just copy
      fs.copyFileSync(inputPaths[0], outputPath);
      return outputPath;
    }

    // Create concat demuxer list file
    const concatListPath = path.join(path.dirname(outputPath), `concat_list_${Date.now()}.txt`);
    const concatListContent = inputPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(concatListPath, concatListContent);

    logger.debug({ concatListPath, concatListContent }, "Created concat list file");

    try {
      // FFmpeg concat demuxer (no re-encoding)
      await runFFmpegSpawn([
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        '-y',
        outputPath
      ], 300000); // 5 minute timeout

      logger.info({ outputPath }, "Video merge complete via spawn");
      return outputPath;
    } finally {
      // Cleanup concat list file
      try {
        fs.unlinkSync(concatListPath);
      } catch (cleanupError) {
        logger.warn({ cleanupError }, "Could not clean up concat list file");
      }
    }
  }

  /**
   * Concatenate videos with xfade transitions
   * Smooth scene transitions for professional look
   *
   * @param inputPaths - Video files to concatenate
   * @param outputPath - Output file path
   * @param transitionDuration - Transition duration in seconds (default 0.5)
   * @param transitionType - Transition type (fade, dissolve, wipeleft, etc.)
   */
  async concatVideosWithXfade(
    inputPaths: string[],
    outputPath: string,
    transitionDuration: number = 0.5,
    transitionType: string = 'fade'
  ): Promise<string> {
    logger.info({
      inputPaths,
      outputPath,
      transitionDuration,
      transitionType
    }, "Concatenating videos with xfade transition");

    if (inputPaths.length === 0) {
      throw new Error("No input paths provided");
    }

    if (inputPaths.length === 1) {
      fs.copyFileSync(inputPaths[0], outputPath);
      return outputPath;
    }

    try {
      // Get duration of each video
      const durations: number[] = await Promise.all(
        inputPaths.map(p => getVideoDuration(p))
      );

      logger.debug({ durations }, "Video durations for xfade calculation");

      // Build xfade filter chain
      const inputLabels = inputPaths.map((_, i) => `[${i}:v]`);
      let filterComplex = '';
      let currentLabel = inputLabels[0];
      let cumulativeOffset = 0;

      for (let i = 1; i < inputPaths.length; i++) {
        // Start next scene transitionDuration before current scene ends
        const offset = cumulativeOffset + durations[i - 1] - transitionDuration;
        const outputLabel = i === inputPaths.length - 1 ? '[vout]' : `[vx${i}]`;

        filterComplex += `${currentLabel}${inputLabels[i]}xfade=transition=${transitionType}:duration=${transitionDuration}:offset=${offset.toFixed(3)}${outputLabel}`;

        if (i < inputPaths.length - 1) {
          filterComplex += ';';
        }

        currentLabel = outputLabel;
        cumulativeOffset = offset;
      }

      // Audio crossfade
      let audioFilterComplex = '';
      let audioCurrentLabel = '[0:a]';

      for (let i = 1; i < inputPaths.length; i++) {
        const audioOutputLabel = i === inputPaths.length - 1 ? '[aout]' : `[ax${i}]`;
        audioFilterComplex += `${audioCurrentLabel}[${i}:a]acrossfade=d=${transitionDuration}:c1=tri:c2=tri${audioOutputLabel}`;

        if (i < inputPaths.length - 1) {
          audioFilterComplex += ';';
        }
        audioCurrentLabel = audioOutputLabel;
      }

      // Combined filter_complex
      const fullFilterComplex = filterComplex + ';' + audioFilterComplex;

      logger.debug({ fullFilterComplex }, "Generated xfade filter complex");

      // Execute FFmpeg
      const ffmpegArgs = [
        ...inputPaths.flatMap(p => ['-i', p]),
        '-filter_complex', fullFilterComplex,
        '-map', '[vout]',
        '-map', '[aout]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-y',
        outputPath
      ];

      await runFFmpegSpawn(ffmpegArgs, 600000); // 10 minute timeout

      logger.info({ outputPath }, "Video xfade concatenation complete");
      return outputPath;
    } catch (error) {
      logger.error({ error }, "xfade concatenation failed, falling back to simple concat");
      // Fallback to simple concat
      return this.concatVideos(inputPaths, outputPath);
    }
  }
}

export default VideoConcat;
