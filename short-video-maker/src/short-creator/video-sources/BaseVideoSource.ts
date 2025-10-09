import type { OrientationEnum } from "../../types/shorts";

export interface VideoSearchParams {
  searchTerms: string[];
  minDurationSeconds: number;
  excludeVideoIds: string[];
  orientation: OrientationEnum;
  timeout?: number;
  retryCounter?: number;
  initialImage?: { data: string; mimeType: string };
}

export interface VideoResult {
  url: string;
  width: number;
  height: number;
  id: string;
}

export abstract class BaseVideoSource {
  abstract findVideo(params: VideoSearchParams): Promise<VideoResult>;
  
  protected async downloadVideo(url: string, outputPath: string): Promise<void> {
    // Common video download logic can be implemented here
    // Or kept abstract for each source to implement
    throw new Error("downloadVideo must be implemented by subclass");
  }
}