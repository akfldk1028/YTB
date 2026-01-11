/**
 * FFmpeg Video Editor Module
 *
 * Handles video editing operations:
 * - Combine video with audio and captions
 * - Add subtitles to video
 * - Add title and dual language subtitles
 * - Replace video audio
 * - Trim video
 * - Create video from images
 * - Extract audio from video
 */

import path from "path";
import fs from "fs-extra";
import { logger } from "../../../logger";
import { OrientationEnum, RenderConfig, TitleTextConfig } from "../../../types/shorts";
import { ffmpeg } from "./utils";
import { SubtitleFilter } from "./SubtitleFilter";

export class VideoEditor {
  private subtitleFilter: SubtitleFilter;

  constructor() {
    this.subtitleFilter = new SubtitleFilter();
  }

  /**
   * Combine video with audio and captions
   */
  async combineVideoWithAudioAndCaptions(
    videoPath: string,
    audioPath: string,
    captions: any[],
    outputPath: string,
    durationSeconds: number,
    orientation: OrientationEnum,
    config: RenderConfig,
    skipSubtitles = false
  ): Promise<string> {
    logger.debug({ videoPath, audioPath, outputPath }, "Combining video with audio using FFmpeg");

    const tempDir = path.dirname(outputPath);
    let subtitleTextFilePaths: string[] = [];

    return new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .fps(30);

      // Add subtitle filter if available (unless skipped)
      if (!skipSubtitles && captions && captions.length > 0) {
        const subtitleResult = this.subtitleFilter.createSubtitleFilter(captions, orientation, tempDir);
        if (subtitleResult) {
          subtitleTextFilePaths = subtitleResult.textFilePaths;
          ffmpegCommand.complexFilter(`[0:v]${subtitleResult.filter}[v]`);
          ffmpegCommand.outputOptions([
            '-map', '[v]',
            '-map', '1:a:0',
            '-shortest',
            `-t ${durationSeconds}`
          ]);
        } else {
          ffmpegCommand.outputOptions([
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-shortest',
            `-t ${durationSeconds}`
          ]);
        }
      } else {
        ffmpegCommand.outputOptions([
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-shortest',
          `-t ${durationSeconds}`
        ]);
      }

      ffmpegCommand
        .on('end', () => {
          // Clean up subtitle text files
          if (subtitleTextFilePaths.length > 0) {
            subtitleTextFilePaths.forEach((filePath) => {
              try {
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
              } catch (e) {
                logger.warn({ filePath }, "Failed to clean up subtitle text file");
              }
            });
            logger.debug({ cleanedFiles: subtitleTextFilePaths.length }, "Cleaned up subtitle text files");
          }
          logger.debug({ outputPath }, "Video combination complete");
          resolve(outputPath);
        })
        .on('error', (error: any) => {
          // Clean up subtitle text files on error too
          subtitleTextFilePaths.forEach((filePath) => {
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            } catch (e) { /* ignore */ }
          });
          logger.error(error, "Error combining video with audio");
          reject(error);
        })
        .save(outputPath);
    });
  }

  /**
   * Trim video to specified duration
   * Uses re-encoding for compatibility with VEO 3.1 and other AI-generated videos
   */
  async trimVideo(inputPath: string, outputPath: string, duration: number): Promise<void> {
    logger.debug({ inputPath, outputPath, duration }, "Trimming video with FFmpeg (re-encoding for VEO 3.1 compatibility)");

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setDuration(duration)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset', 'fast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p'
        ])
        .on('start', (commandLine) => {
          logger.debug('FFmpeg trim command: ' + commandLine);
        })
        .on('end', () => {
          logger.debug({ outputPath, duration }, "Video trim complete");
          resolve();
        })
        .on('error', (err) => {
          logger.error({ error: err, inputPath, outputPath }, "FFmpeg video trim failed");
          reject(err);
        })
        .save(outputPath);
    });
  }

  /**
   * Add subtitles to existing video
   */
  async addSubtitlesToVideo(
    inputVideoPath: string,
    outputVideoPath: string,
    captions: any[],
    orientation: OrientationEnum
  ): Promise<string> {
    logger.debug({ inputVideoPath, outputVideoPath, captionCount: captions.length }, "Adding synchronized subtitles to video");

    const tempDir = path.dirname(outputVideoPath);
    let subtitleTextFilePaths: string[] = [];

    return new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg()
        .input(inputVideoPath)
        .videoCodec('libx264')
        .audioCodec('aac');

      if (captions && captions.length > 0) {
        const subtitleResult = this.subtitleFilter.createSubtitleFilter(captions, orientation, tempDir);
        if (subtitleResult) {
          subtitleTextFilePaths = subtitleResult.textFilePaths;
          ffmpegCommand.videoFilters(subtitleResult.filter);
        }
      }

      ffmpegCommand
        .on('end', () => {
          // Clean up subtitle text files
          if (subtitleTextFilePaths.length > 0) {
            subtitleTextFilePaths.forEach((filePath) => {
              try {
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
              } catch (e) {
                logger.warn({ filePath }, "Failed to clean up subtitle text file");
              }
            });
            logger.debug({ cleanedFiles: subtitleTextFilePaths.length }, "Cleaned up subtitle text files");
          }
          logger.debug({ outputVideoPath }, "Subtitle addition complete");
          resolve(outputVideoPath);
        })
        .on('error', (error: any) => {
          // Clean up subtitle text files on error too
          subtitleTextFilePaths.forEach((filePath) => {
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            } catch (e) { /* ignore */ }
          });
          logger.error(error, "Error adding subtitles to video");
          reject(error);
        })
        .save(outputVideoPath);
    });
  }

  /**
   * Add dual language subtitles to video
   */
  async addDualLanguageSubtitles(
    inputVideoPath: string,
    outputVideoPath: string,
    primaryCaptions: any[],
    secondaryCaptions: any[],
    orientation: OrientationEnum
  ): Promise<string> {
    logger.debug({
      inputVideoPath,
      outputVideoPath,
      primaryCaptionCount: primaryCaptions.length,
      secondaryCaptionCount: secondaryCaptions?.length || 0
    }, "Adding dual language subtitles to video");

    const tempDir = path.dirname(outputVideoPath);
    let subtitleTextFilePaths: string[] = [];

    return new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg()
        .input(inputVideoPath)
        .videoCodec('libx264')
        .audioCodec('aac');

      if (primaryCaptions && primaryCaptions.length > 0) {
        const subtitleResult = this.subtitleFilter.createDualLanguageSubtitleFilter(
          primaryCaptions,
          secondaryCaptions,
          orientation,
          tempDir
        );
        if (subtitleResult) {
          ffmpegCommand.videoFilters(subtitleResult.filter);
          subtitleTextFilePaths = subtitleResult.textFilePaths;
        }
      }

      const cleanupTextFiles = () => {
        for (const filePath of subtitleTextFilePaths) {
          try {
            fs.unlinkSync(filePath);
          } catch (err) {
            // Ignore
          }
        }
      };

      ffmpegCommand
        .on('end', () => {
          logger.debug({ outputVideoPath }, "Dual language subtitle addition complete");
          cleanupTextFiles();
          resolve(outputVideoPath);
        })
        .on('error', (error: any) => {
          logger.error(error, "Error adding dual language subtitles to video");
          cleanupTextFiles();
          reject(error);
        })
        .save(outputVideoPath);
    });
  }

  /**
   * Add title text and dual subtitles to video
   */
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
    logger.info({
      inputVideoPath,
      outputVideoPath,
      hasTitleText: !!titleText,
      titleTextKo: titleText?.ko,
      titleTextEn: titleText?.en,
      language,
      primaryCaptionCount: primaryCaptions?.length || 0,
      secondaryCaptionCount: secondaryCaptions?.length || 0,
      videoDuration
    }, "Adding title and subtitles to video");

    const tempDir = path.dirname(outputVideoPath);
    let titleTextFilePath: string | undefined;
    let subtitleTextFilePaths: string[] = [];

    return new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg()
        .input(inputVideoPath)
        .videoCodec('libx264')
        .audioCodec('aac');

      const filters: string[] = [];

      // Title filter (supports both Korean and English based on language setting)
      if (titleText && (titleText.ko || titleText.en)) {
        const titleResult = this.subtitleFilter.createTitleTextFilter(titleText, orientation, videoDuration, tempDir, language);
        if (titleResult) {
          filters.push(titleResult.filter);
          titleTextFilePath = titleResult.textFilePath;
          logger.debug({ titleFilter: titleResult.filter, textFilePath: titleTextFilePath, language }, "Added title text filter");
        }
      }

      // Dual subtitle filter
      if (primaryCaptions && primaryCaptions.length > 0) {
        const subtitleResult = this.subtitleFilter.createDualLanguageSubtitleFilter(
          primaryCaptions,
          secondaryCaptions || [],
          orientation,
          tempDir
        );
        if (subtitleResult) {
          filters.push(subtitleResult.filter);
          subtitleTextFilePaths = subtitleResult.textFilePaths;
          logger.info({
            subtitleTextFileCount: subtitleTextFilePaths.length,
            filterLength: subtitleResult.filter.length
          }, "Added dual language subtitle filter (textfile mode)");
        }
      }

      // No filters, just copy
      if (filters.length === 0) {
        logger.warn("No filters to apply, copying video");
        fs.copyFileSync(inputVideoPath, outputVideoPath);
        resolve(outputVideoPath);
        return;
      }

      const combinedFilter = filters.join(',');
      logger.debug({ combinedFilter }, "Combined video filter");

      const cleanupAllTextFiles = () => {
        if (titleTextFilePath) {
          try {
            fs.unlinkSync(titleTextFilePath);
            logger.debug({ titleTextFilePath }, "Cleaned up title text file");
          } catch (cleanupErr) {
            logger.warn({ cleanupErr, titleTextFilePath }, "Could not clean up title text file");
          }
        }
        for (const filePath of subtitleTextFilePaths) {
          try {
            fs.unlinkSync(filePath);
          } catch (err) {
            // Ignore
          }
        }
        if (subtitleTextFilePaths.length > 0) {
          logger.debug({ count: subtitleTextFilePaths.length }, "Cleaned up subtitle text files");
        }
      };

      ffmpegCommand
        .videoFilters(combinedFilter)
        .on('start', (commandLine) => {
          logger.debug('FFmpeg addTitleAndSubtitles command: ' + commandLine);
        })
        .on('end', () => {
          logger.info({ outputVideoPath }, "Title and subtitles addition complete");
          cleanupAllTextFiles();
          resolve(outputVideoPath);
        })
        .on('error', (error: any) => {
          logger.error(error, "Error adding title and subtitles to video");
          cleanupAllTextFiles();
          reject(error);
        })
        .save(outputVideoPath);
    });
  }

  /**
   * Create static video from single image
   */
  async createStaticVideoFromImage(
    imagePath: string,
    outputPath: string,
    duration: number,
    dimensions: string
  ): Promise<void> {
    logger.debug({ imagePath, outputPath, duration, dimensions }, "Creating static video from image");

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(imagePath)
        .inputOption('-loop 1')
        .inputOption(`-t ${duration}`)
        .videoCodec('libx264')
        .size(dimensions)
        .fps(30)
        .outputOption('-pix_fmt yuv420p')
        .on('start', (commandLine) => {
          logger.debug('FFmpeg createStaticVideoFromImage command: ' + commandLine);
        })
        .on('end', () => {
          logger.debug({ outputPath }, "Static video creation complete");
          resolve();
        })
        .on('error', (error: any) => {
          logger.error(error, "Error creating static video from image");
          reject(error);
        })
        .save(outputPath);
    });
  }

  /**
   * Create static video from multiple images with different durations
   */
  async createStaticVideoFromMultipleImages(
    imageDataList: Array<{ imagePath: string; duration: number }>,
    outputPath: string,
    dimensions: string
  ): Promise<void> {
    logger.info({
      imageCount: imageDataList.length,
      outputPath,
      dimensions,
      totalDuration: imageDataList.reduce((sum, img) => sum + img.duration, 0)
    }, "Creating static video from multiple images");

    return new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg();

      // Add each image as input
      imageDataList.forEach((imageData) => {
        ffmpegCommand
          .input(imageData.imagePath)
          .inputOption('-loop 1')
          .inputOption(`-t ${imageData.duration}`);
      });

      // Parse dimensions
      const [width, height] = dimensions.split('x').map(Number);

      const filterInputs = imageDataList.map((_, index) => `[${index}:v]`).join('');
      const filterComplex = `${filterInputs}concat=n=${imageDataList.length}:v=1:a=0[concat];[concat]scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:-1:-1:color=black[v]`;

      ffmpegCommand
        .complexFilter(filterComplex)
        .outputOption('-map [v]')
        .videoCodec('libx264')
        .fps(30)
        .outputOption('-pix_fmt yuv420p')
        .on('start', (commandLine) => {
          logger.debug('FFmpeg createStaticVideoFromMultipleImages command: ' + commandLine);
        })
        .on('end', () => {
          logger.info({ outputPath }, "Multi-image static video creation complete");
          resolve();
        })
        .on('error', (error: any) => {
          logger.error(error, "Error creating static video from multiple images");
          reject(error);
        })
        .save(outputPath);
    });
  }

  /**
   * Extract audio from video file (for Whisper)
   */
  async extractAudioFromVideo(
    videoPath: string,
    outputAudioPath: string
  ): Promise<void> {
    logger.debug({ videoPath, outputAudioPath }, "Extracting audio from video");

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat('wav')
        .on('start', (commandLine) => {
          logger.debug('FFmpeg extractAudioFromVideo command: ' + commandLine);
        })
        .on('end', () => {
          logger.debug({ outputAudioPath }, "Audio extraction complete");
          resolve();
        })
        .on('error', (error: any) => {
          logger.error(error, "Error extracting audio from video");
          reject(error);
        })
        .save(outputAudioPath);
    });
  }

  /**
   * Replace video's audio track with new audio
   * Uses re-encoding for VEO 3.1 compatibility
   */
  async replaceVideoAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    audioDuration: number
  ): Promise<void> {
    logger.debug({
      videoPath,
      audioPath,
      outputPath,
      audioDuration
    }, "Replacing video audio with TTS audio (re-encoding for VEO 3.1 compatibility)");

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-map 0:v',
          '-map 1:a',
          '-c:v libx264',
          '-preset fast',
          '-crf 23',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-strict experimental'
        ])
        .on('start', (commandLine) => {
          logger.debug('FFmpeg replaceVideoAudio command: ' + commandLine);
        })
        .on('end', () => {
          logger.info({ outputPath }, "Video audio replaced with TTS audio");
          resolve();
        })
        .on('error', (error: any) => {
          logger.error(error, "Error replacing video audio");
          reject(error);
        })
        .save(outputPath);
    });
  }
}

export default VideoEditor;
