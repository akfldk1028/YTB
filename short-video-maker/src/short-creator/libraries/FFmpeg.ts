import ffmpeg from "fluent-ffmpeg";
import { Readable } from "node:stream";
import path from "path";
import fs from "fs-extra";
import { logger } from "../../logger";
import { OrientationEnum } from "../../types/shorts";
import type { RenderConfig } from "../../types/shorts";

export class FFMpeg {
  static async init(): Promise<FFMpeg> {
    return import("@ffmpeg-installer/ffmpeg").then((ffmpegInstaller) => {
      ffmpeg.setFfmpegPath(ffmpegInstaller.path);
      logger.info(`FFmpeg path set to: ${ffmpegInstaller.path}`);
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
        .audioCodec('aac');

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

  private createSubtitleFilter(captions: any[], orientation: OrientationEnum): string | null {
    try {
      if (!captions || captions.length === 0) return null;

      const fontSize = orientation === OrientationEnum.portrait ? 32 : 40; // Larger for better readability
      const yPosition = orientation === OrientationEnum.portrait ? 'h*0.8' : 'h*0.85';

      // Use Nanum Gothic for proper Korean support
      const fontPath = '/home/akfldk1028/.fonts/NanumGothic-Regular.ttf';

      // Create multiple drawtext filters for each caption with timing
      // Important: In FFmpeg filter_complex, we need to properly escape special characters
      // Colons should NOT be escaped in filter parameters
      // Single quotes in text need to be escaped, but the enable parameter uses single quotes differently
      const drawTextFilters = captions.map((caption, index) => {
        const startTime = caption.startMs / 1000; // Convert to seconds
        const endTime = caption.endMs / 1000;
        // Escape single quotes and other special chars for FFmpeg
        const text = caption.text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:');

        // Use double quotes for enable to avoid nesting single quotes
        return `drawtext=fontfile=${fontPath}:text='${text}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=black@0.7:boxborderw=5:enable=between(t\\,${startTime}\\,${endTime})`;
      });

      // Join all filters with comma
      return drawTextFilters.join(',');
    } catch (error) {
      logger.warn(error, "Could not create subtitle filter");
      return null;
    }
  }

  /**
   * 여러 비디오 파일을 FFmpeg concat demuxer로 결합
   * 무손실 결합을 위해 concat demuxer 사용 (재인코딩 없음)
   */
  async concatVideos(inputPaths: string[], outputPath: string): Promise<string> {
    logger.debug({ inputPaths, outputPath }, "Concatenating videos with FFmpeg mergeToFile");
    
    return new Promise(async (resolve, reject) => {
      try {
        if (inputPaths.length === 0) {
          reject(new Error("No input paths provided"));
          return;
        }
        
        if (inputPaths.length === 1) {
          // 단일 파일인 경우 복사만 수행
          fs.copyFileSync(inputPaths[0], outputPath);
          resolve(outputPath);
          return;
        }

        // fluent-ffmpeg의 mergeToFile 사용 (부드러운 연결 보장)
        let ffmpegCommand = ffmpeg(inputPaths[0]);
        
        // 나머지 입력 파일들 추가
        for (let i = 1; i < inputPaths.length; i++) {
          ffmpegCommand = ffmpegCommand.input(inputPaths[i]);
        }

        // 임시 디렉토리 생성 (mergeToFile에서 요구함)
        const tempDir = path.join(path.dirname(outputPath), `temp_merge_${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });
        
        ffmpegCommand
          .on('start', (commandLine) => {
            logger.debug('FFmpeg mergeToFile command: ' + commandLine);
          })
          .on('progress', (progress) => {
            logger.debug(`Merge progress: ${Math.floor(progress.percent || 0)}% done`);
          })
          .on('end', () => {
            logger.debug({ outputPath }, "Video merge complete");
            // 임시 디렉토리 정리
            try {
              fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (error) {
              logger.warn(error, "Could not clean up temp merge directory");
            }
            resolve(outputPath);
          })
          .on('error', (error) => {
            logger.error(error, "FFmpeg merge failed");
            // 임시 디렉토리 정리
            try {
              fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
              logger.warn(cleanupError, "Could not clean up temp merge directory after error");
            }
            reject(error);
          })
          .mergeToFile(outputPath, tempDir);

      } catch (error) {
        logger.error(error, "Error setting up FFmpeg mergeToFile");
        reject(error);
      }
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
        .outputOptions([
          '-map 0:v',           // Map video from first input
          '-map 1:a',           // Map audio from second input
          '-c:v copy',          // Copy video codec (no re-encoding)
          '-c:a aac',           // Encode audio to AAC
          '-shortest',          // End output at shortest input duration
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
