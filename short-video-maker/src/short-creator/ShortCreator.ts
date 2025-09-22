import { OrientationEnum } from "./../types/shorts";
/* eslint-disable @remotion/deterministic-randomness */
import fs from "fs-extra";
import cuid from "cuid";
import path from "path";
import https from "https";
import http from "http";

import { Kokoro } from "./libraries/Kokoro";
import { Remotion } from "./libraries/Remotion";
import { Whisper } from "./libraries/Whisper";
import { FFMpeg } from "./libraries/FFmpeg";
import { PexelsAPI } from "./libraries/Pexels";
import { GoogleVeoAPI } from "./libraries/GoogleVeo";
import { LeonardoAI } from "./libraries/LeonardoAI";
import { Config } from "../config";
import { logger } from "../logger";
import { MusicManager } from "./music";
import type {
  SceneInput,
  RenderConfig,
  Scene,
  VideoStatus,
  MusicMoodEnum,
  MusicTag,
  MusicForVideo,
} from "../types/shorts";

export class ShortCreator {
  private queue: {
    sceneInput: SceneInput[];
    config: RenderConfig;
    id: string;
  }[] = [];
  constructor(
    private config: Config,
    private remotion: Remotion,
    private kokoro: Kokoro,
    private whisper: Whisper,
    private ffmpeg: FFMpeg,
    private pexelsApi: PexelsAPI,
    private musicManager: MusicManager,
    private googleVeoApi?: GoogleVeoAPI,
    private leonardoApi?: LeonardoAI,
  ) {}

  public status(id: string): VideoStatus {
    const videoPath = this.getVideoPath(id);
    if (this.queue.find((item) => item.id === id)) {
      return "processing";
    }
    if (fs.existsSync(videoPath)) {
      return "ready";
    }
    return "failed";
  }

  public addToQueue(sceneInput: SceneInput[], config: RenderConfig): string {
    // todo add mutex lock
    const id = cuid();
    this.queue.push({
      sceneInput,
      config,
      id,
    });
    if (this.queue.length === 1) {
      this.processQueue();
    }
    return id;
  }

  private async processQueue(): Promise<void> {
    // todo add a semaphore
    if (this.queue.length === 0) {
      return;
    }
    const { sceneInput, config, id } = this.queue[0];
    logger.debug(
      { sceneInput, config, id },
      "Processing video item in the queue",
    );
    try {
      await this.createShort(id, sceneInput, config);
      logger.debug({ id }, "Video created successfully");
    } catch (error: unknown) {
      logger.error(error, "Error creating video");
    } finally {
      this.queue.shift();
      this.processQueue();
    }
  }

