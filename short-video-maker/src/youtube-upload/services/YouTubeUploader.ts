import { google, youtube_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../logger';
import { Config } from '../../config';
import {
  YouTubeVideoMetadata,
  YouTubeUploadStatus,
  YouTubeTokens,
} from '../types/youtube';
import { YouTubeChannelManager } from './YouTubeChannelManager';
import { GoogleCloudStorageService } from '../../storage/GoogleCloudStorageService';

/**
 * YouTube Uploader Service
 * Handles video uploads to YouTube with multi-channel support
 */
export class YouTubeUploader {
  private config: Config;
  private channelManager: YouTubeChannelManager;
  private clientSecrets: any;
  private uploadStatuses: Map<string, YouTubeUploadStatus>;
  private gcsService?: GoogleCloudStorageService;

  constructor(config: Config) {
    this.config = config;
    this.channelManager = new YouTubeChannelManager(config);
    this.uploadStatuses = new Map();
    this.clientSecrets = this.loadClientSecrets();

    // Initialize GCS service if configured
    if (config.gcsBucketName) {
      try {
        this.gcsService = new GoogleCloudStorageService(config);
        logger.info('Google Cloud Storage service initialized for YouTube uploads');
      } catch (error) {
        logger.warn({ error }, 'GCS service not initialized - uploads will be skipped');
      }
    }

    logger.info('YouTube Uploader initialized with multi-channel support');
  }

  /**
   * Load client secrets from JSON file or environment variable
   * Supports both local dev (file) and Cloud Run (env var)
   */
  private loadClientSecrets(): any {
    try {
      // Cloud Run / Docker: Check for YOUTUBE_CLIENT_SECRET environment variable first
      const envSecret = process.env.YOUTUBE_CLIENT_SECRET;
      if (envSecret) {
        try {
          const secrets = JSON.parse(envSecret);
          logger.info('YouTube client secrets loaded from environment variable');
          return secrets;
        } catch (parseError) {
          logger.error({ parseError }, 'Failed to parse YOUTUBE_CLIENT_SECRET environment variable as JSON');
          throw new Error('Invalid YOUTUBE_CLIENT_SECRET format - must be valid JSON');
        }
      }

      // Local dev: Fallback to file-based secrets
      const secretPath = this.config.youtubeClientSecretPath;
      if (!fs.existsSync(secretPath)) {
        throw new Error(`Client secret file not found at: ${secretPath}`);
      }
      const secrets = fs.readJsonSync(secretPath);
      logger.info('YouTube client secrets loaded from file');
      return secrets;
    } catch (error) {
      logger.error(error, 'Failed to load YouTube client secrets');
      throw error;
    }
  }

  /**
   * Create OAuth2Client for a specific channel with automatic token refresh
   */
  private createOAuth2Client(channelName?: string): OAuth2Client {
    const oauth2Client = new google.auth.OAuth2(
      this.clientSecrets.web.client_id,
      this.clientSecrets.web.client_secret,
      this.clientSecrets.web.redirect_uris[0]
    );

    // Load tokens if channel name is provided
    if (channelName) {
      const tokens = this.channelManager.loadTokens(channelName);
      if (tokens) {
        oauth2Client.setCredentials(tokens);

        // Automatically refresh and save tokens when they expire
        oauth2Client.on('tokens', (newTokens) => {
          logger.info({ channelName }, 'Access token automatically refreshed');

          // Merge new tokens with existing tokens (preserve refresh_token)
          const existingTokens = this.channelManager.loadTokens(channelName);
          const updatedTokens = {
            ...existingTokens,
            ...newTokens,
            // Keep refresh_token if not provided in newTokens
            refresh_token: newTokens.refresh_token || existingTokens?.refresh_token,
          };

          // Save updated tokens
          this.channelManager.saveTokens(channelName, updatedTokens as YouTubeTokens);
        });
      }
    }

    return oauth2Client;
  }

  /**
   * Get channel manager instance
   */
  public getChannelManager(): YouTubeChannelManager {
    return this.channelManager;
  }

  /**
   * Generate OAuth2 authorization URL for a specific channel
   */
  public getAuthUrl(channelName: string): string {
    if (!this.channelManager.channelExists(channelName)) {
      throw new Error(`Channel '${channelName}' not found. Add it first using addChannel.`);
    }

    const oauth2Client = this.createOAuth2Client();

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent screen to get refresh token
      state: channelName, // Pass channel name in state parameter
    });

    logger.info({ channelName, authUrl }, 'Generated YouTube auth URL for channel');
    return authUrl;
  }

  /**
   * Exchange authorization code for tokens and update channel info
   */
  public async handleAuthCallback(code: string, channelName: string): Promise<void> {
    try {
      if (!this.channelManager.channelExists(channelName)) {
        throw new Error(`Channel '${channelName}' not found`);
      }

      const oauth2Client = this.createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Save tokens for this channel
      this.channelManager.saveTokens(channelName, tokens as YouTubeTokens);

      // Fetch and update channel information
      await this.channelManager.updateChannelInfo(channelName, oauth2Client);

      logger.info({ channelName }, 'YouTube authentication successful for channel');
    } catch (error) {
      logger.error({ error, channelName }, 'Failed to exchange auth code for tokens');
      throw new Error('YouTube authentication failed');
    }
  }

  /**
   * Check if a channel is authenticated
   */
  public isChannelAuthenticated(channelName: string): boolean {
    return this.channelManager.isChannelAuthenticated(channelName);
  }

  /**
   * Upload video to YouTube on a specific channel
   */
  public async uploadVideo(
    videoId: string,
    channelName: string,
    metadata: YouTubeVideoMetadata,
    notifySubscribers: boolean = false
  ): Promise<string> {
    // Validate channel
    if (!this.channelManager.channelExists(channelName)) {
      throw new Error(`Channel '${channelName}' not found`);
    }

    if (!this.isChannelAuthenticated(channelName)) {
      throw new Error(`Channel '${channelName}' is not authenticated. Please authenticate first.`);
    }

    // Update status to uploading
    this.updateStatus(videoId, channelName, 'uploading', 0);

    try {
      // Get video file path
      const videoPath = path.join(this.config.videosDirPath, `${videoId}.mp4`);

      // Track if we downloaded from GCS (for cleanup later)
      let downloadedFromGCS = false;

      // Try to download from GCS if file doesn't exist locally
      if (!fs.existsSync(videoPath)) {
        if (this.gcsService) {
          logger.info({ videoId }, 'Video not found locally, attempting download from GCS');
          const downloadResult = await this.gcsService.downloadVideo(videoId, videoPath);

          if (!downloadResult.success) {
            throw new Error(`Video file not found locally or in GCS: ${videoPath}. GCS error: ${downloadResult.error}`);
          }

          downloadedFromGCS = true;
          logger.info({ videoId, videoPath }, 'Video downloaded from GCS successfully');
        } else {
          throw new Error(`Video file not found: ${videoPath}`);
        }
      }

      const fileSize = fs.statSync(videoPath).size;
      logger.info({ videoId, channelName, videoPath, fileSize, downloadedFromGCS }, 'Starting YouTube upload');

      // Create OAuth2 client for this channel
      const oauth2Client = this.createOAuth2Client(channelName);
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      // Prepare video metadata
      const videoResource = {
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags || [],
          categoryId: metadata.categoryId || '22', // Default: People & Blogs
          defaultLanguage: metadata.defaultLanguage || 'en',
        },
        status: {
          privacyStatus: metadata.privacyStatus,
          selfDeclaredMadeForKids: false,
        },
        notifySubscribers,
      };

      // Upload video
      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: videoResource,
        media: {
          body: fs.createReadStream(videoPath),
        },
      });

      const youtubeVideoId = response.data.id!;
      const videoUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

      // Upload to GCS after successful YouTube upload (skip if we downloaded from GCS)
      if (this.gcsService && !downloadedFromGCS) {
        logger.info({ videoId }, 'Uploading video to GCS after successful YouTube upload');

        const gcsResult = await this.gcsService.uploadVideo(
          videoId,
          videoPath,
          (progress) => {
            logger.debug(
              {
                videoId,
                percentComplete: progress.percentComplete,
                bytesWritten: progress.bytesWritten,
                totalBytes: progress.totalBytes,
              },
              'GCS upload progress'
            );
          }
        );

        if (gcsResult.success) {
          logger.info(
            {
              videoId,
              gcsPath: gcsResult.gcsPath,
              signedUrl: gcsResult.signedUrl,
              autoDeleteAfterDays: this.config.gcsAutoDeleteLocalAfterDays,
            },
            'Video uploaded to GCS successfully - local file retained for review'
          );

          // Note: Local file is NOT deleted immediately
          // Local file cleanup happens based on GCS_AUTO_DELETE_LOCAL_AFTER_DAYS setting
          // - 0 = never delete (default)
          // - 7 = delete after 7 days
          // - etc.
        } else {
          logger.error(
            { videoId, error: gcsResult.error },
            'Failed to upload video to GCS - local file retained'
          );
        }
      }

      // Update status to completed
      this.updateStatus(videoId, channelName, 'completed', 100, youtubeVideoId, videoUrl);

      // Clean up temporary downloaded file if we downloaded from GCS
      if (downloadedFromGCS && fs.existsSync(videoPath)) {
        try {
          await fs.remove(videoPath);
          logger.info({ videoId, videoPath }, 'Cleaned up temporary video file after YouTube upload');
        } catch (cleanupError) {
          logger.warn(
            { error: cleanupError, videoId, videoPath },
            'Failed to clean up temporary video file (non-critical)'
          );
        }
      }

      logger.info(
        { videoId, channelName, youtubeVideoId, videoUrl },
        'YouTube upload completed successfully'
      );

      return youtubeVideoId;
    } catch (error) {
      logger.error({ error, videoId, channelName }, 'YouTube upload failed');
      this.updateStatus(
        videoId,
        channelName,
        'failed',
        0,
        undefined,
        undefined,
        error instanceof Error ? error.message : 'Upload failed'
      );
      throw error;
    }
  }

  /**
   * Update upload status
   */
  private updateStatus(
    videoId: string,
    channelName: string,
    status: YouTubeUploadStatus['status'],
    progress?: number,
    youtubeVideoId?: string,
    url?: string,
    error?: string
  ): void {
    const statusKey = `${videoId}-${channelName}`;
    const currentStatus = this.uploadStatuses.get(statusKey) || {
      videoId,
      channelName,
      status: 'pending',
    };

    const updatedStatus: YouTubeUploadStatus = {
      ...currentStatus,
      status,
      progress,
      youtubeVideoId,
      url,
      error,
      uploadedAt: status === 'completed' ? new Date() : currentStatus.uploadedAt,
    };

    this.uploadStatuses.set(statusKey, updatedStatus);
    logger.debug({ videoId, channelName, status: updatedStatus }, 'YouTube upload status updated');
  }

  /**
   * Get upload status
   */
  public getStatus(videoId: string, channelName: string): YouTubeUploadStatus | null {
    const statusKey = `${videoId}-${channelName}`;
    return this.uploadStatuses.get(statusKey) || null;
  }

  /**
   * Get all upload statuses
   */
  public getAllStatuses(): YouTubeUploadStatus[] {
    return Array.from(this.uploadStatuses.values());
  }

  /**
   * Get statuses for a specific channel
   */
  public getChannelStatuses(channelName: string): YouTubeUploadStatus[] {
    return this.getAllStatuses().filter(status => status.channelName === channelName);
  }

  /**
   * Clear upload status
   */
  public clearStatus(videoId: string, channelName: string): void {
    const statusKey = `${videoId}-${channelName}`;
    this.uploadStatuses.delete(statusKey);
  }

  /**
   * Refresh access token for a specific channel
   */
  public async refreshAccessToken(channelName: string): Promise<void> {
    try {
      if (!this.channelManager.channelExists(channelName)) {
        throw new Error(`Channel '${channelName}' not found`);
      }

      const oauth2Client = this.createOAuth2Client(channelName);
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);

      this.channelManager.saveTokens(channelName, credentials as YouTubeTokens);

      logger.info({ channelName }, 'YouTube access token refreshed for channel');
    } catch (error) {
      logger.error({ error, channelName }, 'Failed to refresh YouTube access token');
      throw new Error('Token refresh failed');
    }
  }

  /**
   * Revoke authentication for a specific channel
   */
  public async revokeAuthentication(channelName: string): Promise<void> {
    try {
      if (!this.channelManager.channelExists(channelName)) {
        throw new Error(`Channel '${channelName}' not found`);
      }

      const oauth2Client = this.createOAuth2Client(channelName);
      await oauth2Client.revokeCredentials();

      // Delete token file
      const tokensPath = this.channelManager.getTokensPath(channelName);
      if (fs.existsSync(tokensPath)) {
        fs.unlinkSync(tokensPath);
      }

      // Update channel authenticated status
      const channel = this.channelManager.getChannel(channelName);
      if (channel) {
        channel.authenticated = false;
      }

      logger.info({ channelName }, 'YouTube authentication revoked for channel');
    } catch (error) {
      logger.error({ error, channelName }, 'Failed to revoke YouTube authentication');
      throw error;
    }
  }

  /**
   * Manually update channel information from YouTube API
   */
  public async updateChannelInfo(channelName: string): Promise<void> {
    try {
      if (!this.channelManager.channelExists(channelName)) {
        throw new Error(`Channel '${channelName}' not found`);
      }

      if (!this.isChannelAuthenticated(channelName)) {
        throw new Error(`Channel '${channelName}' is not authenticated`);
      }

      const oauth2Client = this.createOAuth2Client(channelName);
      await this.channelManager.updateChannelInfo(channelName, oauth2Client);

      logger.info({ channelName }, 'Channel information updated successfully');
    } catch (error) {
      logger.error({ error, channelName }, 'Failed to update channel information');
      throw error;
    }
  }
}
