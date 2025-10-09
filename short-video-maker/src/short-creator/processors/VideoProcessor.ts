import fs from "fs-extra";
import path from "path";
import cuid from "cuid";
import { FFMpeg } from "../libraries/FFmpeg";
import { OrientationEnum } from "../../types/shorts";
import { VIDEO_DIMENSIONS } from "../utils/Constants";
import { logger } from "../../logger";
import type { RenderConfig } from "../../types/shorts";

export interface VideoProcessingConfig {
  tempDirPath: string;
  videosDirPath: string;
}

export interface VideoProcessingResult {
  outputPath: string;
  duration: number;
}

export interface StaticVideoData {
  imagePath: string;
  duration: number;
}

export class VideoProcessor {
  constructor(
    private ffmpeg: FFMpeg,
    private config: VideoProcessingConfig
  ) {}

  async processSingleScene(
    videoUrl: string,
    audioUrl: string,
    captions: any[],
    duration: number,
    orientation: OrientationEnum,
    renderConfig: RenderConfig,
    outputPath: string,
    skipSubtitles = false
  ): Promise<VideoProcessingResult> {
    try {
      logger.debug({ videoUrl, audioUrl, outputPath }, "Processing single scene");

      // Handle both URL format and direct file paths
      let tempVideoPath: string;
      let tempAudioPath: string;

      // Check if videoUrl is a full file path (starts with / or contains temp dir)
      if (videoUrl.startsWith('/') || videoUrl.includes(this.config.tempDirPath)) {
        tempVideoPath = videoUrl;
        logger.debug({ tempVideoPath }, "Using direct video file path");
      } else {
        // Extract file name from URL
        const videoFileName = videoUrl.split('/').pop();
        tempVideoPath = path.join(this.config.tempDirPath, videoFileName!);
        logger.debug({ tempVideoPath }, "Reconstructed video path from URL");
      }

      // Check if audioUrl is a full file path
      if (audioUrl.startsWith('/') || audioUrl.includes(this.config.tempDirPath)) {
        tempAudioPath = audioUrl;
        logger.debug({ tempAudioPath }, "Using direct audio file path");
      } else {
        // Extract file name from URL
        const audioFileName = audioUrl.split('/').pop();
        tempAudioPath = path.join(this.config.tempDirPath, audioFileName!);
        logger.debug({ tempAudioPath }, "Reconstructed audio path from URL");
      }

      // Verify files exist
      if (!fs.existsSync(tempVideoPath)) {
        throw new Error(`Temp video file not found: ${tempVideoPath}`);
      }
      if (!fs.existsSync(tempAudioPath)) {
        throw new Error(`Temp audio file not found: ${tempAudioPath}`);
      }
      
      // Use FFmpeg to combine video with audio and captions
      await this.ffmpeg.combineVideoWithAudioAndCaptions(
        tempVideoPath,
        tempAudioPath,
        captions,
        outputPath,
        duration,
        orientation,
        renderConfig,
        skipSubtitles
      );

      return {
        outputPath,
        duration
      };
    } catch (error) {
      logger.error(error, "Failed to process single scene");
      throw new Error(`Single scene processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async replaceVeo3AudioWithTTS(
    videoUrl: string,
    audioUrl: string,
    audioDuration: number,
    outputPath: string
  ): Promise<VideoProcessingResult> {
    try {
      logger.info({ videoUrl, audioUrl, outputPath }, "Replacing VEO3 audio with TTS audio");

      // Extract file names from URLs
      const videoFileName = videoUrl.split('/').pop();
      const audioFileName = audioUrl.split('/').pop();

      const tempVideoPath = path.join(this.config.tempDirPath, videoFileName!);
      const tempAudioPath = path.join(this.config.tempDirPath, audioFileName!);

      // Verify files exist
      if (!fs.existsSync(tempVideoPath)) {
        throw new Error(`Temp video file not found: ${tempVideoPath}`);
      }
      if (!fs.existsSync(tempAudioPath)) {
        throw new Error(`Temp audio file not found: ${tempAudioPath}`);
      }

      // Strip VEO3 audio and add TTS audio
      await this.ffmpeg.replaceVideoAudio(
        tempVideoPath,
        tempAudioPath,
        outputPath,
        audioDuration
      );

      logger.info({ outputPath }, "✅ VEO3 video audio replaced with TTS");

      return {
        outputPath,
        duration: audioDuration
      };
    } catch (error) {
      logger.error(error, "Failed to replace VEO3 audio with TTS");
      throw new Error(`VEO3 audio replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async copyVideoAsIs(
    videoUrl: string,
    outputPath: string
  ): Promise<VideoProcessingResult> {
    try {
      logger.info({ videoUrl, outputPath }, "Copying VEO3 video as-is (audio already included)");

      // Extract file name from URL
      const videoFileName = videoUrl.split('/').pop();
      const tempVideoPath = path.join(this.config.tempDirPath, videoFileName!);

      // Verify file exists
      if (!fs.existsSync(tempVideoPath)) {
        throw new Error(`Temp video file not found: ${tempVideoPath}`);
      }

      // Simply copy the video file (already has audio from VEO3)
      fs.copyFileSync(tempVideoPath, outputPath);

      logger.info({ outputPath }, "✅ VEO3 video copied successfully");

      // Get video duration from file stats (rough estimate)
      const stats = fs.statSync(outputPath);
      const duration = 8; // VEO3 default is 8 seconds

      return {
        outputPath,
        duration
      };
    } catch (error) {
      logger.error(error, "Failed to copy VEO3 video");
      throw new Error(`VEO3 video copy failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async copyVideoToScene(
    videoUrl: string,
    outputPath: string
  ): Promise<void> {
    try {
      logger.debug({ videoUrl, outputPath }, "Copying VEO3 video to scene path");

      // Extract file name from URL
      const videoFileName = videoUrl.split('/').pop();
      const tempVideoPath = path.join(this.config.tempDirPath, videoFileName!);

      // Verify file exists
      if (!fs.existsSync(tempVideoPath)) {
        throw new Error(`Temp video file not found: ${tempVideoPath}`);
      }

      // Simply copy the video file (already has audio from VEO3)
      fs.copyFileSync(tempVideoPath, outputPath);

      logger.debug({ outputPath }, "VEO3 scene video copied");
    } catch (error) {
      logger.error(error, "Failed to copy VEO3 scene video");
      throw new Error(`VEO3 scene video copy failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async concatenateScenes(
    sceneVideoPaths: string[],
    outputPath: string
  ): Promise<VideoProcessingResult> {
    try {
      logger.debug({ sceneVideoPaths, outputPath }, "Concatenating scenes");

      await this.ffmpeg.concatVideos(sceneVideoPaths, outputPath);

      // Calculate total duration (rough estimate)
      const stats = fs.statSync(outputPath);
      const duration = Math.max(stats.size / (1024 * 1024), 1); // Rough estimate

      return {
        outputPath,
        duration
      };
    } catch (error) {
      logger.error(error, "Failed to concatenate scenes");
      throw new Error(`Scene concatenation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async concatenateAudioFiles(
    audioFilePaths: string[],
    outputPath: string
  ): Promise<void> {
    try {
      logger.debug({ audioFilePaths, outputPath }, "Concatenating audio files");

      await this.ffmpeg.concatAudios(audioFilePaths, outputPath);

      logger.info({ outputPath }, "✅ Audio files concatenated successfully");
    } catch (error) {
      logger.error(error, "Failed to concatenate audio files");
      throw new Error(`Audio concatenation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async addSubtitlesToVideo(
    videoPath: string,
    outputPath: string,
    captions: any[],
    orientation: OrientationEnum
  ): Promise<VideoProcessingResult> {
    try {
      logger.debug({ videoPath, outputPath, captionCount: captions.length }, "Adding subtitles to video");

      await this.ffmpeg.addSubtitlesToVideo(videoPath, outputPath, captions, orientation);

      const stats = fs.statSync(outputPath);
      const duration = Math.max(stats.size / (1024 * 1024), 1);

      return {
        outputPath,
        duration
      };
    } catch (error) {
      logger.error(error, "Failed to add subtitles to video");
      throw new Error(`Subtitle addition failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createStaticVideoFromImage(
    imagePath: string,
    duration: number,
    orientation: OrientationEnum,
    outputPath: string
  ): Promise<VideoProcessingResult> {
    try {
      logger.debug({ imagePath, duration, orientation, outputPath }, "Creating static video from image");

      const dimensions = orientation === OrientationEnum.portrait 
        ? VIDEO_DIMENSIONS.PORTRAIT 
        : VIDEO_DIMENSIONS.LANDSCAPE;
      
      await this.ffmpeg.createStaticVideoFromImage(
        imagePath,
        outputPath,
        duration,
        dimensions
      );

      return {
        outputPath,
        duration
      };
    } catch (error) {
      logger.error(error, "Failed to create static video from image");
      throw new Error(`Static video creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createStaticVideoFromMultipleImages(
    imageDataList: StaticVideoData[],
    outputPath: string,
    dimensions: string
  ): Promise<VideoProcessingResult> {
    try {
      logger.debug({ imageDataList: imageDataList.length, outputPath }, "Creating static video from multiple images");

      await this.ffmpeg.createStaticVideoFromMultipleImages(
        imageDataList,
        outputPath,
        dimensions
      );

      const totalDuration = imageDataList.reduce((sum, img) => sum + img.duration, 0);

      return {
        outputPath,
        duration: totalDuration
      };
    } catch (error) {
      logger.error(error, "Failed to create static video from multiple images");
      throw new Error(`Multi-image static video creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async saveImageToFile(
    imageData: { data: string; mimeType: string },
    outputPath: string
  ): Promise<string> {
    try {
      logger.debug({ outputPath }, "Saving image to file");

      const imageBuffer = Buffer.from(imageData.data, 'base64');
      await fs.writeFile(outputPath, imageBuffer);

      return outputPath;
    } catch (error) {
      logger.error(error, "Failed to save image to file");
      throw new Error(`Image save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  createTempPath(filename: string): string {
    return path.join(this.config.tempDirPath, filename);
  }

  createOutputPath(videoId: string): string {
    return path.join(this.config.videosDirPath, `${videoId}.mp4`);
  }

  createVideoTempDir(videoId: string): string {
    return path.join(this.config.tempDirPath, videoId);
  }
}