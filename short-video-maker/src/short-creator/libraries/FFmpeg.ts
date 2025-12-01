import ffmpeg from "fluent-ffmpeg";
import { Readable } from "node:stream";
import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import { logger } from "../../logger";
import { OrientationEnum } from "../../types/shorts";
import type { RenderConfig } from "../../types/shorts";

// Font paths to check (in order of preference)
const FONT_PATHS = [
  // Docker/Cloud Run paths (fonts-nanum package)
  '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
  '/usr/share/fonts/truetype/nanum/NanumGothic-Bold.ttf',
  // Local development paths
  '/home/akfldk1028/.fonts/NanumGothic-Bold.ttf',
  // Fallback to DejaVu Sans (commonly available)
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  // Ubuntu/Debian default fonts
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
];

// Cache the found font path
let cachedFontPath: string | null = null;

/**
 * Find the first available font path from the list of candidates
 */
function findAvailableFontPath(): string {
  if (cachedFontPath) {
    return cachedFontPath;
  }

  for (const fontPath of FONT_PATHS) {
    if (fs.existsSync(fontPath)) {
      logger.info({ fontPath }, "Found available font for captions");
      cachedFontPath = fontPath;
      return fontPath;
    }
  }

  // If no font found, log warning and return first path (will fail gracefully)
  logger.warn({ triedPaths: FONT_PATHS }, "No font file found for captions, subtitles may not render");
  return FONT_PATHS[0];
}

export class FFMpeg {
  static async init(): Promise<FFMpeg> {
    return import("@ffmpeg-installer/ffmpeg").then((ffmpegInstaller) => {
      ffmpeg.setFfmpegPath(ffmpegInstaller.path);
      logger.info(`FFmpeg path set to: ${ffmpegInstaller.path}`);
      // Log the font path that will be used
      const fontPath = findAvailableFontPath();
      logger.info(`Caption font path: ${fontPath}`);
      return new FFMpeg();
    });
  }

