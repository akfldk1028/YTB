import express from 'express';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { YouTubeUploader } from '../services/YouTubeUploader';
import { YouTubeUploadRequest } from '../types/youtube';
import { logger } from '../../logger';

/**
 * YouTube Video Upload Routes
 * Handles video upload operations to YouTube channels
 */
export function createUploadRoutes(youtubeUploader: YouTubeUploader): express.Router {
  const router = express.Router();

  /**
   * POST /api/youtube/upload
   * Upload a video to YouTube on a specific channel
   *
   * Body:
   * {
   *   "videoId": "cuid123...",
   *   "channelName": "main_channel",
   *   "metadata": {
   *     "title": "My Video",
   *     "description": "Video description",
   *     "tags": ["shorts", "ai"],
   *     "categoryId": "22",
   *     "privacyStatus": "private"
   *   },
   *   "notifySubscribers": false
   * }
   */
  router.post(
    '/',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        logger.info('YouTube upload request received');

        const uploadRequest: YouTubeUploadRequest = req.body;

        // Validate request
        if (!uploadRequest.videoId) {
          return res.status(400).json({
            error: 'videoId is required',
          });
        }

        if (!uploadRequest.channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        if (!uploadRequest.metadata) {
          return res.status(400).json({
            error: 'metadata is required',
          });
        }

        if (!uploadRequest.metadata.title) {
          return res.status(400).json({
            error: 'metadata.title is required',
          });
        }

        if (!uploadRequest.metadata.description) {
          return res.status(400).json({
            error: 'metadata.description is required',
          });
        }

        if (!uploadRequest.metadata.privacyStatus) {
          uploadRequest.metadata.privacyStatus = 'private'; // Default to private
        }

        // Check if channel exists and is authenticated
        if (!youtubeUploader.isChannelAuthenticated(uploadRequest.channelName)) {
          return res.status(401).json({
            error: 'Channel not authenticated',
            channelName: uploadRequest.channelName,
            message: `Please authenticate channel '${uploadRequest.channelName}' first`,
          });
        }

        // Start upload
        const youtubeVideoId = await youtubeUploader.uploadVideo(
          uploadRequest.videoId,
          uploadRequest.channelName,
          uploadRequest.metadata,
          uploadRequest.notifySubscribers
        );

        const videoUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

        res.status(200).json({
          success: true,
          videoId: uploadRequest.videoId,
          channelName: uploadRequest.channelName,
          youtubeVideoId,
          url: videoUrl,
          message: 'Video uploaded successfully',
        });
      } catch (error: unknown) {
        logger.error(error, 'YouTube upload failed');
        res.status(500).json({
          success: false,
          error: 'Upload failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/youtube/upload/status/:videoId/:channelName
   * Get upload status for a specific video on a channel
   */
  router.get(
    '/status/:videoId/:channelName',
    (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { videoId, channelName } = req.params;

        if (!videoId) {
          return res.status(400).json({
            error: 'videoId is required',
          });
        }

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        const status = youtubeUploader.getStatus(videoId, channelName);

        if (!status) {
          return res.status(404).json({
            error: 'Upload status not found',
            videoId,
            channelName,
          });
        }

        res.status(200).json(status);
      } catch (error: unknown) {
        logger.error(error, 'Failed to get YouTube upload status');
        res.status(500).json({
          error: 'Failed to get upload status',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/youtube/upload/statuses
   * Get all upload statuses
   *
   * Query params:
   * - channelName: string (optional) - filter by channel
   */
  router.get(
    '/statuses',
    (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName } = req.query;

        let statuses;
        if (channelName && typeof channelName === 'string') {
          statuses = youtubeUploader.getChannelStatuses(channelName);
        } else {
          statuses = youtubeUploader.getAllStatuses();
        }

        res.status(200).json({
          uploads: statuses,
          count: statuses.length,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to get YouTube upload statuses');
        res.status(500).json({
          error: 'Failed to get upload statuses',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * DELETE /api/youtube/upload/status/:videoId/:channelName
   * Clear upload status for a specific video
   */
  router.delete(
    '/status/:videoId/:channelName',
    (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { videoId, channelName } = req.params;

        if (!videoId) {
          return res.status(400).json({
            error: 'videoId is required',
          });
        }

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        youtubeUploader.clearStatus(videoId, channelName);

        res.status(200).json({
          success: true,
          videoId,
          channelName,
          message: 'Upload status cleared',
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to clear YouTube upload status');
        res.status(500).json({
          error: 'Failed to clear upload status',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  return router;
}