  private async createShort(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig,
  ): Promise<string> {
    logger.debug(
      {
        inputScenes,
        config,
      },
      "Creating short video",
    );
    const scenes: Scene[] = [];
    let totalDuration = 0;
    const excludeVideoIds = [];
    const tempFiles = [];

    const orientation: OrientationEnum =
      config.orientation || OrientationEnum.portrait;

    let index = 0;
    for (const scene of inputScenes) {
      const audio = await this.kokoro.generate(
        scene.text,
        config.voice ?? "af_heart",
      );
      let { audioLength } = audio;
      const { audio: audioStream } = audio;

      // add the paddingBack in seconds to the last scene
      if (index + 1 === inputScenes.length && config.paddingBack) {
        audioLength += config.paddingBack / 1000;
      }

      const tempId = cuid();
      const tempWavFileName = `${tempId}.wav`;
      const tempMp3FileName = `${tempId}.mp3`;
      const tempVideoFileName = `${tempId}.mp4`;
      const tempWavPath = path.join(this.config.tempDirPath, tempWavFileName);
      const tempMp3Path = path.join(this.config.tempDirPath, tempMp3FileName);
      const tempVideoPath = path.join(
        this.config.tempDirPath,
        tempVideoFileName,
      );
      tempFiles.push(tempVideoPath);
      tempFiles.push(tempWavPath, tempMp3Path);

      await this.ffmpeg.saveNormalizedAudio(audioStream, tempWavPath);
      const captions = await this.whisper.CreateCaption(tempWavPath);

      await this.ffmpeg.saveToMp3(audioStream, tempMp3Path);
      
      let video;
      if (this.config.videoSource === "veo" && this.googleVeoApi) {
        video = await this.googleVeoApi.findVideo(
          scene.searchTerms,
          audioLength,
          excludeVideoIds,
          orientation,
        );
      } else if (this.config.videoSource === "leonardo" && this.leonardoApi) {
        video = await this.leonardoApi.findVideo(
          scene.searchTerms,
          audioLength,
          excludeVideoIds,
          orientation,
        );
      } else if (this.config.videoSource === "both" && Math.random() > 0.5) {
        // Randomly choose between API services if both are configured
        if (this.googleVeoApi && this.leonardoApi) {
          const useVeo = Math.random() > 0.5;
          if (useVeo) {
            video = await this.googleVeoApi.findVideo(
              scene.searchTerms,
              audioLength,
              excludeVideoIds,
              orientation,
            );
          } else {
            video = await this.leonardoApi.findVideo(
              scene.searchTerms,
              audioLength,
              excludeVideoIds,
              orientation,
            );
          }
        } else if (this.googleVeoApi) {
          video = await this.googleVeoApi.findVideo(
            scene.searchTerms,
            audioLength,
            excludeVideoIds,
            orientation,
          );
        } else if (this.leonardoApi) {
          video = await this.leonardoApi.findVideo(
            scene.searchTerms,
            audioLength,
            excludeVideoIds,
            orientation,
          );
        } else {
          // Fallback to Pexels
          video = await this.pexelsApi.findVideo(
            scene.searchTerms,
            audioLength,
            excludeVideoIds,
            orientation,
          );
        }
      } else {
        // Default to Pexels
        video = await this.pexelsApi.findVideo(
          scene.searchTerms,
          audioLength,
          excludeVideoIds,
          orientation,
        );
      }

      logger.debug(`Downloading video from ${video.url} to ${tempVideoPath}`);

      await new Promise<void>((resolve, reject) => {
        const fileStream = fs.createWriteStream(tempVideoPath);
        https
          .get(video.url, (response: http.IncomingMessage) => {
            if (response.statusCode !== 200) {
              reject(
                new Error(`Failed to download video: ${response.statusCode}`),
              );
              return;
            }

            response.pipe(fileStream);

            fileStream.on("finish", () => {
              fileStream.close();
              logger.debug(`Video downloaded successfully to ${tempVideoPath}`);
              resolve();
            });
          })
          .on("error", (err: Error) => {
            fs.unlink(tempVideoPath, () => {}); // Delete the file if download failed
            logger.error(err, "Error downloading video:");
            reject(err);
          });
      });

      excludeVideoIds.push(video.id);

      scenes.push({
        captions,
        video: `http://localhost:${this.config.port}/api/tmp/${tempVideoFileName}`,
        audio: {
          url: `http://localhost:${this.config.port}/api/tmp/${tempMp3FileName}`,
          duration: audioLength,
        },
      });

      totalDuration += audioLength;
      index++;
    }
    if (config.paddingBack) {
      totalDuration += config.paddingBack / 1000;
    }

    // Check if we're using API-generated video or FFmpeg mode that doesn't need Remotion
    const isApiVideo = this.config.videoSource === "veo" || this.config.videoSource === "leonardo" || 
                      (this.config.videoSource === "both" && (this.googleVeoApi || this.leonardoApi));
    const isFFmpegMode = this.config.videoSource === "ffmpeg";
    
    if ((isApiVideo && scenes.length === 1) || isFFmpegMode) {
      // For single-scene API videos, we can skip Remotion and use the video directly
      // Just add audio overlay using FFmpeg
      const scene = scenes[0];
      const outputLocation = path.join(this.config.videosDirPath, `${videoId}.mp4`);
      
      logger.debug({ videoId }, "Using API-generated video directly with FFmpeg audio overlay");
      
      // BUGFIX: Use the actual temp file paths from the scene creation, not URL parsing
      // The scene URLs contain the temp file names that were generated during processing
      const videoFileName = scene.video.split('/').pop();
      const audioFileName = scene.audio.url.split('/').pop();
      
      const tempVideoPath = path.join(this.config.tempDirPath, videoFileName!);
      const tempMp3Path = path.join(this.config.tempDirPath, audioFileName!);
      
      // Verify files exist before processing
      if (!fs.existsSync(tempVideoPath)) {
        throw new Error(`Temp video file not found: ${tempVideoPath}`);
      }
      if (!fs.existsSync(tempMp3Path)) {
        throw new Error(`Temp audio file not found: ${tempMp3Path}`);
      }
      
      logger.debug({ tempVideoPath, tempMp3Path, outputLocation }, "FFmpeg file paths verified");
      
      // Use FFmpeg to combine video with audio and captions
      await this.ffmpeg.combineVideoWithAudioAndCaptions(
        tempVideoPath,
        tempMp3Path,
        scene.captions,
        outputLocation,
        totalDuration,
        orientation,
        config
      );
    } else {
      // Use traditional Remotion rendering for complex scenes or Pexels videos
      const selectedMusic = this.findMusic(totalDuration, config.music);
      logger.debug({ selectedMusic }, "Selected music for the video");

      await this.remotion.render(
        {
          music: selectedMusic,
          scenes,
          config: {
            durationMs: totalDuration * 1000,
            paddingBack: config.paddingBack,
            ...{
              captionBackgroundColor: config.captionBackgroundColor,
              captionPosition: config.captionPosition,
            },
            musicVolume: config.musicVolume,
          },
        },
        videoId,
        orientation,
      );
    }

    for (const file of tempFiles) {
      fs.removeSync(file);
    }

    return videoId;
  }

