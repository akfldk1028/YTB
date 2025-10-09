import fs from "fs-extra";
import path from "path";
import { VideoQueue } from "../queue/VideoQueue";
import { VIDEO_STATUS } from "../utils/Constants";
import { logger } from "../../logger";
import type { VideoStatus } from "../../types/shorts";

export interface DetailedStatus {
  videoId: string;
  status: VideoStatus;
  videoPath: string | null;
  timestamp: string;
  processing: boolean;
  scenes?: any[];
  config?: any;
  metadata?: any;
  callbackUrl?: string;
  fileSize?: number;
  createdAt?: string;
  modifiedAt?: string;
  processingParameters?: any;
  errorInfo?: any;
}

export class StatusManager {
  constructor(
    private videoQueue: VideoQueue,
    private videosDirPath: string
  ) {}

  public getStatus(videoId: string): VideoStatus {
    const videoPath = this.getVideoPath(videoId);
    
    if (this.videoQueue.findItem(videoId)) {
      return VIDEO_STATUS.PROCESSING as VideoStatus;
    }
    
    if (fs.existsSync(videoPath)) {
      return VIDEO_STATUS.READY as VideoStatus;
    }
    
    return VIDEO_STATUS.FAILED as VideoStatus;
  }

  public getDetailedStatus(videoId: string): DetailedStatus {
    const status = this.getStatus(videoId);
    const videoPath = this.getVideoPath(videoId);
    
    // Basic status info
    const result: DetailedStatus = {
      videoId,
      status,
      videoPath: fs.existsSync(videoPath) ? videoPath : null,
      timestamp: new Date().toISOString(),
      processing: false
    };

    // Find processing item in queue
    const queueItem = this.videoQueue.findItem(videoId);
    if (queueItem) {
      result.processing = true;
      result.scenes = queueItem.sceneInput;
      result.config = queueItem.config;
      result.metadata = queueItem.metadata;
      result.callbackUrl = queueItem.callbackUrl;
    }

    // Completed video details
    if (status === VIDEO_STATUS.READY && fs.existsSync(videoPath)) {
      const stats = fs.statSync(videoPath);
      result.fileSize = stats.size;
      result.createdAt = stats.birthtime.toISOString();
      result.modifiedAt = stats.mtime.toISOString();
    }

    // Failed video error info
    if (status === VIDEO_STATUS.FAILED) {
      result.errorInfo = {
        message: "Video processing failed or video file not found",
        videoExists: fs.existsSync(videoPath),
        inQueue: !!queueItem,
        possibleCauses: [
          "Processing error during video creation",
          "API quota exceeded", 
          "Network timeout",
          "Invalid input parameters",
          "File system error"
        ]
      };
    }

    return result;
  }

  public listAllVideos(): { id: string; status: VideoStatus }[] {
    const videos: { id: string; status: VideoStatus }[] = [];

    // Check if videos directory exists
    if (!fs.existsSync(this.videosDirPath)) {
      return videos;
    }

    // Read all files in the videos directory
    const files = fs.readdirSync(this.videosDirPath);

    // Filter for MP4 files and extract video IDs
    for (const file of files) {
      if (file.endsWith(".mp4")) {
        const videoId = file.replace(".mp4", "");
        const status = this.getStatus(videoId);
        videos.push({ id: videoId, status });
      }
    }

    // Add videos that are in the queue but not yet rendered
    const queueStatus = this.videoQueue.getStatus();
    if (queueStatus.processingItem) {
      const existingVideo = videos.find((v) => v.id === queueStatus.processingItem!.id);
      if (!existingVideo) {
        videos.push({ 
          id: queueStatus.processingItem.id, 
          status: VIDEO_STATUS.PROCESSING as VideoStatus 
        });
      }
    }

    return videos;
  }

  public deleteVideo(videoId: string): void {
    const videoPath = this.getVideoPath(videoId);
    if (fs.existsSync(videoPath)) {
      fs.removeSync(videoPath);
      logger.debug({ videoId }, "Deleted video file");
    }
  }

  public getVideoPath(videoId: string): string {
    return path.join(this.videosDirPath, `${videoId}.mp4`);
  }

  public getVideo(videoId: string): Buffer {
    const videoPath = this.getVideoPath(videoId);
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video ${videoId} not found`);
    }
    return fs.readFileSync(videoPath);
  }
}