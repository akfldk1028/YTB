import { BaseVideoSource, VideoSearchParams, VideoResult } from "./BaseVideoSource";
import { GoogleVeoAPI } from "../libraries/GoogleVeo";
import { RunwayAPI } from "../libraries/RunwayAPI";
import { DEFAULT_TIMEOUT_MS } from "../utils/Constants";

export class VeoVideoSource extends BaseVideoSource {
  constructor(private videoApi: GoogleVeoAPI | RunwayAPI) {
    super();
  }

  async findVideo(params: VideoSearchParams): Promise<VideoResult> {
    return await this.videoApi.findVideo(
      params.searchTerms,
      params.minDurationSeconds,
      params.excludeVideoIds,
      params.orientation,
      params.timeout || DEFAULT_TIMEOUT_MS,
      params.retryCounter || 0,
      params.initialImage
    );
  }
}