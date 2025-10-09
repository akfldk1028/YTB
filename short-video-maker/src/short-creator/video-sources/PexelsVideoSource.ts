import { BaseVideoSource, VideoSearchParams, VideoResult } from "./BaseVideoSource";
import { PexelsAPI } from "../libraries/Pexels";

export class PexelsVideoSource extends BaseVideoSource {
  constructor(private pexelsApi: PexelsAPI) {
    super();
  }

  async findVideo(params: VideoSearchParams): Promise<VideoResult> {
    return await this.pexelsApi.findVideo(
      params.searchTerms,
      params.minDurationSeconds,
      params.excludeVideoIds,
      params.orientation
    );
  }
}