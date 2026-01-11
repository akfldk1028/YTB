/**
 * Google Sheets API Routes
 * 영상 메타데이터 조회 및 Analytics 업데이트 엔드포인트
 */

import express from 'express';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { YouTubeAnalyticsService } from '../../youtube-analytics/services/YouTubeAnalyticsService';
import { logger } from '../../logger';
import type { VideoFilterOptions, VideoAnalyticsRecord, VideoGenerationRecord } from '../types';

export function createSheetRoutes(
  sheetsService: GoogleSheetsService,
  analyticsService?: YouTubeAnalyticsService
): express.Router {
  const router = express.Router();

  // JSON body parser
  router.use(express.json());

  /**
   * GET /api/sheet/videos
   * 영상 목록 조회 (필터 지원)
   *
   * Query params:
   * - videoId: 특정 비디오 ID
   * - channelName: 채널 이름
   * - mode: 생성 모드 (pexels, veo3, etc.)
   * - uploadStatus: 업로드 상태 (pending, uploaded, failed)
   * - startDate: 시작일 (YYYY-MM-DD)
   * - endDate: 종료일 (YYYY-MM-DD)
   */
  router.get('/videos', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const filter: VideoFilterOptions = {
        videoId: req.query.videoId as string,
        channelName: req.query.channelName as string,
        mode: req.query.mode as string,
        uploadStatus: req.query.uploadStatus as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      };

      // undefined 값 제거
      Object.keys(filter).forEach(key => {
        if (filter[key as keyof VideoFilterOptions] === undefined) {
          delete filter[key as keyof VideoFilterOptions];
        }
      });

      const videos = await sheetsService.getVideos(
        Object.keys(filter).length > 0 ? filter : undefined
      );

      res.status(200).json({
        success: true,
        count: videos.length,
        videos,
      });
    } catch (error) {
      logger.error(error, 'Sheet videos endpoint error');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/sheet/video/:videoId
   * 특정 비디오 상세 정보 조회
   */
  router.get('/video/:videoId', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const { videoId } = req.params;

      if (!videoId) {
        return res.status(400).json({
          success: false,
          error: 'videoId is required',
        });
      }

      const video = await sheetsService.getVideoById(videoId);

      if (!video) {
        return res.status(404).json({
          success: false,
          error: 'Video not found',
        });
      }

      res.status(200).json({
        success: true,
        video,
      });
    } catch (error) {
      logger.error(error, 'Sheet video detail endpoint error');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/sheet/video/:videoId/update-analytics
   * 특정 비디오의 Analytics 업데이트 (YouTube에서 가져와서 시트에 저장)
   *
   * Query params:
   * - channelName: 채널 이름 (필수)
   */
  router.post(
    '/video/:videoId/update-analytics',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { videoId } = req.params;
        const { channelName } = req.query;

        if (!videoId) {
          return res.status(400).json({
            success: false,
            error: 'videoId is required',
          });
        }

        if (!channelName || typeof channelName !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'channelName query parameter is required',
          });
        }

        if (!analyticsService) {
          return res.status(503).json({
            success: false,
            error: 'Analytics service not available',
          });
        }

        logger.info({ videoId, channelName }, 'Updating analytics for video');

        // YouTube Analytics에서 데이터 가져오기
        const analyticsResult = await analyticsService.getVideoMetrics({
          channelName,
          videoId,
          includeVideoInfo: false,
          includeTrafficSources: false,
          includeGeography: false,
          includeDevices: false,
          includeDemographics: false,
        });

        if (!analyticsResult.success || !analyticsResult.data || !analyticsResult.reward) {
          return res.status(500).json({
            success: false,
            error: analyticsResult.error || 'Failed to fetch analytics',
          });
        }

        // 시트에 업데이트
        const analyticsRecord: VideoAnalyticsRecord = {
          videoId,
          views: analyticsResult.data.views,
          likes: analyticsResult.data.likes,
          comments: analyticsResult.data.comments,
          shares: analyticsResult.data.shares,
          averageViewDuration: analyticsResult.data.averageViewDuration,
          averageViewPercentage: analyticsResult.data.averageViewPercentage,
          estimatedMinutesWatched: analyticsResult.data.estimatedMinutesWatched,
          subscribersGained: analyticsResult.data.subscribersGained,
          subscribersLost: analyticsResult.data.subscribersLost,
          retentionScore: analyticsResult.reward.retentionScore,
          engagementScore: analyticsResult.reward.engagementScore,
          growthScore: analyticsResult.reward.growthScore,
          viralScore: analyticsResult.reward.viralScore,
          totalReward: analyticsResult.reward.totalReward,
          lastUpdated: new Date().toISOString(),
        };

        const updated = await sheetsService.updateVideoAnalytics(videoId, analyticsRecord);

        if (!updated) {
          return res.status(500).json({
            success: false,
            error: 'Failed to update sheet (video may not exist in sheet)',
          });
        }

        res.status(200).json({
          success: true,
          message: 'Analytics updated successfully',
          analytics: analyticsRecord,
        });
      } catch (error) {
        logger.error(error, 'Sheet update analytics endpoint error');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/sheet/batch-update-analytics
   * 여러 비디오의 Analytics 일괄 업데이트
   *
   * Body:
   * {
   *   channelName: string,
   *   videoIds?: string[],     // 지정 안하면 업데이트 필요한 모든 비디오
   *   maxAgeHours?: number     // analytics 업데이트 기준 시간 (기본: 24)
   * }
   */
  router.post(
    '/batch-update-analytics',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName, videoIds, maxAgeHours = 24 } = req.body;

        if (!channelName) {
          return res.status(400).json({
            success: false,
            error: 'channelName is required',
          });
        }

        if (!analyticsService) {
          return res.status(503).json({
            success: false,
            error: 'Analytics service not available',
          });
        }

        // 업데이트할 비디오 목록 결정
        let videosToUpdate: string[];

        if (videoIds && Array.isArray(videoIds) && videoIds.length > 0) {
          videosToUpdate = videoIds;
        } else {
          // 업데이트 필요한 비디오 자동 선택
          const needsUpdate = await sheetsService.getVideosNeedingAnalyticsUpdate(maxAgeHours);
          videosToUpdate = needsUpdate
            .filter(v => v.channelName === channelName)
            .map(v => v.videoId)
            .filter(id => id); // 빈 ID 제외
        }

        if (videosToUpdate.length === 0) {
          return res.status(200).json({
            success: true,
            message: 'No videos need analytics update',
            updated: 0,
          });
        }

        logger.info(
          { channelName, videoCount: videosToUpdate.length },
          'Batch updating analytics'
        );

        const results: { videoId: string; success: boolean; error?: string }[] = [];

        for (const videoId of videosToUpdate) {
          try {
            const analyticsResult = await analyticsService.getVideoMetrics({
              channelName,
              videoId,
              includeVideoInfo: false,
            });

            if (analyticsResult.success && analyticsResult.data && analyticsResult.reward) {
              const analyticsRecord: VideoAnalyticsRecord = {
                videoId,
                views: analyticsResult.data.views,
                likes: analyticsResult.data.likes,
                comments: analyticsResult.data.comments,
                shares: analyticsResult.data.shares,
                averageViewDuration: analyticsResult.data.averageViewDuration,
                averageViewPercentage: analyticsResult.data.averageViewPercentage,
                estimatedMinutesWatched: analyticsResult.data.estimatedMinutesWatched,
                subscribersGained: analyticsResult.data.subscribersGained,
                subscribersLost: analyticsResult.data.subscribersLost,
                retentionScore: analyticsResult.reward.retentionScore,
                engagementScore: analyticsResult.reward.engagementScore,
                growthScore: analyticsResult.reward.growthScore,
                viralScore: analyticsResult.reward.viralScore,
                totalReward: analyticsResult.reward.totalReward,
                lastUpdated: new Date().toISOString(),
              };

              const updated = await sheetsService.updateVideoAnalytics(videoId, analyticsRecord);
              results.push({ videoId, success: updated });
            } else {
              results.push({
                videoId,
                success: false,
                error: analyticsResult.error || 'Failed to fetch analytics',
              });
            }
          } catch (error) {
            results.push({
              videoId,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        const successCount = results.filter(r => r.success).length;

        res.status(200).json({
          success: true,
          message: `Updated ${successCount}/${videosToUpdate.length} videos`,
          updated: successCount,
          total: videosToUpdate.length,
          results,
        });
      } catch (error) {
        logger.error(error, 'Sheet batch update analytics endpoint error');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/sheet/stats
   * 시트 통계 조회
   */
  router.get('/stats', async (_req: ExpressRequest, res: ExpressResponse) => {
    try {
      const allVideos = await sheetsService.getVideos();

      const stats = {
        totalVideos: allVideos.length,
        byChannel: {} as Record<string, number>,
        byMode: {} as Record<string, number>,
        byStatus: {} as Record<string, number>,
        withAnalytics: 0,
        avgTotalReward: 0,
      };

      let totalRewardSum = 0;
      let rewardCount = 0;

      for (const video of allVideos) {
        // 채널별
        stats.byChannel[video.channelName] = (stats.byChannel[video.channelName] || 0) + 1;
        // 모드별
        stats.byMode[video.mode] = (stats.byMode[video.mode] || 0) + 1;
        // 상태별
        stats.byStatus[video.uploadStatus] = (stats.byStatus[video.uploadStatus] || 0) + 1;
        // Analytics 있는 것
        if (video.analyticsLastUpdated) {
          stats.withAnalytics++;
          if (video.totalReward !== undefined) {
            totalRewardSum += video.totalReward;
            rewardCount++;
          }
        }
      }

      stats.avgTotalReward = rewardCount > 0 ? totalRewardSum / rewardCount : 0;

      res.status(200).json({
        success: true,
        stats,
        spreadsheetId: sheetsService.getSpreadsheetId(),
      });
    } catch (error) {
      logger.error(error, 'Sheet stats endpoint error');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/sheet/import-youtube-videos
   * YouTube 채널의 모든 비디오를 시트에 import하고 Analytics 데이터도 함께 가져옴
   *
   * Body:
   * {
   *   channelName: string,  // 채널 이름
   *   maxResults?: number   // 가져올 최대 비디오 수 (기본: 50)
   * }
   */
  router.post(
    '/import-youtube-videos',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName, maxResults = 50 } = req.body;

        if (!channelName) {
          return res.status(400).json({
            success: false,
            error: 'channelName is required',
          });
        }

        if (!analyticsService) {
          return res.status(503).json({
            success: false,
            error: 'Analytics service not available',
          });
        }

        logger.info({ channelName, maxResults }, 'Starting YouTube video import');

        // YouTube 채널의 비디오 목록 가져오기
        const videosResult = await analyticsService.getChannelVideos(
          channelName,
          maxResults
        );

        if (!videosResult.success || !videosResult.videos) {
          return res.status(500).json({
            success: false,
            error: videosResult.error || 'Failed to fetch videos from YouTube',
          });
        }

        const results: {
          videoId: string;
          title: string;
          imported: boolean;
          analyticsUpdated: boolean;
          error?: string
        }[] = [];

        for (const video of videosResult.videos) {
          try {
            // 1. 기본 정보로 시트에 레코드 생성
            const record: VideoGenerationRecord = {
              videoId: video.videoId,
              jobId: `youtube-import-${video.videoId}`,
              createdAt: video.publishedAt,
              channelName,
              title: video.title,
              description: video.description || '',
              tags: [],
              duration: 0,
              mode: 'youtube-import' as VideoGenerationRecord['mode'],
              sceneCount: 0,
              voice: '',
              orientation: 'portrait',
              uploadStatus: 'uploaded',
              uploadedAt: video.publishedAt,
              gcsUrl: '',
            };

            const imported = await sheetsService.logVideoGeneration(record);

            // 2. Analytics 데이터 가져와서 업데이트
            let analyticsUpdated = false;
            try {
              const analyticsResult = await analyticsService.getVideoMetrics({
                channelName,
                videoId: video.videoId,
                includeVideoInfo: true,
                includeTrafficSources: false,
                includeGeography: false,
                includeDevices: false,
                includeDemographics: false,
              });

              if (analyticsResult.success && analyticsResult.data && analyticsResult.reward) {
                const analyticsRecord: VideoAnalyticsRecord = {
                  videoId: video.videoId,
                  views: analyticsResult.data.views,
                  likes: analyticsResult.data.likes,
                  comments: analyticsResult.data.comments,
                  shares: analyticsResult.data.shares,
                  averageViewDuration: analyticsResult.data.averageViewDuration,
                  averageViewPercentage: analyticsResult.data.averageViewPercentage,
                  estimatedMinutesWatched: analyticsResult.data.estimatedMinutesWatched,
                  subscribersGained: analyticsResult.data.subscribersGained,
                  subscribersLost: analyticsResult.data.subscribersLost,
                  retentionScore: analyticsResult.reward.retentionScore,
                  engagementScore: analyticsResult.reward.engagementScore,
                  growthScore: analyticsResult.reward.growthScore,
                  viralScore: analyticsResult.reward.viralScore,
                  totalReward: analyticsResult.reward.totalReward,
                  lastUpdated: new Date().toISOString(),
                };

                analyticsUpdated = await sheetsService.updateVideoAnalytics(video.videoId, analyticsRecord);
              }
            } catch (analyticsError) {
              logger.warn({ videoId: video.videoId, error: analyticsError }, 'Failed to fetch analytics for video');
            }

            results.push({
              videoId: video.videoId,
              title: video.title,
              imported,
              analyticsUpdated,
            });
          } catch (error) {
            results.push({
              videoId: video.videoId,
              title: video.title,
              imported: false,
              analyticsUpdated: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        const importedCount = results.filter(r => r.imported).length;
        const analyticsCount = results.filter(r => r.analyticsUpdated).length;

        logger.info(
          { channelName, total: results.length, imported: importedCount, analytics: analyticsCount },
          'YouTube video import completed'
        );

        res.status(200).json({
          success: true,
          message: `Imported ${importedCount}/${results.length} videos, updated analytics for ${analyticsCount} videos`,
          total: results.length,
          imported: importedCount,
          analyticsUpdated: analyticsCount,
          results,
        });
      } catch (error) {
        logger.error(error, 'YouTube video import endpoint error');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/sheet/config
   * 시트 설정 정보 조회
   */
  router.get('/config', async (_req: ExpressRequest, res: ExpressResponse) => {
    try {
      res.status(200).json({
        success: true,
        configured: sheetsService.isConfigured(),
        spreadsheetId: sheetsService.isConfigured()
          ? sheetsService.getSpreadsheetId()
          : null,
        sheetUrl: sheetsService.isConfigured()
          ? `https://docs.google.com/spreadsheets/d/${sheetsService.getSpreadsheetId()}/edit`
          : null,
      });
    } catch (error) {
      logger.error(error, 'Sheet config endpoint error');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
