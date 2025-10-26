import express from 'express';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { GoogleCloudStorageService } from '../GoogleCloudStorageService';
import { logger } from '../../logger';
import { Config } from '../../config';

/**
 * Google Cloud Storage Routes
 */
export function createStorageRoutes(config: Config): express.Router {
  const router = express.Router();

  // Only initialize GCS service if configured
  if (!config.gcsBucketName || !config.gcsServiceAccountPath) {
    logger.warn('GCS not configured - storage routes will return errors');

    router.use((req: ExpressRequest, res: ExpressResponse) => {
      res.status(503).json({
        success: false,
        error: 'Google Cloud Storage is not configured',
      });
    });

    return router;
  }

  const gcsService = new GoogleCloudStorageService(config);

  /**
   * GET /api/storage/test
   * Test GCS connection
   */
  router.get('/test', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const result = await gcsService.testConnection();
      res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
      logger.error({ error }, 'GCS connection test failed');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/storage/upload/:videoId
   * Manually upload a video to GCS
   */
  router.post('/upload/:videoId', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const { videoId } = req.params;
      const videoPath = `${config.videosDirPath}/${videoId}.mp4`;

      const result = await gcsService.uploadVideo(videoId, videoPath, (progress) => {
        logger.debug(
          {
            videoId,
            percentComplete: progress.percentComplete,
          },
          'GCS upload progress'
        );
      });

      if (result.success) {
        res.status(200).json({
          success: true,
          videoId,
          gcsPath: result.gcsPath,
          signedUrl: result.signedUrl,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to upload video to GCS');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/storage/:videoId
   * Delete video from GCS
   */
  router.delete('/:videoId', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const { videoId } = req.params;
      const deleted = await gcsService.deleteVideo(videoId);

      res.status(200).json({
        success: deleted,
        videoId,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to delete video from GCS');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/storage/:videoId/signed-url
   * Generate signed URL for video access
   */
  router.get('/:videoId/signed-url', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const { videoId } = req.params;
      const { expiresInHours = 24 } = req.query;

      const fileName = `videos/${videoId}.mp4`;
      const signedUrl = await gcsService.generateSignedUrl(fileName, {
        action: 'read',
        expires: Number(expiresInHours) * 60 * 60 * 1000,
      });

      res.status(200).json({
        success: true,
        videoId,
        signedUrl,
        expiresIn: `${expiresInHours} hours`,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate signed URL');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/storage/:videoId/exists
   * Check if video exists in GCS
   */
  router.get('/:videoId/exists', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const { videoId } = req.params;
      const exists = await gcsService.videoExists(videoId);

      res.status(200).json({
        success: true,
        videoId,
        exists,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to check if video exists');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