  public getVideoPath(videoId: string): string {
    return path.join(this.config.videosDirPath, `${videoId}.mp4`);
  }

  public deleteVideo(videoId: string): void {
    const videoPath = this.getVideoPath(videoId);
    fs.removeSync(videoPath);
    logger.debug({ videoId }, "Deleted video file");
  }

  public getVideo(videoId: string): Buffer {
    const videoPath = this.getVideoPath(videoId);
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video ${videoId} not found`);
    }
    return fs.readFileSync(videoPath);
  }

  private findMusic(videoDuration: number, tag?: MusicMoodEnum): MusicForVideo {
    const musicFiles = this.musicManager.musicList().filter((music) => {
      if (tag) {
        return music.mood === tag;
      }
      return true;
    });
    return musicFiles[Math.floor(Math.random() * musicFiles.length)];
  }

  public ListAvailableMusicTags(): MusicTag[] {
    const tags = new Set<MusicTag>();
    this.musicManager.musicList().forEach((music) => {
      tags.add(music.mood as MusicTag);
    });
    return Array.from(tags.values());
  }

  public listAllVideos(): { id: string; status: VideoStatus }[] {
    const videos: { id: string; status: VideoStatus }[] = [];

    // Check if videos directory exists
    if (!fs.existsSync(this.config.videosDirPath)) {
      return videos;
    }

    // Read all files in the videos directory
    const files = fs.readdirSync(this.config.videosDirPath);

    // Filter for MP4 files and extract video IDs
    for (const file of files) {
      if (file.endsWith(".mp4")) {
        const videoId = file.replace(".mp4", "");

        let status: VideoStatus = "ready";
        const inQueue = this.queue.find((item) => item.id === videoId);
        if (inQueue) {
          status = "processing";
        }

        videos.push({ id: videoId, status });
      }
    }

    // Add videos that are in the queue but not yet rendered
    for (const queueItem of this.queue) {
      const existingVideo = videos.find((v) => v.id === queueItem.id);
      if (!existingVideo) {
        videos.push({ id: queueItem.id, status: "processing" });
      }
    }

    return videos;
  }

  public ListAvailableVoices(): string[] {
    return this.kokoro.listAvailableVoices();
  }
}
