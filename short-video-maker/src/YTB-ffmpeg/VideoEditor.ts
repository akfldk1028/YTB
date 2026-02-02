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
import { logger } from "../logger";
import { OrientationEnum, RenderConfig, TitleTextConfig, SubtitleConfig } from "../types/shorts";
import { ffmpeg, findSubtitleFontPath } from "./utils";
import { SubtitleFilter, ProjectFontConfig } from "./SubtitleFilter";

export class VideoEditor {
  private subtitleFilter: SubtitleFilter;

  constructor() {
    this.subtitleFilter = new SubtitleFilter();
  }

  /**
   * Combine video with audio and captions
   * 🔥 sceneOverlays 추가: 씬별 제목 오버레이 지원
   * 🔥 fontConfig 추가: 프로젝트별 폰트 설정
   * 🔥 subtitleConfig 추가: 프로젝트별 자막 위치/스타일 설정
   */
  async combineVideoWithAudioAndCaptions(
    videoPath: string,
    audioPath: string,
    captions: any[],
    outputPath: string,
    durationSeconds: number,
    orientation: OrientationEnum,
    config: RenderConfig,
    skipSubtitles = false,
    sceneOverlays?: Array<{ text: string; startMs: number; endMs: number }>,  // 🔥 씬별 제목
    fontConfig?: ProjectFontConfig,  // 🔥 프로젝트별 폰트 설정 (SubtitleFilter에서 import)
    subtitleConfig?: SubtitleConfig  // 🔥 2026-01-19: 프로젝트별 자막 위치 (NewsProject=중앙, CatProject=하단)
  ): Promise<string> {
    logger.debug({ videoPath, audioPath, outputPath, hasOverlays: !!sceneOverlays }, "Combining video with audio using FFmpeg");

    const tempDir = path.dirname(outputPath);
    let allTextFilePaths: string[] = [];

    return new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .fps(30);

      // 🔥 필터들 수집 (제목 오버레이 + 자막)
      const filters: string[] = [];

      // 1. 씬별 제목 오버레이 (상단) - fontConfig 전달
      if (sceneOverlays && sceneOverlays.length > 0) {
        const overlayResult = this.subtitleFilter.createSceneOverlayFilter(sceneOverlays, orientation, tempDir, fontConfig);
        if (overlayResult) {
          filters.push(overlayResult.filter);
          allTextFilePaths.push(...overlayResult.textFilePaths);
          logger.info({ overlayCount: sceneOverlays.length, fontConfig: fontConfig || 'DEFAULT' }, "Added scene overlay filter with font config");
        }
      }

      // 2. 자막 (하단/중앙) - 🔥 subtitleConfig로 위치 제어 가능
      if (!skipSubtitles && captions && captions.length > 0) {
        const subtitleResult = this.subtitleFilter.createSubtitleFilter(captions, orientation, tempDir, subtitleConfig);
        if (subtitleResult) {
          filters.push(subtitleResult.filter);
          allTextFilePaths.push(...subtitleResult.textFilePaths);
        }
      }

      // 필터 적용
      if (filters.length > 0) {
        const combinedFilter = filters.join(',');
        const fullFilter = `[0:v]${combinedFilter}[v]`;

        // Windows ENAMETOOLONG 방지: 필터가 8KB 이상이면 파일로 저장
        if (fullFilter.length > 8000 && tempDir) {
          const filterScriptPath = path.join(tempDir, `filter_complex_${Date.now()}.txt`);
          fs.writeFileSync(filterScriptPath, fullFilter, 'utf-8');
          allTextFilePaths.push(filterScriptPath);
          ffmpegCommand.outputOptions([
            '-filter_complex_script', filterScriptPath,
            '-map', '[v]',
            '-map', '1:a:0',
            `-t`, `${durationSeconds}`
          ]);
          logger.info({ filterLength: fullFilter.length, scriptPath: filterScriptPath }, 'Using filter_complex_script (filter too long for command line)');
        } else {
          ffmpegCommand.complexFilter(fullFilter);
          ffmpegCommand.outputOptions([
            '-map', '[v]',
            '-map', '1:a:0',
            `-t ${durationSeconds}`
          ]);
        }
      } else {
        ffmpegCommand.outputOptions([
          '-map', '0:v:0',
          '-map', '1:a:0',
          `-t ${durationSeconds}`
        ]);
      }

      // 🔥 stderr 수집용 변수
      let stderrOutput = '';

      ffmpegCommand
        .on('start', (commandLine: string) => {
          // 로그 크기 제한 - 처음 500자와 마지막 300자만 표시
          if (commandLine.length > 1000) {
            const preview = commandLine.substring(0, 500) + '... [' + (commandLine.length - 800) + ' chars hidden] ...' + commandLine.substring(commandLine.length - 300);
            logger.info({ commandLength: commandLine.length }, 'FFmpeg combine command (truncated): ' + preview);
          } else {
            logger.info('FFmpeg combine command: ' + commandLine);
          }
        })
        .on('stderr', (stderrLine: string) => {
          // 🔥 FFmpeg stderr 수집 (drawtext 에러 디버깅용)
          stderrOutput += stderrLine + '\n';
          // 중요한 에러/경고만 로깅 (Fontconfig, freetype, drawtext 관련)
          if (stderrLine.includes('Fontconfig') || stderrLine.includes('freetype') ||
              stderrLine.includes('drawtext') || stderrLine.includes('Cannot') ||
              stderrLine.includes('Error') || stderrLine.includes('error')) {
            logger.warn({ stderr: stderrLine }, '[FFmpeg stderr] Font/drawtext related');
          }
        })
        .on('end', () => {
          // 🔥 최종 stderr 요약 로깅 (마지막 500자)
          if (stderrOutput.length > 0) {
            const stderrSummary = stderrOutput.length > 500
              ? '...' + stderrOutput.slice(-500)
              : stderrOutput;
            logger.debug({ stderrLength: stderrOutput.length, summary: stderrSummary }, '[FFmpeg] stderr summary');
          }
          // Clean up all text files
          if (allTextFilePaths.length > 0) {
            allTextFilePaths.forEach((filePath) => {
              try {
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
              } catch (e) {
                logger.warn({ filePath }, "Failed to clean up text file");
              }
            });
            logger.debug({ cleanedFiles: allTextFilePaths.length }, "Cleaned up text files");
          }
          logger.debug({ outputPath }, "Video combination complete");
          resolve(outputPath);
        })
        .on('error', (error: any) => {
          // Clean up text files on error too
          allTextFilePaths.forEach((filePath) => {
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
   * Trim video to specified duration AND resize to target dimensions
   * Used for Pexels stock videos in NewsProject
   * ⚠️ 오디오 없이 출력 (나중에 TTS 오디오와 합성됨)
   * 🔥 FIX: 비디오가 짧으면 loop 적용하여 duration 맞춤
   */
  async trimAndResizeVideo(
    inputPath: string,
    outputPath: string,
    duration: number,
    dimensions: { width: number; height: number }
  ): Promise<void> {
    logger.debug({ inputPath, outputPath, duration, dimensions }, "Trimming and resizing video (no audio)");

    // 🔥 먼저 소스 비디오의 실제 길이 확인
    const sourceDuration = await this.getVideoDuration(inputPath);
    const needsLoop = sourceDuration < duration;

    if (needsLoop) {
      logger.warn({
        inputPath,
        sourceDuration,
        requiredDuration: duration,
        shortfall: duration - sourceDuration
      }, "🔄 Source video shorter than required - applying loop");
    }

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath);

      // 🔥 비디오가 짧으면 loop 적용
      if (needsLoop) {
        command
          .inputOptions(['-stream_loop', '-1'])  // 무한 루프
          .setDuration(duration);  // 정확한 duration에서 자르기
      } else {
        command.setDuration(duration);
      }

      command
        .videoCodec('libx264')
        .noAudio()  // 🔥 오디오 제거 - TTS 오디오와 나중에 합성됨
        .size(`${dimensions.width}x${dimensions.height}`)
        .autopad(true, 'black')  // 비율 유지 + 검은색 패딩
        .outputOptions([
          '-preset', 'fast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p'
        ])
        .on('start', (commandLine) => {
          logger.debug('FFmpeg trimAndResize command: ' + commandLine);
        })
        .on('end', () => {
          logger.debug({ outputPath, duration, dimensions, looped: needsLoop }, "Video trim+resize complete");
          resolve();
        })
        .on('error', (err) => {
          logger.error({ error: err, inputPath, outputPath }, "FFmpeg video trim+resize failed");
          reject(err);
        })
        .save(outputPath);
    });
  }

  /**
   * Get video duration using ffprobe
   */
  private async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath).ffprobe((err, data) => {
        if (err) {
          logger.warn({ error: err.message, videoPath }, "Failed to get video duration, assuming 0");
          resolve(0);
          return;
        }
        const duration = data.format?.duration || 0;
        resolve(duration);
      });
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
   * 🔥 2026-01-19: subtitleConfig 추가 - catproject는 자막 위치 하단 (h*0.70)
   */
  async addTitleAndSubtitlesToVideo(
    inputVideoPath: string,
    outputVideoPath: string,
    titleText: TitleTextConfig | null,
    primaryCaptions: any[],
    secondaryCaptions: any[] | null,
    orientation: OrientationEnum,
    videoDuration: number,
    language?: 'english' | 'korean',
    subtitleConfig?: SubtitleConfig  // 🔥 catproject: { yPosition: 'h*0.70' }
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
      videoDuration,
      subtitleYPosition: subtitleConfig?.yPosition || 'default'
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

      // Dual subtitle filter - 🔥 subtitleConfig로 위치 조정 가능
      if (primaryCaptions && primaryCaptions.length > 0) {
        const subtitleResult = this.subtitleFilter.createDualLanguageSubtitleFilter(
          primaryCaptions,
          secondaryCaptions || [],
          orientation,
          tempDir,
          subtitleConfig  // 🔥 catproject: { yPosition: 'h*0.70' } 전달
        );
        if (subtitleResult) {
          filters.push(subtitleResult.filter);
          subtitleTextFilePaths = subtitleResult.textFilePaths;
          logger.info({
            subtitleTextFileCount: subtitleTextFilePaths.length,
            filterLength: subtitleResult.filter.length,
            subtitleYPosition: subtitleConfig?.yPosition || 'default'
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
   * v3.1.3: Create static video from image with formula text overlay (drawtext)
   * Uses FFmpeg drawtext filter instead of PNG image overlay
   * - No CodeCogs watermark
   * - Semi-transparent background box for readability
   * - Same font system as SubtitleFilter
   */
  /**
   * v3.2.0: Create static video with formula overlay
   * pngPath가 있으면 PNG overlay, 없으면 drawtext fallback
   */
  async createStaticVideoWithFormulaOverlay(
    imagePath: string,
    outputPath: string,
    duration: number,
    dimensions: string,
    formulaTexts: Array<{
      text: string;
      position?: 'center' | 'top' | 'bottom';
      pngPath?: string;
      pngWidth?: number;
      pngHeight?: number;
    }>
  ): Promise<void> {
    if (formulaTexts.length === 0) {
      return this.createStaticVideoFromImage(imagePath, outputPath, duration, dimensions);
    }

    const singleFormula = formulaTexts[0];

    // v3.2.0: PNG overlay가 있으면 새 메서드 사용
    if (singleFormula.pngPath && fs.existsSync(singleFormula.pngPath)) {
      return this.createVideoWithFormulaOverlayPng(
        imagePath, outputPath, duration, dimensions,
        singleFormula.pngPath,
        singleFormula.pngWidth || 0,
        singleFormula.pngHeight || 0,
        singleFormula.position || 'top'
      );
    }

    // drawtext fallback (pngPath 없을 때)
    if (!singleFormula.text) {
      return this.createStaticVideoFromImage(imagePath, outputPath, duration, dimensions);
    }

    logger.info({
      imagePath,
      outputPath,
      duration,
      dimensions,
      formulaCount: formulaTexts.length,
      formulaText: singleFormula.text.substring(0, 50),
    }, "📐 Creating static video with formula drawtext overlay (fallback)");

    const tempDir = path.dirname(outputPath);

    return new Promise((resolve, reject) => {
      // v3.2.4: Position calculation — top을 1%로 이동 (최최상단)
      let posY: string;
      switch (singleFormula.position) {
        case 'top':
          posY = `h*0.01`;
          break;
        case 'bottom':
          posY = `h*0.65`;
          break;
        default:
          posY = `(h-text_h)/2`;
      }

      // v3.1.4: 텍스트 최대 25자 제한 (화면 밖 잘림 방지)
      let displayText = singleFormula.text;
      if (displayText.length > 25) {
        displayText = displayText.substring(0, 25);
        logger.warn({ original: singleFormula.text.length, trimmed: 25 }, "Formula text trimmed to 25 chars");
      }

      // Write formula text to file for UTF-8 support
      const textFilePath = path.join(tempDir, `formula_text_${Date.now()}.txt`);
      fs.writeFileSync(textFilePath, displayText.normalize('NFC'), 'utf-8');

      // Get font path (same as SubtitleFilter)
      const fontPath = findSubtitleFontPath();

      // Build FFmpeg-safe paths
      const isWindows = process.platform === 'win32';
      const safeFontPath = isWindows
        ? `'${fontPath.replace(/\\/g, '/').replace(/:/g, '\\:')}'`
        : fontPath.replace(/\\/g, '/');
      const safeTextPath = isWindows
        ? `'${textFilePath.replace(/\\/g, '/').replace(/:/g, '\\:')}'`
        : textFilePath.replace(/\\/g, '/');

      // Adaptive font size based on text length
      const textLength = displayText.length;
      let fontSize: number;
      if (textLength <= 10) {
        fontSize = 52;
      } else if (textLength <= 18) {
        fontSize = 44;
      } else {
        fontSize = 36;
      }

      // drawtext filter with semi-transparent background box
      const drawtextFilter = [
        `drawtext=fontfile=${safeFontPath}`,
        `textfile=${safeTextPath}`,
        `fontcolor=white`,
        `fontsize=${fontSize}`,
        `x=(w-text_w)/2`,
        `y=${posY}`,
        `box=1`,
        `boxcolor=black@0.6`,
        `boxborderw=12`,
        `borderw=2`,
        `bordercolor=black`,
      ].join(':');

      logger.debug({ drawtextFilter, fontSize, textLength }, "📐 Formula drawtext filter (fallback)");

      ffmpeg()
        .input(imagePath)
        .inputOption('-loop 1')
        .inputOption(`-t ${duration}`)
        .videoCodec('libx264')
        .size(dimensions)
        .fps(30)
        .videoFilters(drawtextFilter)
        .outputOption('-pix_fmt yuv420p')
        .on('start', (commandLine) => {
          logger.debug('FFmpeg createStaticVideoWithFormulaOverlay command: ' + commandLine);
        })
        .on('end', () => {
          // Clean up text file
          try {
            if (fs.existsSync(textFilePath)) {
              fs.unlinkSync(textFilePath);
            }
          } catch (e) {
            logger.warn({ textFilePath }, "Failed to clean up formula text file");
          }
          logger.info({ outputPath }, "📐 Video with formula drawtext complete (fallback)");
          resolve();
        })
        .on('error', (error: any) => {
          try {
            if (fs.existsSync(textFilePath)) {
              fs.unlinkSync(textFilePath);
            }
          } catch (e) { /* ignore */ }
          logger.error({ error, formulaText: singleFormula.text }, "Error creating video with formula drawtext");
          reject(error);
        })
        .save(outputPath);
    });
  }

  /**
   * v3.2.0: MathJax PNG overlay로 수식 비디오 생성
   * FFmpeg [0:v][1:v]overlay 필터 사용
   */
  private createVideoWithFormulaOverlayPng(
    imagePath: string,
    outputPath: string,
    duration: number,
    dimensions: string,
    pngPath: string,
    pngWidth: number,
    pngHeight: number,
    position: 'center' | 'top' | 'bottom'
  ): Promise<void> {
    const [width, height] = dimensions.split('x').map(Number);

    // v3.2.4: Y 위치 계산 — top을 1%로 이동 (최최상단)
    let overlayY: string;
    switch (position) {
      case 'top':
        overlayY = `${Math.round(height * 0.01)}`;
        break;
      case 'bottom':
        overlayY = `${Math.round(height * 0.65)}`;
        break;
      default:
        overlayY = `(H-h)/2`;
    }

    // v3.2.4: 적응형 수식 스케일링 — 짧은 수식은 작게, 긴 수식만 크게
    // pngWidth 기준: 원본보다 작으면 upscale 금지, 원본 대비 적절한 비율 유지
    let targetWidth: number;
    const screenWidth = width;
    if (pngWidth < screenWidth * 0.2) {
      // 아주 짧은 수식 (β, α 등): 최대 25%
      targetWidth = Math.min(Math.round(screenWidth * 0.25), pngWidth * 3);
    } else if (pngWidth < screenWidth * 0.4) {
      // 짧은 수식 (E=mc²): 최대 40%
      targetWidth = Math.min(Math.round(screenWidth * 0.40), pngWidth * 2);
    } else if (pngWidth < screenWidth * 0.6) {
      // 중간 수식: 최대 60%
      targetWidth = Math.round(screenWidth * 0.60);
    } else {
      // 긴 수식: 최대 85%
      targetWidth = Math.round(screenWidth * 0.85);
    }

    logger.info({
      imagePath,
      pngPath,
      outputPath,
      duration,
      dimensions,
      position,
      overlayY,
      pngSize: `${pngWidth}x${pngHeight}`,
      scaledWidth: targetWidth,
    }, "📐 Creating static video with MathJax PNG overlay (v3.2.4)");

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(imagePath)
        .inputOption('-loop 1')
        .inputOption(`-t ${duration}`)
        .input(pngPath)
        .complexFilter([
          `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:-1:-1:color=black[bg]`,
          `[1:v]scale=${targetWidth}:-1[formula]`,
          `[bg][formula]overlay=(W-w)/2:${overlayY}[v]`
        ])
        .outputOption('-map [v]')
        .videoCodec('libx264')
        .fps(30)
        .outputOption('-pix_fmt yuv420p')
        .outputOption('-shortest')
        .on('start', (commandLine) => {
          logger.debug('FFmpeg createVideoWithFormulaOverlayPng command: ' + commandLine);
        })
        .on('end', () => {
          logger.info({ outputPath }, "📐 Video with MathJax PNG overlay complete (v3.2.0)");
          resolve();
        })
        .on('error', (error: any) => {
          logger.error({ error, pngPath }, "Error creating video with MathJax PNG overlay");
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
