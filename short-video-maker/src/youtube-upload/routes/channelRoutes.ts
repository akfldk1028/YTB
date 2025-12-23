import express from 'express';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { YouTubeUploader } from '../services/YouTubeUploader';
import { logger } from '../../logger';

/**
 * YouTube Channel Management Routes
 * Handles CRUD operations for YouTube channels
 */
export function createChannelRoutes(youtubeUploader: YouTubeUploader): express.Router {
  const router = express.Router();
  const channelManager = youtubeUploader.getChannelManager();

  /**
   * POST /api/youtube/channels
   * Add a new YouTube channel
   *
   * Body: { channelName: string }
   */
  router.post(
    '/',
    (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName } = req.body;

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        // Validate channel name format
        if (!/^[a-zA-Z0-9_-]+$/.test(channelName)) {
          return res.status(400).json({
            error: 'Invalid channel name. Use only alphanumeric characters, hyphens, and underscores.',
          });
        }

        channelManager.addChannel(channelName);

        // Generate auth URL for the new channel
        const authUrl = youtubeUploader.getAuthUrl(channelName);

        res.status(201).json({
          success: true,
          channelName,
          authUrl,
          message: `Channel '${channelName}' added. Please authenticate using the provided URL.`,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to add YouTube channel');
        res.status(400).json({
          error: 'Failed to add channel',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/youtube/channels
   * Get all YouTube channels
   *
   * Query params:
   * - authenticated: boolean (optional) - filter by authentication status
   */
  router.get(
    '/',
    (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { authenticated } = req.query;

        let channels;
        if (authenticated === 'true') {
          channels = channelManager.getAuthenticatedChannels();
        } else if (authenticated === 'false') {
          channels = channelManager.getUnauthenticatedChannels();
        } else {
          channels = channelManager.listChannels();
        }

        res.status(200).json({
          channels,
          count: channels.length,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to list YouTube channels');
        res.status(500).json({
          error: 'Failed to list channels',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/youtube/channels/:channelName
   * Get information about a specific channel
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

        const channel = channelManager.getChannel(channelName);

        if (!channel) {
          return res.status(404).json({
            error: 'Channel not found',
            channelName,
          });
        }

        // Add authentication status
        const isAuthenticated = channelManager.isChannelAuthenticated(channelName);

        res.status(200).json({
          ...channel,
          authenticated: isAuthenticated,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to get YouTube channel');
        res.status(500).json({
          error: 'Failed to get channel',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * DELETE /api/youtube/channels/:channelName
   * Remove a YouTube channel
   */
  router.delete(
    '/:channelName',
    (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName } = req.params;

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        channelManager.removeChannel(channelName);

        res.status(200).json({
          success: true,
          channelName,
          message: `Channel '${channelName}' removed successfully`,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to remove YouTube channel');
        res.status(400).json({
          error: 'Failed to remove channel',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/youtube/channels/:channelName/status
   * Get authentication status for a specific channel
   */
  router.get(
    '/:channelName/status',
    (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName } = req.params;

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        const exists = channelManager.channelExists(channelName);
        if (!exists) {
          return res.status(404).json({
            error: 'Channel not found',
            channelName,
          });
        }

        const isAuthenticated = channelManager.isChannelAuthenticated(channelName);
        const channel = channelManager.getChannel(channelName);

        res.status(200).json({
          channelName,
          exists: true,
          authenticated: isAuthenticated,
          channelInfo: channel,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to get channel status');
        res.status(500).json({
          error: 'Failed to get channel status',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/youtube/channels/:channelName/update-info
   * Manually update channel information from YouTube API
   */
  router.post(
    '/:channelName/update-info',
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName } = req.params;

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        await youtubeUploader.updateChannelInfo(channelName);

        const updatedChannel = channelManager.getChannel(channelName);

        res.status(200).json({
          success: true,
          channelName,
          channelInfo: updatedChannel,
          message: `Channel information updated for '${channelName}'`,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to update channel information');
        res.status(500).json({
          error: 'Failed to update channel information',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ========================================
  // Sub-Channel Routes (Brand Account Support)
  // ========================================

  /**
   * GET /api/youtube/channels/:channelName/sub-channels
   * Get all sub-channels for a specific channel
   */
  router.get(
    '/:channelName/sub-channels',
    (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName } = req.params;

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        if (!channelManager.channelExists(channelName)) {
          return res.status(404).json({
            error: 'Channel not found',
            channelName,
          });
        }

        const subChannelsInfo = channelManager.listSubChannelsInfo(channelName);

        res.status(200).json({
          success: true,
          ...subChannelsInfo,
          count: subChannelsInfo.subChannels.length,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to get sub-channels');
        res.status(500).json({
          error: 'Failed to get sub-channels',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/youtube/channels/:channelName/sub-channels
   * Add a new sub-channel to a channel
   *
   * Body:
   * {
   *   "id": "UCxxxx...",
   *   "title": "왜저러냥",
   *   "alias": "why_cat",
   *   "customUrl": "@왜저러냥-g7d",
   *   "isDefault": true
   * }
   */
  router.post(
    '/:channelName/sub-channels',
    (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName } = req.params;
        const { id, title, alias, customUrl, thumbnailUrl, isDefault } = req.body;

        if (!channelName) {
          return res.status(400).json({
            error: 'channelName is required',
          });
        }

        if (!id || !title || !alias) {
          return res.status(400).json({
            error: 'id, title, and alias are required for sub-channel',
          });
        }

        // Validate alias format
        if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
          return res.status(400).json({
            error: 'Invalid alias. Use only alphanumeric characters, hyphens, and underscores.',
          });
        }

        channelManager.addSubChannel(channelName, {
          id,
          title,
          alias,
          customUrl,
          thumbnailUrl,
          isDefault: isDefault || false,
        });

        res.status(201).json({
          success: true,
          channelName,
          subChannel: { id, title, alias, customUrl, thumbnailUrl, isDefault },
          message: `Sub-channel '${alias}' added to channel '${channelName}'`,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to add sub-channel');
        res.status(400).json({
          error: 'Failed to add sub-channel',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/youtube/channels/:channelName/sub-channels/:subChannelRef
   * Get a specific sub-channel by alias or ID
   */
  router.get(
    '/:channelName/sub-channels/:subChannelRef',
    (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName, subChannelRef } = req.params;

        if (!channelName || !subChannelRef) {
          return res.status(400).json({
            error: 'channelName and subChannelRef are required',
          });
        }

        const subChannel = channelManager.getSubChannel(channelName, subChannelRef);

        if (!subChannel) {
          return res.status(404).json({
            error: 'Sub-channel not found',
            channelName,
            subChannelRef,
          });
        }

        res.status(200).json({
          success: true,
          channelName,
          subChannel,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to get sub-channel');
        res.status(500).json({
          error: 'Failed to get sub-channel',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * DELETE /api/youtube/channels/:channelName/sub-channels/:subChannelRef
   * Remove a sub-channel
   */
  router.delete(
    '/:channelName/sub-channels/:subChannelRef',
    (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { channelName, subChannelRef } = req.params;

        if (!channelName || !subChannelRef) {
          return res.status(400).json({
            error: 'channelName and subChannelRef are required',
          });
        }

        channelManager.removeSubChannel(channelName, subChannelRef);

        res.status(200).json({
          success: true,
          channelName,
          subChannelRef,
          message: `Sub-channel '${subChannelRef}' removed from channel '${channelName}'`,
        });
      } catch (error: unknown) {
        logger.error(error, 'Failed to remove sub-channel');
        res.status(400).json({
          error: 'Failed to remove sub-channel',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  return router;
}
