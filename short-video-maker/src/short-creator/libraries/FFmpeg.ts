import ffmpeg from "fluent-ffmpeg";
import { Readable } from "node:stream";
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
    config: RenderConfig
  ): Promise<string> {
    logger.debug({ videoPath, audioPath, outputPath }, "Combining video with audio using FFmpeg");

    return new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-map', '0:v:0',  // Use video from first input
          '-map', '1:a:0',  // Use audio from second input
          '-shortest',      // Stop when shortest input ends
          `-t ${durationSeconds}` // Set duration
        ]);

      // Add subtitle filter for captions if available
      if (captions && captions.length > 0) {
        // Create a simple subtitle track (you might want to enhance this)
        const subtitleFilter = this.createSubtitleFilter(captions, orientation);
        if (subtitleFilter) {
          ffmpegCommand.videoFilters(subtitleFilter);
        }
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
      const drawTextFilters = captions.map((caption, index) => {
        const startTime = caption.startMs / 1000; // Convert to seconds
        const endTime = caption.endMs / 1000;
        const text = caption.text.replace(/'/g, "\\'"); // Escape quotes
        
        return `drawtext=fontfile=${fontPath}:text='${text}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=black@0.7:boxborderw=5:enable='between(t,${startTime},${endTime})'`;
      });
      
      // Join all filters
      return drawTextFilters.join(',');
    } catch (error) {
      logger.warn(error, "Could not create subtitle filter");
      return null;
    }
  }
}
