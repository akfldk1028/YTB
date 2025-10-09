import { BaseVideoSource, VideoSearchParams, VideoResult } from "./BaseVideoSource";
import { GoogleVeoAPI } from "../libraries/GoogleVeo";
import { DEFAULT_TIMEOUT_MS } from "../utils/Constants";

export class VeoVideoSource extends BaseVideoSource {
  constructor(private googleVeoApi: GoogleVeoAPI) {
    super();
  }

  async findVideo(params: VideoSearchParams): Promise<VideoResult> {
    return await this.googleVeoApi.findVideo(
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