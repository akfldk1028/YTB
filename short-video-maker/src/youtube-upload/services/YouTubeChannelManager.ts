import { google, youtube_v3 } from 'googleapis';
import type { OAuth2Client } from 'googleapis-common';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../logger';
import { Config } from '../../config';
import {
  YouTubeChannel,
  YouTubeChannelConfig,
  YouTubeTokens,
} from '../types/youtube';

/**
 * YouTube Channel Manager
 * Manages multiple YouTube channels with separate OAuth2 tokens
 */
export class YouTubeChannelManager {
  private config: Config;
  private channelsConfigPath: string;
  private channelsConfig: YouTubeChannelConfig;

  constructor(config: Config) {
    this.config = config;
    this.channelsConfigPath = path.join(
      config.getDataDirPath(),
      'youtube-channels.json'
    );
    this.channelsConfig = this.loadChannelsConfig();
  }

  /**
   * Load channels configuration from file
   */
  private loadChannelsConfig(): YouTubeChannelConfig {
    try {
      if (fs.existsSync(this.channelsConfigPath)) {
        const config = fs.readJsonSync(this.channelsConfigPath);
        logger.info(
          { channelCount: Object.keys(config.channels || {}).length },
          'YouTube channels configuration loaded'
        );
        return config;
      }
    } catch (error) {
      logger.error(error, 'Failed to load channels configuration');
    }

    // Return empty config if file doesn't exist or loading fails
    return { channels: {} };
  }

  /**
   * Save channels configuration to file
   */
  private saveChannelsConfig(): void {
    try {
      fs.writeJsonSync(this.channelsConfigPath, this.channelsConfig, {
        spaces: 2,
      });
      logger.info('YouTube channels configuration saved');
    } catch (error) {
      logger.error(error, 'Failed to save channels configuration');
      throw error;
    }
  }

  /**
   * Get token file path for a specific channel
   */
  public getTokensPath(channelName: string): string {
    return path.join(
      this.config.getDataDirPath(),
      `youtube-tokens-${channelName}.json`
    );
  }

  /**
   * Add a new channel
   */
  public addChannel(channelName: string): void {
    if (this.channelsConfig.channels[channelName]) {
      throw new Error(`Channel '${channelName}' already exists`);
    }

    // Create placeholder channel entry
    const newChannel: YouTubeChannel = {
      channelName,
      channelId: '', // Will be filled after authentication
      channelTitle: '', // Will be filled after authentication
      email: '', // Will be filled after authentication
      createdAt: new Date(),
      authenticated: false,
    };

    this.channelsConfig.channels[channelName] = newChannel;
    this.saveChannelsConfig();

    logger.info({ channelName }, 'New YouTube channel added');
  }

  /**
   * Update channel information after authentication
   */
  public async updateChannelInfo(
    channelName: string,
    oauth2Client: OAuth2Client
  ): Promise<void> {
    const channel = this.channelsConfig.channels[channelName];
    if (!channel) {
      throw new Error(`Channel '${channelName}' not found`);
    }

    try {
      // Fetch channel information from YouTube API
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      const response = await youtube.channels.list({
        part: ['snippet', 'contentDetails'],
        mine: true,
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('No channel found for authenticated user');
      }

      const channelData = response.data.items[0];

      // Update channel information
      channel.channelId = channelData.id || '';
      channel.channelTitle = channelData.snippet?.title || '';
      channel.description = channelData.snippet?.description || '';
      channel.customUrl = channelData.snippet?.customUrl || '';
      channel.thumbnailUrl =
        channelData.snippet?.thumbnails?.default?.url || '';
      channel.authenticated = true;

      // Get account email from OAuth2 client
      const tokenInfo = await oauth2Client.getTokenInfo(
        oauth2Client.credentials.access_token!
      );
      channel.email = tokenInfo.email || '';

      this.saveChannelsConfig();

      logger.info(
        {
          channelName,
          channelId: channel.channelId,
          channelTitle: channel.channelTitle,
        },
        'Channel information updated'
      );
    } catch (error) {
      logger.error({ error, channelName }, 'Failed to update channel info');
      throw error;
    }
  }

  /**
   * Remove a channel
   */
  public removeChannel(channelName: string): void {
    if (!this.channelsConfig.channels[channelName]) {
      throw new Error(`Channel '${channelName}' not found`);
    }

    // Delete channel from config
    delete this.channelsConfig.channels[channelName];
    this.saveChannelsConfig();

    // Delete token file if exists
    const tokensPath = this.getTokensPath(channelName);
    if (fs.existsSync(tokensPath)) {
      fs.unlinkSync(tokensPath);
      logger.info({ channelName }, 'Channel tokens file deleted');
    }

    logger.info({ channelName }, 'YouTube channel removed');
  }

  /**
   * Get a specific channel
   */
  public getChannel(channelName: string): YouTubeChannel | null {
    return this.channelsConfig.channels[channelName] || null;
  }

  /**
   * Get all channels
   */
  public listChannels(): YouTubeChannel[] {
    return Object.values(this.channelsConfig.channels);
  }

  /**
   * Check if a channel exists
   */
  public channelExists(channelName: string): boolean {
    return !!this.channelsConfig.channels[channelName];
  }

  /**
   * Load tokens for a specific channel
   */
  public loadTokens(channelName: string): YouTubeTokens | null {
    try {
      const tokensPath = this.getTokensPath(channelName);
      if (fs.existsSync(tokensPath)) {
        const tokens: YouTubeTokens = fs.readJsonSync(tokensPath);
        logger.debug({ channelName }, 'Channel tokens loaded');
        return tokens;
      }
    } catch (error) {
      logger.error({ error, channelName }, 'Failed to load channel tokens');
    }
    return null;
  }

  /**
   * Save tokens for a specific channel
   */
  public saveTokens(channelName: string, tokens: YouTubeTokens): void {
    try {
      const tokensPath = this.getTokensPath(channelName);
      fs.writeJsonSync(tokensPath, tokens, { spaces: 2 });
      logger.info({ channelName }, 'Channel tokens saved');

      // Update authenticated status
      const channel = this.channelsConfig.channels[channelName];
      if (channel) {
        channel.authenticated = true;
        this.saveChannelsConfig();
      }
    } catch (error) {
      logger.error({ error, channelName }, 'Failed to save channel tokens');
      throw error;
    }
  }

  /**
   * Check if a channel is authenticated
   */
  public isChannelAuthenticated(channelName: string): boolean {
    const channel = this.getChannel(channelName);
    if (!channel) {
      return false;
    }

    const tokensPath = this.getTokensPath(channelName);
    return channel.authenticated && fs.existsSync(tokensPath);
  }

  /**
   * Get authenticated channels only
   */
  public getAuthenticatedChannels(): YouTubeChannel[] {
    return this.listChannels().filter((channel) =>
      this.isChannelAuthenticated(channel.channelName)
    );
  }

  /**
   * Get unauthenticated channels
   */
  public getUnauthenticatedChannels(): YouTubeChannel[] {
    return this.listChannels().filter(
      (channel) => !this.isChannelAuthenticated(channel.channelName)
    );
  }
}
