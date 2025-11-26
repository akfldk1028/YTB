import express from 'express';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { YouTubeAnalyticsService } from '../services/YouTubeAnalyticsService';
import { logger } from '../../logger';

/**
 * YouTube Analytics API Routes
 * 강화학습용 비디오 메트릭 조회 엔드포인트
 * YouTube Analytics API + YouTube Data API v3 전체 메트릭 지원
 */
export function createAnalyticsRoutes(
  analyticsService: YouTubeAnalyticsService
): express.Router {
  const router = express.Router();

  // JSON body parser
  router.use(express.json());

  /**
   * GET /api/analytics/video/:videoId
   * 특정 비디오의 전체 Analytics 메트릭 조회
   *
   * Query params:
   * - channelName: 채널 이름 (필수)
   * - startDate: 시작일 (YYYY-MM-DD, 선택)
   * - endDate: 종료일 (YYYY-MM-DD, 선택)
   * - includeVideoInfo: 비디오 기본 정보 포함 (기본: true)
   * - includeTrafficSources: 트래픽 소스 포함 (기본: false)
   * - includeGeography: 지역 통계 포함 (기본: false)
   * - includeDevices: 디바이스 통계 포함 (기본: false)
   * - includeDemographics: 인구 통계 포함 (기본: false)
   * - includeCards: 카드/엔드스크린 포함 (기본: true)
   * - includePlaylists: 플레이리스트 포함 (기본: true)
   * - all: 모든 추가 메트릭 포함 (기본: false)
   */
  router.get(
    '/video/:videoId',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { videoId } = req.params;
        const {
          channelName,
          startDate,
          endDate,
          includeVideoInfo,
          includeTrafficSources,
          includeGeography,
          includeDevices,
          includeDemographics,
          includeCards,
          includePlaylists,
          all,
        } = req.query;

        if (!channelName || typeof channelName !== 'string') {
          return res.status(400).json({
            error: 'channelName query parameter is required',
          });
        }

        if (!videoId) {
          return res.status(400).json({
            error: 'videoId is required',
          });
        }

        logger.info({ videoId, channelName }, 'Analytics request received');

        // all=true 옵션 시 모든 메트릭 포함
        const includeAll = all === 'true';

        const result = await analyticsService.getVideoMetrics({
          channelName,
          videoId,
          startDate: startDate as string,
          endDate: endDate as string,
          includeVideoInfo: includeAll || includeVideoInfo !== 'false',
          includeTrafficSources: includeAll || includeTrafficSources === 'true',
          includeGeography: includeAll || includeGeography === 'true',
          includeDevices: includeAll || includeDevices === 'true',
          includeDemographics: includeAll || includeDemographics === 'true',
          includeCards: includeAll || includeCards !== 'false',
          includePlaylists: includeAll || includePlaylists !== 'false',
        });

        if (result.success) {
          res.status(200).json(result);
        } else {
          res.status(500).json(result);
        }
      } catch (error) {
        logger.error(error, 'Analytics video endpoint error');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/analytics/video/:videoId/full
   * 특정 비디오의 전체 Analytics 메트릭 조회 (모든 옵션 포함)
   */
  router.get(
    '/video/:videoId/full',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { videoId } = req.params;
        const { channelName, startDate, endDate } = req.query;

        if (!channelName || typeof channelName !== 'string') {
          return res.status(400).json({
            error: 'channelName query parameter is required',
          });
        }

        logger.info({ videoId, channelName }, 'Full analytics request received');

        const result = await analyticsService.getVideoMetrics({
          channelName,
          videoId,
          startDate: startDate as string,
          endDate: endDate as string,
          includeVideoInfo: true,
          includeTrafficSources: true,
          includeGeography: true,
          includeDevices: true,
          includeDemographics: true,
          includeCards: true,
          includePlaylists: true,
        });

        if (result.success) {
          res.status(200).json(result);
        } else {
          res.status(500).json(result);
        }
      } catch (error) {
        logger.error(error, 'Analytics full endpoint error');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/analytics/reward/:videoId
   * 특정 비디오의 강화학습 보상 값만 조회
   */
  router.get(
    '/reward/:videoId',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { videoId } = req.params;
        const { channelName, startDate, endDate } = req.query;

        if (!channelName || typeof channelName !== 'string') {
          return res.status(400).json({
            error: 'channelName query parameter is required',
          });
        }

        const result = await analyticsService.getVideoMetrics({
          channelName,
          videoId,
          startDate: startDate as string,
          endDate: endDate as string,
          includeVideoInfo: false,
          includeTrafficSources: false,
          includeGeography: false,
          includeDevices: false,
          includeDemographics: false,
        });

        if (result.success && result.reward) {
          res.status(200).json({
            success: true,
            videoId,
            reward: result.reward,
          });
        } else {
          res.status(500).json({
            success: false,
            error: result.error || 'Failed to calculate reward',
          });
        }
      } catch (error) {
        logger.error(error, 'Analytics reward endpoint error');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/analytics/batch
   * 여러 비디오의 Analytics 일괄 조회
   *
   * Body:
   * {
   *   channelName: string,
   *   videoIds: string[],
   *   startDate?: string,
   *   endDate?: string
   * }
   */
  router.post(
    '/batch',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName, videoIds, startDate, endDate } = req.body;

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
          return res.status(400).json({
            error: 'videoIds array is required',
          });
        }

        logger.info(
          { channelName, videoCount: videoIds.length },
          'Batch analytics request received'
        );

        const result = await analyticsService.getChannelVideoAnalytics(
          channelName,
          videoIds,
          startDate,
          endDate
        );

        res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error(error, 'Analytics batch endpoint error');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/analytics/channels
   * 사용 가능한 채널 목록 조회
   */
  router.get(
    '/channels',
    async (_req: ExpressRequest, res: ExpressResponse) => {
      try {
        const channels = analyticsService.getAvailableChannels();
        res.status(200).json({
          success: true,
          channels,
        });
      } catch (error) {
        logger.error(error, 'Analytics channels endpoint error');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/analytics/channel/:channelName/videos
   * 채널의 업로드된 비디오 목록 조회
   *
   * Query params:
   * - maxResults: 최대 결과 수 (기본: 50, 최대: 50)
   */
  router.get(
    '/channel/:channelName/videos',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName } = req.params;
        const maxResults = Math.min(
          parseInt(req.query.maxResults as string) || 50,
          50
        );

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        logger.info(
          { channelName, maxResults },
          'Channel videos request received'
        );

        const result = await analyticsService.getChannelVideos(
          channelName,
          maxResults
        );

        if (result.success) {
          res.status(200).json(result);
        } else {
          res.status(500).json(result);
        }
      } catch (error) {
        logger.error(error, 'Analytics channel videos endpoint error');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/analytics/metrics
   * 사용 가능한 메트릭 목록 및 설명 조회
   */
  router.get(
    '/metrics',
    async (_req: ExpressRequest, res: ExpressResponse) => {
      try {
        const metrics = {
          core: {
            description: '핵심 메트릭 (항상 포함)',
            metrics: {
              views: '총 조회수 (YouTube Data API)',
              likes: '좋아요 수 (YouTube Data API)',
              dislikes: '싫어요 수 (deprecated)',
              comments: '댓글 수',
              favoriteCount: '즐겨찾기 수',
              estimatedMinutesWatched: '총 시청 시간 (분)',
              averageViewDuration: '평균 시청 시간 (초)',
              averageViewPercentage: '시청 유지율 (%)',
              subscribersGained: '획득 구독자',
              subscribersLost: '이탈 구독자',
              shares: '공유 수',
            },
          },
          cards: {
            description: '카드/엔드스크린 메트릭 (includeCards=true)',
            metrics: {
              cardImpressions: '카드 노출 수',
              cardClicks: '카드 클릭 수',
              cardClickRate: '카드 클릭률',
              cardTeaserImpressions: '카드 티저 노출 수',
              cardTeaserClicks: '카드 티저 클릭 수',
              cardTeaserClickRate: '카드 티저 클릭률',
              annotationImpressions: '엔드 스크린 노출 수',
              annotationClicks: '엔드 스크린 클릭 수',
              annotationClickThroughRate: '엔드 스크린 클릭률',
              annotationCloseRate: '엔드 스크린 닫기율',
            },
          },
          playlists: {
            description: '플레이리스트 메트릭 (includePlaylists=true)',
            metrics: {
              videosAddedToPlaylists: '재생목록 추가 수',
              videosRemovedFromPlaylists: '재생목록 제거 수',
            },
          },
          videoInfo: {
            description: '비디오 기본 정보 (includeVideoInfo=true)',
            metrics: {
              title: '비디오 제목',
              description: '비디오 설명',
              publishedAt: '업로드 날짜',
              tags: '태그',
              duration: '길이 (ISO 8601)',
              durationSeconds: '길이 (초)',
              privacyStatus: '공개 상태',
              thumbnails: '썸네일 URL',
            },
          },
          trafficSources: {
            description: '트래픽 소스 (includeTrafficSources=true)',
            metrics: {
              source: '트래픽 소스 (YOUTUBE_SEARCH, RELATED_VIDEO 등)',
              views: '해당 소스 조회수',
              estimatedMinutesWatched: '해당 소스 시청 시간',
            },
          },
          geography: {
            description: '지역 통계 (includeGeography=true)',
            metrics: {
              country: '국가 코드 (ISO 3166-1 alpha-2)',
              views: '해당 국가 조회수',
              averageViewPercentage: '해당 국가 시청 유지율',
            },
          },
          devices: {
            description: '디바이스/OS 통계 (includeDevices=true)',
            metrics: {
              deviceType: '디바이스 타입 (MOBILE, DESKTOP, TV 등)',
              operatingSystem: 'OS (ANDROID, IOS, WINDOWS 등)',
              views: '해당 디바이스/OS 조회수',
            },
          },
          demographics: {
            description: '인구 통계 (includeDemographics=true)',
            metrics: {
              ageGroup: '연령대 (age18-24, age25-34 등)',
              gender: '성별 (male, female)',
              viewerPercentage: '시청자 비율',
            },
          },
          reward: {
            description: '강화학습 보상 계산',
            metrics: {
              retentionScore: '시청 유지율 점수 (0-1)',
              engagementScore: '참여도 점수 (0-1)',
              growthScore: '성장 점수 (0-1)',
              viralScore: '바이럴 점수 (0-1)',
              playlistScore: '재생목록 점수 (0-1)',
              totalReward: '종합 보상 값 (가중 평균)',
            },
          },
        };

        res.status(200).json({
          success: true,
          metrics,
          usage: {
            basic: 'GET /api/analytics/video/:videoId?channelName=ATT',
            full: 'GET /api/analytics/video/:videoId/full?channelName=ATT',
            allOptions: 'GET /api/analytics/video/:videoId?channelName=ATT&all=true',
            rewardOnly: 'GET /api/analytics/reward/:videoId?channelName=ATT',
            batch: 'POST /api/analytics/batch with { channelName, videoIds }',
            channelVideos: 'GET /api/analytics/channel/:channelName/videos',
          },
        });
      } catch (error) {
        logger.error(error, 'Analytics metrics endpoint error');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  return router;
}
