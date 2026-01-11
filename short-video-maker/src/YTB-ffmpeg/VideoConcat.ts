/**
 * FFmpeg Video Concatenation Module
 *
 * Handles video concatenation operations:
 * - Simple concat (no re-encoding)
 * - xfade transitions (smooth scene transitions)
 */

import path from "path";
import fs from "fs-extra";
import { logger } from "../logger";
import { ffmpeg, getVideoDuration, runFFmpegSpawn } from "./utils";

export class VideoConcat {
  /**
   * Concatenate videos using FFmpeg concat filter
   * Uses re-encoding for VEO 3.1 compatibility
   */
  async concatVideos(inputPaths: string[], outputPath: string): Promise<string> {
    logger.info({ inputPaths, outputPath }, "Concatenating videos with FFmpeg (re-encoding for VEO 3.1 compatibility)");

    if (inputPaths.length === 0) {
      throw new Error("No input paths provided");
    }

    if (inputPaths.length === 1) {
      // Single file - re-encode for consistency
      await runFFmpegSpawn([
        '-i', inputPaths[0],
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-y',
        outputPath
      ], 300000);
      return outputPath;
    }

    try {
      // Build concat filter for multiple videos
      const inputArgs = inputPaths.flatMap(p => ['-i', p]);
      const filterInputs = inputPaths.map((_, i) => `[${i}:v][${i}:a]`).join('');
      const filterComplex = `${filterInputs}concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`;

      await runFFmpegSpawn([
        ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', '[outv]',
        '-map', '[outa]',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-y',
        outputPath
      ], 300000); // 5 minute timeout

      logger.info({ outputPath }, "Video concat complete with re-encoding");
      return outputPath;
    } catch (error) {
      // Fallback: try video-only concat if audio concat fails
      logger.warn({ error }, "Audio concat failed, trying video-only concat");

      const inputArgs = inputPaths.flatMap(p => ['-i', p]);
      const filterInputs = inputPaths.map((_, i) => `[${i}:v]`).join('');
      const filterComplex = `${filterInputs}concat=n=${inputPaths.length}:v=1:a=0[outv]`;

      await runFFmpegSpawn([
        ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', '[outv]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-an',
        '-y',
        outputPath
      ], 300000);

      logger.info({ outputPath }, "Video-only concat complete");
      return outputPath;
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
   * @param targetDimensions - Target dimensions for scaling (default: 1080x1920 for portrait)
   */
  // Valid xfade transition types for FFmpeg
  // NOTE: 'xfade' is the FILTER NAME, not a valid transition type!
  private static readonly VALID_TRANSITIONS = [
    'fade', 'wipeleft', 'wiperight', 'wipeup', 'wipedown',
    'slideleft', 'slideright', 'slideup', 'slidedown',
    'circlecrop', 'rectcrop', 'distance', 'fadeblack', 'fadewhite',
    'radial', 'smoothleft', 'smoothright', 'smoothup', 'smoothdown',
    'circleopen', 'circleclose', 'vertopen', 'vertclose',
    'horzopen', 'horzclose', 'dissolve', 'pixelize',
    'diagtl', 'diagtr', 'diagbl', 'diagbr',
    'hlslice', 'hrslice', 'vuslice', 'vdslice', 'hblur'
  ];

  async concatVideosWithXfade(
    inputPaths: string[],
    outputPath: string,
    transitionDuration: number = 0.5,
    transitionType: string = 'fade',
    targetDimensions: string = '1080x1920' // Portrait default for Shorts
  ): Promise<string> {
    // Validate transition type - 'xfade' is filter name, not a valid type!
    const validatedTransition = VideoConcat.VALID_TRANSITIONS.includes(transitionType)
      ? transitionType
      : 'fade';

    if (transitionType !== validatedTransition) {
      logger.warn({
        requested: transitionType,
        using: validatedTransition
      }, "Invalid xfade transition type, falling back to 'fade'");
    }

    logger.info({
      inputPaths,
      outputPath,
      transitionDuration,
      transitionType: validatedTransition,
      targetDimensions
    }, "Concatenating videos with xfade transition");

    if (inputPaths.length === 0) {
      throw new Error("No input paths provided");
    }

    if (inputPaths.length === 1) {
      fs.copyFileSync(inputPaths[0], outputPath);
      return outputPath;
    }

    try {
      // Parse target dimensions
      const [targetWidth, targetHeight] = targetDimensions.split('x').map(Number);
      logger.debug({ targetWidth, targetHeight }, "Target dimensions for video normalization");

      // Get duration of each video
      const durations: number[] = await Promise.all(
        inputPaths.map(p => getVideoDuration(p))
      );

      logger.debug({ durations }, "Video durations for xfade calculation");

      // Build scale filters to normalize all videos to same dimensions
      // This is critical for xfade to work with VEO videos of different resolutions
      let scaleFilters = '';
      for (let i = 0; i < inputPaths.length; i++) {
        scaleFilters += `[${i}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:-1:-1:color=black,setsar=1,fps=30[v${i}];`;
      }

      // Build xfade filter chain using scaled inputs
      const scaledLabels = inputPaths.map((_, i) => `[v${i}]`);
      let xfadeFilters = '';
      let currentLabel = scaledLabels[0];
      let cumulativeOffset = 0;

      for (let i = 1; i < inputPaths.length; i++) {
        // Start next scene transitionDuration before current scene ends
        const offset = cumulativeOffset + durations[i - 1] - transitionDuration;
        const outputLabel = i === inputPaths.length - 1 ? '[vout]' : `[vx${i}]`;

        xfadeFilters += `${currentLabel}${scaledLabels[i]}xfade=transition=${validatedTransition}:duration=${transitionDuration}:offset=${offset.toFixed(3)}${outputLabel}`;

        if (i < inputPaths.length - 1) {
          xfadeFilters += ';';
        }

        currentLabel = outputLabel;
        cumulativeOffset = offset;
      }

      // Combine scale and xfade filters
      const filterComplex = scaleFilters + xfadeFilters;

      // Check if first video has audio stream
      const hasAudio = await this.checkHasAudio(inputPaths[0]);
      logger.debug({ hasAudio }, "Checking audio streams for xfade");

      let fullFilterComplex = filterComplex;
      let ffmpegArgs: string[];

      if (hasAudio) {
        // Audio crossfade (only if videos have audio)
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

        fullFilterComplex = filterComplex + ';' + audioFilterComplex;

        ffmpegArgs = [
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
      } else {
        // Video-only xfade (no audio streams in input)
        logger.info("No audio in input videos, using video-only xfade");
        ffmpegArgs = [
          ...inputPaths.flatMap(p => ['-i', p]),
          '-filter_complex', filterComplex,
          '-map', '[vout]',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-an',  // No audio output
          '-y',
          outputPath
        ];
      }

      logger.debug({ fullFilterComplex }, "Generated xfade filter complex");

      await runFFmpegSpawn(ffmpegArgs, 600000); // 10 minute timeout

      logger.info({ outputPath }, "Video xfade concatenation complete");
      return outputPath;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMsg }, "xfade concatenation failed, falling back to simple concat");
      // Fallback to simple concat
      return this.concatVideos(inputPaths, outputPath);
    }
  }

  /**
   * Check if video file has audio stream
   */
  private async checkHasAudio(videoPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      ffmpeg(videoPath).ffprobe((err, data) => {
        if (err) {
          logger.warn({ error: err.message }, "Failed to probe video for audio streams");
          resolve(false);
          return;
        }
        const hasAudio = data.streams?.some(s => s.codec_type === 'audio') ?? false;
        resolve(hasAudio);
      });
    });
  }
}

export default VideoConcat;
