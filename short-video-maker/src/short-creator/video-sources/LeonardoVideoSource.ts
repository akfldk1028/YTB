import { BaseVideoSource, VideoSearchParams, VideoResult } from "./BaseVideoSource";
import { LeonardoAI } from "../libraries/LeonardoAI";

export class LeonardoVideoSource extends BaseVideoSource {
  constructor(private leonardoApi: LeonardoAI) {
    super();
  }

  async findVideo(params: VideoSearchParams): Promise<VideoResult> {
    return await this.leonardoApi.findVideo(
      params.searchTerms,
      params.minDurationSeconds,
      params.excludeVideoIds,
      params.orientation
    );
  }
}