  async saveNormalizedAudio(
    audio: ArrayBuffer,
    outputPath: string,
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

  async combineVideoWithAudioAndCaptions(
    videoPath: string,
    audioPath: string,
    captions: any[],
    outputPath: string,
    durationSeconds: number,
    orientation: OrientationEnum,
    config: RenderConfig,
    skipSubtitles = false // 멀티씬에서 개별 씬 처리시 자막 건너뛰기
  ): Promise<string> {
    logger.debug({ videoPath, audioPath, outputPath }, "Combining video with audio using FFmpeg");

    return new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .fps(30); // Normalize to 30fps to ensure consistent frame rate for concatenation

      // Add subtitle filter for captions if available (unless skipped for multi-scene)
      if (!skipSubtitles && captions && captions.length > 0) {
        const subtitleFilter = this.createSubtitleFilter(captions, orientation);
        if (subtitleFilter) {
          // Use complex filter for subtitles
          ffmpegCommand.complexFilter(`[0:v]${subtitleFilter}[v]`);
          ffmpegCommand.outputOptions([
            '-map', '[v]',    // Use filtered video
            '-map', '1:a:0',  // Use audio from second input
            '-shortest',      // Stop when shortest input ends
            `-t ${durationSeconds}` // Set duration
          ]);
        } else {
          // No subtitle filter, use simple mapping
          ffmpegCommand.outputOptions([
            '-map', '0:v:0',  // Use video from first input
            '-map', '1:a:0',  // Use audio from second input
            '-shortest',      // Stop when shortest input ends
            `-t ${durationSeconds}` // Set duration
          ]);
        }
      } else {
        // No subtitle, use simple mapping
        ffmpegCommand.outputOptions([
          '-map', '0:v:0',  // Use video from first input
          '-map', '1:a:0',  // Use audio from second input
          '-shortest',      // Stop when shortest input ends
          `-t ${durationSeconds}` // Set duration
        ]);
      }

      ffmpegCommand
        .on('end', () => {
          logger.debug({ outputPath }, "Video combination complete");
          resolve(outputPath);
        })
        .on('error', (error: any) => {
          logger.error(error, "Error combining video with audio");
          reject(error);
        })
        .save(outputPath);
    });
  }

  /**
   * 🔥 TikTok/Shorts 스타일 자막 필터 생성
   *
   * 단어별 하이라이트 효과:
   * - 여러 단어를 함께 표시
   * - 현재 발화중인 단어만 노란색 하이라이트
   * - fontcolor_expr로 시간 기반 색상 변경
   */
  private createSubtitleFilter(captions: any[], orientation: OrientationEnum): string | null {
    try {
      if (!captions || captions.length === 0) return null;

      // 🔥 TikTok/Shorts 스타일 설정
      const fontSize = orientation === OrientationEnum.portrait ? 52 : 60; // 더 크게!
      const yPosition = orientation === OrientationEnum.portrait ? 'h*0.72' : 'h*0.78'; // Shorts 안전 영역

      // Dynamic font path (works in both local and Docker/Cloud Run)
      const fontPath = findAvailableFontPath();

      // 🔥 TikTok 스타일 색상
      const normalColor = 'FFFFFF'; // 흰색 (비활성)
      const highlightColor = 'FFEB3B'; // 노란색 (활성)
      const borderColor = 'black';
      const borderWidth = 4;

      // 단어들을 그룹으로 묶기 (2-3 단어씩)
      const wordGroups = this.groupWordsForDisplay(captions, 3);

      const drawTextFilters: string[] = [];

      wordGroups.forEach((group, groupIndex) => {
        const groupStartTime = group[0].startMs / 1000;
        const groupEndTime = group[group.length - 1].endMs / 1000;

        // 그룹 내 각 단어에 대해 drawtext 생성
        group.forEach((word, wordIndex) => {
          const wordStartTime = word.startMs / 1000;
          const wordEndTime = word.endMs / 1000;

          // 단어 텍스트 escape 및 대문자 변환
          const text = word.text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:').toUpperCase();

          // 단어의 x 위치 계산 (그룹 내 위치에 따라)
          // 간단한 방법: 이전 단어들의 너비 추정
          const wordsBefore = group.slice(0, wordIndex).map(w => w.text.toUpperCase()).join(' ');

          // 🔥 핵심: fontcolor_expr로 시간 기반 색상 변경
          // 현재 단어가 발화 중이면 노란색, 아니면 흰색
          const fontcolorExpr = `if(between(t\\,${wordStartTime}\\,${wordEndTime})\\,0x${highlightColor}\\,0x${normalColor})`;

          // x 위치: 중앙 정렬 기준으로 오프셋 계산
          // 그룹 전체 텍스트의 중앙에서 각 단어 위치 계산
          const fullGroupText = group.map(w => w.text.toUpperCase()).join(' ');
          const xPosition = wordIndex === 0
            ? `(w-text_w*${fullGroupText.length/text.length})/2`
            : `(w-text_w*${fullGroupText.length/text.length})/2+text_w*${wordsBefore.length/text.length}`;

          drawTextFilters.push(
            `drawtext=fontfile=${fontPath}:` +
            `text='${text} ':` + // 공백 추가로 단어 간격
            `fontcolor_expr=${fontcolorExpr}:` +
            `fontsize=${fontSize}:` +
            `x=(w-tw)/2:` + // 간단히 중앙 정렬 (복잡한 위치 계산 대신)
            `y=${yPosition}:` +
            `borderw=${borderWidth}:` +
            `bordercolor=${borderColor}:` +
            `enable=between(t\\,${groupStartTime}\\,${groupEndTime})`
          );
        });
      });

      // 너무 많은 필터는 성능 문제 발생 가능
      // 단순화: 단어별 개별 표시 (하이라이트 색상 적용)
      if (drawTextFilters.length > 50) {
        return this.createSimplifiedSubtitleFilter(captions, orientation);
      }

      return drawTextFilters.join(',');
    } catch (error) {
      logger.warn(error, "Could not create subtitle filter, falling back to simplified version");
      return this.createSimplifiedSubtitleFilter(captions, orientation);
    }
  }

  /**
   * 단어 그룹화 (n개씩 묶기)
   */
  private groupWordsForDisplay(captions: any[], maxWordsPerGroup: number): any[][] {
    const groups: any[][] = [];
    let currentGroup: any[] = [];

    captions.forEach((caption, index) => {
      currentGroup.push(caption);

      // 그룹이 꽉 찼거나, 다음 단어와 시간 차이가 크면 새 그룹
      const nextCaption = captions[index + 1];
      const timegap = nextCaption ? (nextCaption.startMs - caption.endMs) : 9999;

      if (currentGroup.length >= maxWordsPerGroup || timegap > 500) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }
    });

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * 🔥 간소화된 TikTok 스타일 자막 필터 (단어 하나씩 노란색)
   */
  private createSimplifiedSubtitleFilter(captions: any[], orientation: OrientationEnum): string | null {
    try {
      if (!captions || captions.length === 0) return null;

      const fontSize = orientation === OrientationEnum.portrait ? 56 : 64;
      const yPosition = orientation === OrientationEnum.portrait ? 'h*0.72' : 'h*0.78';
      // Dynamic font path (works in both local and Docker/Cloud Run)
      const fontPath = findAvailableFontPath();

      // 🔥 노란색 하이라이트 (TikTok 스타일)
      const fontColor = 'FFEB3B'; // 노란색!
      const borderColor = 'black';
      const borderWidth = 5;
      const shadowColor = 'black@0.7';

      const drawTextFilters = captions.map((caption) => {
        const startTime = caption.startMs / 1000;
        const endTime = caption.endMs / 1000;
        const text = caption.text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:').toUpperCase();

        return `drawtext=fontfile=${fontPath}:text='${text}':fontcolor=0x${fontColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}:borderw=${borderWidth}:bordercolor=${borderColor}:shadowcolor=${shadowColor}:shadowx=3:shadowy=3:enable=between(t\\,${startTime}\\,${endTime})`;
      });

      return drawTextFilters.join(',');
    } catch (error) {
      logger.warn(error, "Could not create simplified subtitle filter");
      return null;
    }
  }

  /**
   * Trim video to specified duration
   * Useful for trimming VEO3 videos (min 6s) to match shorter audio lengths
   */
  async trimVideo(inputPath: string, outputPath: string, duration: number): Promise<void> {
    logger.debug({ inputPath, outputPath, duration }, "Trimming video with FFmpeg");

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setDuration(duration)
        .outputOptions(['-c', 'copy']) // Copy without re-encoding for speed
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
   * 여러 비디오 파일을 FFmpeg concat demuxer로 결합
   * 무손실 결합을 위해 concat demuxer 사용 (재인코딩 없음)
   * Cloud Run 호환성을 위해 spawn 사용 (fluent-ffmpeg mergeToFile이 hang됨)
   */
  async concatVideos(inputPaths: string[], outputPath: string): Promise<string> {
    logger.info({ inputPaths, outputPath }, "Concatenating videos with FFmpeg spawn");

    if (inputPaths.length === 0) {
      throw new Error("No input paths provided");
    }

    if (inputPaths.length === 1) {
      // 단일 파일인 경우 복사만 수행
      fs.copyFileSync(inputPaths[0], outputPath);
      return outputPath;
    }

    // concat demuxer용 파일 리스트 생성
    const concatListPath = path.join(path.dirname(outputPath), `concat_list_${Date.now()}.txt`);
    const concatListContent = inputPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(concatListPath, concatListContent);

    logger.debug({ concatListPath, concatListContent }, "Created concat list file");

    try {
      // FFmpeg concat demuxer로 비디오 결합 (재인코딩 없음)
      await this.runFFmpegSpawn([
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        '-y',
        outputPath
      ], 300000); // 5분 타임아웃

      logger.info({ outputPath }, "Video merge complete via spawn");
      return outputPath;
    } finally {
      // concat 리스트 파일 정리
      try {
        fs.unlinkSync(concatListPath);
      } catch (cleanupError) {
        logger.warn({ cleanupError }, "Could not clean up concat list file");
      }
    }
  }

  /**
   * FFmpeg 명령을 spawn으로 실행 (Cloud Run 호환)
   * fluent-ffmpeg가 hang되는 문제 해결을 위해 직접 spawn 사용
   */
  private runFFmpegSpawn(args: string[], timeoutMs: number): Promise<string> {
    return new Promise(async (resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      // FFmpeg 경로 가져오기
      const ffmpegInstaller = await import("@ffmpeg-installer/ffmpeg");
      const ffmpegPath = ffmpegInstaller.path;

      logger.debug({ ffmpegPath, args, timeoutMs }, "Starting FFmpeg spawn process");

      const process = spawn(ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const timer = setTimeout(() => {
        killed = true;
        process.kill('SIGKILL');
        reject(new Error(`FFmpeg process timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
        // FFmpeg는 진행 상황을 stderr로 출력
        if (stderr.includes('frame=') || stderr.includes('time=')) {
          logger.debug({ progress: stderr.slice(-200) }, "FFmpeg progress");
        }
      });

      process.on('close', (code) => {
        clearTimeout(timer);
        if (killed) return;

        if (code === 0) {
          resolve(stdout);
        } else {
          logger.error({ code, stderr: stderr.slice(-500), stdout }, "FFmpeg process failed");
          reject(new Error(`FFmpeg process exited with code ${code}: ${stderr.slice(-500)}`));
        }
      });

      process.on('error', (error) => {
        clearTimeout(timer);
        logger.error({ error }, "FFmpeg spawn error");
        reject(new Error(`Failed to spawn FFmpeg process: ${error.message}`));
      });
    });
  }

  async concatAudios(inputPaths: string[], outputPath: string): Promise<string> {
    logger.debug({ inputPaths, outputPath }, "Concatenating audio files with FFmpeg");

    return new Promise(async (resolve, reject) => {
      try {
        if (inputPaths.length === 0) {
          reject(new Error("No audio input paths provided"));
          return;
        }

        if (inputPaths.length === 1) {
          // 단일 파일인 경우 복사만 수행
          fs.copyFileSync(inputPaths[0], outputPath);
          resolve(outputPath);
          return;
        }

        // fluent-ffmpeg concat filter 사용
        let ffmpegCommand = ffmpeg();

        // 모든 입력 파일 추가
        for (const inputPath of inputPaths) {
          ffmpegCommand = ffmpegCommand.input(inputPath);
        }

        // concat filter 설정 (audio only)
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


  /**
   * 기존 비디오에 시간 동기화된 자막 추가 (멀티씬용)
   */
  async addSubtitlesToVideo(
    inputVideoPath: string,
    outputVideoPath: string,
    captions: any[],
    orientation: OrientationEnum
  ): Promise<string> {
    logger.debug({ inputVideoPath, outputVideoPath, captionCount: captions.length }, "Adding synchronized subtitles to video");

    return new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg()
        .input(inputVideoPath)
        .videoCodec('libx264')
        .audioCodec('aac');

      // Add subtitle filter for captions
      if (captions && captions.length > 0) {
        const subtitleFilter = this.createSubtitleFilter(captions, orientation);
        if (subtitleFilter) {
          ffmpegCommand.videoFilters(subtitleFilter);
        }
      }

      ffmpegCommand
        .on('end', () => {
          logger.debug({ outputVideoPath }, "Subtitle addition complete");
          resolve(outputVideoPath);
        })
        .on('error', (error: any) => {
          logger.error(error, "Error adding subtitles to video");
          reject(error);
        })
        .save(outputVideoPath);
    });
  }

  /**
   * Create static video from image file
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
        .inputOption('-loop 1') // Loop the image
        .inputOption(`-t ${duration}`) // Duration in seconds
        .videoCodec('libx264')
        .size(dimensions)
        .fps(30)
        .outputOption('-pix_fmt yuv420p') // Ensure compatibility
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

      // Add each image as input with its duration
      imageDataList.forEach((imageData, index) => {
        ffmpegCommand
          .input(imageData.imagePath)
          .inputOption('-loop 1')
          .inputOption(`-t ${imageData.duration}`);
      });

      // Create filter complex for concatenation + scaling
      // Parse dimensions (e.g., "1080x1920" -> width=1080, height=1920)
      const [width, height] = dimensions.split('x').map(Number);

      const filterInputs = imageDataList.map((_, index) => `[${index}:v]`).join('');
      // Combine concat and scale in filter_complex to avoid -vf conflict
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
   * Extract audio from video file to WAV format (for Whisper)
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
   * Replace video's audio track with new audio file
   * Strips VEO3's native audio and adds TTS audio
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
    }, "Replacing video audio with TTS audio");

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        // Strip original audio from video, use only new audio
        // Note: Removed '-shortest' because video/audio durations are already matched
        // by trimming VEO3 videos to audio length in ConsistentShortsWorkflow
        .outputOptions([
          '-map 0:v',           // Map video from first input
          '-map 1:a',           // Map audio from second input
          '-c:v copy',          // Copy video codec (no re-encoding)
          '-c:a aac',           // Encode audio to AAC
          '-strict experimental'
        ])
        .on('start', (commandLine) => {
          logger.debug('FFmpeg replaceVideoAudio command: ' + commandLine);
        })
        .on('end', () => {
          logger.info({ outputPath }, "✅ Video audio replaced with TTS audio");
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
