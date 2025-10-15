import express from 'express';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { YouTubeUploader } from '../services/YouTubeUploader';
import { logger } from '../../logger';

/**
 * YouTube OAuth Authentication Routes
 * Handles OAuth2 authentication flow for YouTube channels
 */
export function createAuthRoutes(youtubeUploader: YouTubeUploader): express.Router {
  const router = express.Router();

  /**
   * GET /api/youtube/auth/callback
   * OAuth2 callback endpoint - receives authorization code from Google
   * Query params: code (auth code), state (channelName)
   *
   * IMPORTANT: This route must be BEFORE /:channelName to avoid conflicts
   */
  router.get(
    '/callback',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { code, state } = req.query;

        if (!code || typeof code !== 'string') {
          return res.status(400).json({
            error: 'Authorization code is required',
          });
        }

        if (!state || typeof state !== 'string') {
          return res.status(400).json({
            error: 'Channel name (state parameter) is required',
          });
        }

        const channelName = state;

        await youtubeUploader.handleAuthCallback(code, channelName);

        res.status(200).json({
          success: true,
          channelName,
          message: `YouTube authentication successful for channel '${channelName}'`,
        });
      } catch (error: unknown) {
        logger.error(error, 'YouTube OAuth callback failed');
        res.status(500).json({
          error: 'Authentication failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/youtube/auth/:channelName
   * Generate OAuth2 authorization URL for a specific channel
   */
  router.get(
    '/:channelName',
    (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName } = req.params;

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        const authUrl = youtubeUploader.getAuthUrl(channelName);

        res.status(200).json({
          authUrl,
          channelName,
          message: `Please visit this URL to authorize channel '${channelName}'`,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to generate YouTube auth URL');
        res.status(500).json({
          error: 'Failed to generate authorization URL',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/youtube/auth/revoke/:channelName
   * Revoke YouTube authentication for a specific channel
   */
  router.post(
    '/revoke/:channelName',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName } = req.params;

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        await youtubeUploader.revokeAuthentication(channelName);

        res.status(200).json({
          success: true,
          channelName,
          message: `YouTube authentication revoked for channel '${channelName}'`,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to revoke YouTube authentication');
        res.status(500).json({
          error: 'Failed to revoke authentication',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/youtube/auth/refresh/:channelName
   * Manually refresh access token for a specific channel
   */
  router.post(
    '/refresh/:channelName',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName } = req.params;

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        await youtubeUploader.refreshAccessToken(channelName);

        res.status(200).json({
          success: true,
          channelName,
          message: `Access token refreshed for channel '${channelName}'`,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to refresh YouTube access token');
        res.status(500).json({
          error: 'Failed to refresh token',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  return router;
}
