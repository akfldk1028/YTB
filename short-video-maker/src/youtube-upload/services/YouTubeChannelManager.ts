import { google, youtube_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../logger';
import { Config } from '../../config';
import {
  YouTubeChannel,
  YouTubeChannelConfig,
  YouTubeTokens,
  YouTubeSubChannel,
} from '../types/youtube';
import { YouTubeSecretManager } from './YouTubeSecretManager';

/**
 * YouTube Channel Manager
 * Manages multiple YouTube channels with separate OAuth2 tokens
 */
export class YouTubeChannelManager {
  private config: Config;
  private channelsConfigPath: string;
  private channelsConfig: YouTubeChannelConfig;
  private secretManager: YouTubeSecretManager;

  constructor(config: Config) {
    this.config = config;
    this.channelsConfigPath = path.join(
      config.getDataDirPath(),
      'youtube-channels.json'
    );
    this.channelsConfig = this.loadChannelsConfig();
    this.secretManager = new YouTubeSecretManager(config);
  }

  /**
   * Load channels configuration from file
   * Note: In Cloud Run, YOUTUBE_DATA is a tar.gz archive extracted by index.ts before this runs
   */
  private loadChannelsConfig(): YouTubeChannelConfig {
    try {
      // Load from file (works for both local dev and Cloud Run after extraction)
      if (fs.existsSync(this.channelsConfigPath)) {
        const config = fs.readJsonSync(this.channelsConfigPath);
        logger.info(
          { channelCount: Object.keys(config.channels || {}).length },
          'YouTube channels configuration loaded from file'
        );
        return config;
      } else {
        logger.warn(
          { path: this.channelsConfigPath },
          'YouTube channels configuration file not found - returning empty config'
        );
      }
    } catch (error) {
      logger.error(error, 'Failed to load channels configuration');
    }

    // Return empty config if file doesn't exist or load failed
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
  public async saveTokens(channelName: string, tokens: YouTubeTokens): Promise<void> {
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

      // Backup tokens to Secret Manager (Cloud Run only)
      if (this.secretManager.isEnabled()) {
        // Run in background to avoid blocking
        this.secretManager.updateYouTubeDataSecret().catch(error => {
          logger.warn({ error, channelName }, 'Secret Manager backup failed (non-fatal)');
        });
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

  /**
   * Get sub-channels for a specific channel
   */
  public getSubChannels(channelName: string): YouTubeSubChannel[] {
    const channel = this.getChannel(channelName);
    return channel?.subChannels || [];
  }

  /**
   * Get a specific sub-channel by alias or ID
   * @param channelName - The main channel name
   * @param subChannelRef - The sub-channel alias or channel ID
   * @returns The sub-channel if found, null otherwise
   */
  public getSubChannel(channelName: string, subChannelRef: string): YouTubeSubChannel | null {
    const subChannels = this.getSubChannels(channelName);

    // Find by alias (case-insensitive) or by ID
    const subChannel = subChannels.find(
      (sc) =>
        sc.alias.toLowerCase() === subChannelRef.toLowerCase() ||
        sc.id === subChannelRef
    );

    return subChannel || null;
  }

  /**
   * Get the default sub-channel for a channel
   * Returns the sub-channel marked as default, or the first one if none is default
   */
  public getDefaultSubChannel(channelName: string): YouTubeSubChannel | null {
    const subChannels = this.getSubChannels(channelName);

    if (subChannels.length === 0) {
      return null;
    }

    // Find default sub-channel or return the first one
    return subChannels.find((sc) => sc.isDefault) || subChannels[0];
  }

  /**
   * Resolve target channel ID for upload
   * Takes into account sub-channels if specified
   * @param channelName - The main channel name
   * @param subChannelRef - Optional sub-channel alias or ID
   * @returns The YouTube channel ID to upload to
   */
  public resolveTargetChannelId(channelName: string, subChannelRef?: string): string | null {
    const channel = this.getChannel(channelName);
    if (!channel) {
      return null;
    }

    // If sub-channel is specified, try to resolve it
    if (subChannelRef) {
      const subChannel = this.getSubChannel(channelName, subChannelRef);
      if (subChannel) {
        logger.debug(
          { channelName, subChannelRef, targetId: subChannel.id },
          'Resolved sub-channel for upload'
        );
        return subChannel.id;
      }

      logger.warn(
        { channelName, subChannelRef },
        'Sub-channel not found, using main channel'
      );
    }

    // No sub-channels or sub-channel not found - use main channel ID
    // Check if there's a default sub-channel first
    const defaultSub = this.getDefaultSubChannel(channelName);
    if (defaultSub) {
      return defaultSub.id;
    }

    return channel.channelId || null;
  }

  /**
   * Add a sub-channel to an existing channel
   */
  public addSubChannel(channelName: string, subChannel: YouTubeSubChannel): void {
    const channel = this.channelsConfig.channels[channelName];
    if (!channel) {
      throw new Error(`Channel '${channelName}' not found`);
    }

    // Initialize subChannels array if not exists
    if (!channel.subChannels) {
      channel.subChannels = [];
    }

    // Check for duplicate alias
    if (channel.subChannels.some((sc) => sc.alias === subChannel.alias)) {
      throw new Error(`Sub-channel with alias '${subChannel.alias}' already exists`);
    }

    channel.subChannels.push(subChannel);
    this.saveChannelsConfig();

    logger.info(
      { channelName, subChannelAlias: subChannel.alias, subChannelId: subChannel.id },
      'Sub-channel added'
    );
  }

  /**
   * Remove a sub-channel
   */
  public removeSubChannel(channelName: string, subChannelRef: string): void {
    const channel = this.channelsConfig.channels[channelName];
    if (!channel || !channel.subChannels) {
      throw new Error(`Channel '${channelName}' not found or has no sub-channels`);
    }

    const index = channel.subChannels.findIndex(
      (sc) => sc.alias === subChannelRef || sc.id === subChannelRef
    );

    if (index === -1) {
      throw new Error(`Sub-channel '${subChannelRef}' not found`);
    }

    channel.subChannels.splice(index, 1);
    this.saveChannelsConfig();

    logger.info({ channelName, subChannelRef }, 'Sub-channel removed');
  }

  /**
   * List all sub-channels for a channel with their details
   */
  public listSubChannelsInfo(channelName: string): { channelName: string; subChannels: YouTubeSubChannel[] } {
    const channel = this.getChannel(channelName);
    return {
      channelName,
      subChannels: channel?.subChannels || [],
    };
  }
}
