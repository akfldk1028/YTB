/* eslint-disable @remotion/deterministic-randomness */
import { getOrientationConfig } from "../../components/utils";
import { logger } from "../../logger";
import { OrientationEnum, type Video } from "../../types/shorts";

const jokerTerms: string[] = ["nature", "globe", "space", "ocean"];
const imageJokerTerms: string[] = ["news", "business", "technology", "city"];
const durationBufferSeconds = 3;
const defaultTimeoutMs = 5000;
const retryTimes = 3;

// 이미지 결과 타입
export interface PexelsImage {
  id: string;
  url: string;
  width: number;
  height: number;
  photographer: string;
}

export class PexelsAPI {
  constructor(private API_KEY: string) {}

  private async _findVideo(
    searchTerm: string,
    minDurationSeconds: number,
    excludeIds: string[],
    orientation: OrientationEnum,
    timeout: number,
  ): Promise<Video> {
    if (!this.API_KEY) {
      throw new Error("API key not set");
    }
    logger.debug(
      { searchTerm, minDurationSeconds, orientation },
      "Searching for video in Pexels API",
    );
    const headers = new Headers();
    headers.append("Authorization", this.API_KEY);
    const response = await fetch(
      `https://api.pexels.com/videos/search?orientation=${orientation}&size=medium&per_page=80&query=${encodeURIComponent(searchTerm)}`,
      {
        method: "GET",
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(timeout),
      },
    )
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error(
              "Invalid Pexels API key - please make sure you get a valid key from https://www.pexels.com/api and set it in the environment variable PEXELS_API_KEY",
            );
          }
          throw new Error(`Pexels API error: ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .catch((error: unknown) => {
        logger.error(error, "Error fetching videos from Pexels API");
        throw error;
      });
    const videos = response.videos as {
      id: string;
      duration: number;
      video_files: {
        fps: number;
        quality: string;
        width: number;
        height: number;
        id: string;
        link: string;
      }[];
    }[];

    const { width: requiredVideoWidth, height: requiredVideoHeight } =
      getOrientationConfig(orientation);

    if (!videos || videos.length === 0) {
      logger.error(
        { searchTerm, orientation },
        "No videos found in Pexels API",
      );
      throw new Error("No videos found");
    }

    // find all the videos that fits the criteria, then select one randomly
    const filteredVideos = videos
      .map((video) => {
        if (excludeIds.includes(video.id)) {
          return;
        }
        if (!video.video_files.length) {
          return;
        }

        // calculate the real duration of the video by converting the FPS to 25
        const fps = video.video_files[0].fps;
        const duration =
          fps < 25 ? video.duration * (fps / 25) : video.duration;

        if (duration >= minDurationSeconds + durationBufferSeconds) {
          for (const file of video.video_files) {
            if (
              file.quality === "hd" &&
              file.width === requiredVideoWidth &&
              file.height === requiredVideoHeight
            ) {
              return {
                id: video.id,
                url: file.link,
                width: file.width,
                height: file.height,
              };
            }
          }
        }
      })
      .filter(Boolean);
    if (!filteredVideos.length) {
      logger.error({ searchTerm }, "No videos found in Pexels API");
      throw new Error("No videos found");
    }

    const video = filteredVideos[
      Math.floor(Math.random() * filteredVideos.length)
    ] as Video;

    logger.debug(
      { searchTerm, video: video, minDurationSeconds, orientation },
      "Found video from Pexels API",
    );

    return video;
  }

  async findVideo(
    searchTerms: string[],
    minDurationSeconds: number,
    excludeIds: string[] = [],
    orientation: OrientationEnum = OrientationEnum.portrait,
    timeout: number = defaultTimeoutMs,
    retryCounter: number = 0,
  ): Promise<Video> {
    // shuffle the search terms to randomize the search order
    const shuffledJokerTerms = jokerTerms.sort(() => Math.random() - 0.5);
    const shuffledSearchTerms = searchTerms.sort(() => Math.random() - 0.5);

    for (const searchTerm of [...shuffledSearchTerms, ...shuffledJokerTerms]) {
      try {
        return await this._findVideo(
          searchTerm,
          minDurationSeconds,
          excludeIds,
          orientation,
          timeout,
        );
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error instanceof DOMException &&
          error.name === "TimeoutError"
        ) {
          if (retryCounter < retryTimes) {
            logger.warn(
              { searchTerm, retryCounter },
              "Timeout error, retrying...",
            );
            return await this.findVideo(
              searchTerms,
              minDurationSeconds,
              excludeIds,
              orientation,
              timeout,
              retryCounter + 1,
            );
          }
          logger.error(
            { searchTerm, retryCounter },
            "Timeout error, retry limit reached",
          );
          throw error;
        }

        logger.error(error, "Error finding video in Pexels API for term");
      }
    }
    logger.error(
      { searchTerms },
      "No videos found in Pexels API for the given terms",
    );
    throw new Error("No videos found in Pexels API");
  }

  // ============================================
  // 🔥 이미지 검색 API (뉴스 프로젝트용)
  // ============================================

  private async _findImage(
    searchTerm: string,
    orientation: OrientationEnum,
    excludeIds: string[],
    timeout: number,
  ): Promise<PexelsImage> {
    if (!this.API_KEY) {
      throw new Error("API key not set");
    }

    logger.debug(
      { searchTerm, orientation },
      "Searching for image in Pexels API",
    );

    const headers = new Headers();
    headers.append("Authorization", this.API_KEY);

    const orientationParam = orientation === OrientationEnum.portrait ? "portrait" : "landscape";

    const response = await fetch(
      `https://api.pexels.com/v1/search?orientation=${orientationParam}&per_page=30&query=${encodeURIComponent(searchTerm)}`,
      {
        method: "GET",
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(timeout),
      },
    )
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("Invalid Pexels API key");
          }
          throw new Error(`Pexels API error: ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .catch((error: unknown) => {
        logger.error(error, "Error fetching images from Pexels API");
        throw error;
      });

    const photos = response.photos as {
      id: number;
      width: number;
      height: number;
      photographer: string;
      src: {
        original: string;
        large2x: string;
        large: string;
        medium: string;
        portrait: string;
        landscape: string;
      };
    }[];

    if (!photos || photos.length === 0) {
      logger.debug({ searchTerm }, "No images found in Pexels API");
      throw new Error("No images found");
    }

    // 해상도 요구사항에 맞는 이미지 필터링
    const { width: requiredWidth, height: requiredHeight } = getOrientationConfig(orientation);

    const filteredPhotos = photos
      .filter((photo) => {
        if (excludeIds.includes(String(photo.id))) return false;
        // 최소 해상도 체크 (너무 작은 이미지 제외)
        return photo.width >= 800 && photo.height >= 800;
      })
      .map((photo) => ({
        id: String(photo.id),
        // portrait/landscape에 맞는 크기 사용
        url: orientation === OrientationEnum.portrait ? photo.src.portrait : photo.src.landscape,
        width: requiredWidth,
        height: requiredHeight,
        photographer: photo.photographer,
      }));

    if (!filteredPhotos.length) {
      throw new Error("No suitable images found");
    }

    // 랜덤 선택
    const image = filteredPhotos[Math.floor(Math.random() * filteredPhotos.length)];

    logger.debug(
      { searchTerm, imageId: image.id, photographer: image.photographer },
      "Found image from Pexels API",
    );

    return image;
  }

  /**
   * 🔥 이미지 검색 (여러 검색어로 시도)
   */
  async findImage(
    searchTerms: string[],
    orientation: OrientationEnum = OrientationEnum.portrait,
    excludeIds: string[] = [],
    timeout: number = defaultTimeoutMs,
    retryCounter: number = 0,
  ): Promise<PexelsImage> {
    const shuffledJokerTerms = imageJokerTerms.sort(() => Math.random() - 0.5);
    const shuffledSearchTerms = searchTerms.sort(() => Math.random() - 0.5);

    for (const searchTerm of [...shuffledSearchTerms, ...shuffledJokerTerms]) {
      try {
        return await this._findImage(searchTerm, orientation, excludeIds, timeout);
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error instanceof DOMException &&
          error.name === "TimeoutError"
        ) {
          if (retryCounter < retryTimes) {
            logger.warn({ searchTerm, retryCounter }, "Timeout error, retrying image search...");
            return await this.findImage(
              searchTerms,
              orientation,
              excludeIds,
              timeout,
              retryCounter + 1,
            );
          }
          throw error;
        }
        logger.debug({ searchTerm, error }, "Error finding image, trying next term");
      }
    }

    logger.error({ searchTerms }, "No images found in Pexels API for the given terms");
    throw new Error("No images found in Pexels API");
  }
}
