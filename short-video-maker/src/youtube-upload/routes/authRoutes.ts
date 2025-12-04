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
   * GET /api/youtube/auth/health-check
   * Check token validity for all channels
   * Returns 200 if all tokens are valid, 503 if any token is invalid
   * Used by Cloud Scheduler to detect token issues early
   *
   * IMPORTANT: This route must be BEFORE /:channelName to avoid conflicts
   */
  router.get(
    '/health-check',
    async (req: ExpressRequest, res: ExpressResponse) => {
      const results: Array<{
        channelName: string;
        status: 'ok' | 'error';
        message: string;
      }> = [];

      let allHealthy = true;

      try {
        const channels = youtubeUploader.getChannelManager().getAuthenticatedChannels();

        if (channels.length === 0) {
          return res.status(200).json({
            healthy: true,
            message: 'No authenticated channels to check',
            channels: [],
            checkedAt: new Date().toISOString(),
          });
        }

        for (const channel of channels) {
          try {
            // Try to refresh the token - this validates the refresh_token
            await youtubeUploader.refreshAccessToken(channel.channelName);
            results.push({
              channelName: channel.channelName,
              status: 'ok',
              message: 'Token is valid and refreshed',
            });
            logger.info({ channelName: channel.channelName }, 'YouTube token health check passed');
          } catch (error: unknown) {
            allHealthy = false;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.push({
              channelName: channel.channelName,
              status: 'error',
              message: errorMessage,
            });
            logger.error(
              { channelName: channel.channelName, error: errorMessage },
              'YouTube token health check FAILED - re-authentication required'
            );
          }
        }

        const response = {
          healthy: allHealthy,
          message: allHealthy
            ? 'All YouTube tokens are valid'
            : 'Some YouTube tokens are invalid - re-authentication required',
          channels: results,
          checkedAt: new Date().toISOString(),
        };

        // Return 503 if any token is invalid (for alerting)
        if (!allHealthy) {
          return res.status(503).json(response);
        }

        return res.status(200).json(response);
      } catch (error: unknown) {
        logger.error(error, 'YouTube token health check failed');
        return res.status(500).json({
          healthy: false,
          message: 'Health check failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          checkedAt: new Date().toISOString(),
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
