import { google, youtubeAnalytics_v2 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import fs from 'fs-extra';
import { logger } from '../../logger';
import { Config } from '../../config';
import { YouTubeChannelManager } from '../../youtube-upload/services/YouTubeChannelManager';
import {
  VideoMetrics,
  RewardMetrics,
  AnalyticsQueryOptions,
  AnalyticsResponse,
  ChannelAnalytics,
  VideoBasicInfo,
  TrafficSourceDetail,
  CountryDetail,
  DeviceDetail,
  OperatingSystemDetail,
  AgeGroupDetail,
  GenderDetail,
} from '../types/analytics';

/**
 * YouTube Analytics Service
 * YouTube Analytics API를 사용하여 비디오 메트릭 조회
 * 강화학습 보상 계산에 필요한 데이터 수집
 */
export class YouTubeAnalyticsService {
  private config: Config;
  private channelManager: YouTubeChannelManager;
  private clientSecrets: any;

  constructor(config: Config) {
    this.config = config;
    this.channelManager = new YouTubeChannelManager(config);
    this.clientSecrets = this.loadClientSecrets();
    logger.info('YouTube Analytics Service initialized');
  }

  /**
   * Load client secrets from JSON file or environment variable
   */
  private loadClientSecrets(): any {
    try {
      const envSecret = process.env.YOUTUBE_CLIENT_SECRET;
      if (envSecret) {
        const secrets = JSON.parse(envSecret);
        logger.info('YouTube client secrets loaded from environment variable (Analytics)');
        return secrets;
      }

      const secretPath = this.config.youtubeClientSecretPath;
      if (!fs.existsSync(secretPath)) {
        throw new Error(`Client secret file not found at: ${secretPath}`);
      }
      const secrets = fs.readJsonSync(secretPath);
      logger.info('YouTube client secrets loaded from file (Analytics)');
      return secrets;
    } catch (error) {
      logger.error(error, 'Failed to load YouTube client secrets for Analytics');
      throw error;
    }
  }

  /**
   * Create OAuth2Client for a specific channel
   */
  private createOAuth2Client(channelName: string): OAuth2Client {
    const oauth2Client = new google.auth.OAuth2(
      this.clientSecrets.web.client_id,
      this.clientSecrets.web.client_secret,
      this.clientSecrets.web.redirect_uris[0]
    );

    const tokens = this.channelManager.loadTokens(channelName);
    if (!tokens) {
      throw new Error(`No tokens found for channel: ${channelName}`);
    }

    oauth2Client.setCredentials(tokens);

    // Auto-refresh token handling
    oauth2Client.on('tokens', (newTokens) => {
      logger.info({ channelName }, 'Access token automatically refreshed (Analytics)');
      const existingTokens = this.channelManager.loadTokens(channelName);
      if (existingTokens && newTokens.access_token) {
        const updatedTokens = {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || existingTokens.refresh_token || '',
          scope: newTokens.scope || existingTokens.scope,
          token_type: newTokens.token_type || existingTokens.token_type,
          expiry_date: newTokens.expiry_date || existingTokens.expiry_date,
        };
        this.channelManager.saveTokens(channelName, updatedTokens);
      }
    });

    return oauth2Client;
  }

  /**
   * Get YouTube Analytics API client
   */
  private getAnalyticsClient(channelName: string): youtubeAnalytics_v2.Youtubeanalytics {
    const oauth2Client = this.createOAuth2Client(channelName);
    return google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });
  }

  /**
   * Get YouTube Data API client (for basic video stats)
   */
  private getYouTubeClient(channelName: string) {
    const oauth2Client = this.createOAuth2Client(channelName);
    return google.youtube({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Get video metrics from YouTube Analytics API - 모든 메트릭 조회
   */
  async getVideoMetrics(options: AnalyticsQueryOptions): Promise<AnalyticsResponse> {
    const {
      channelName,
      videoId,
      startDate,
      endDate,
      includeVideoInfo = true,
      includeTrafficSources = false,
      includeGeography = false,
      includeDevices = false,
      includeDemographics = false,
      includeCards = true,
      includePlaylists = true,
    } = options;

    try {
      logger.info({ channelName, videoId, startDate, endDate }, 'Fetching video metrics (all)');

      // Get channel info
      const channel = this.channelManager.getChannel(channelName);
      if (!channel) {
        throw new Error(`Channel not found: ${channelName}`);
      }

      const analyticsClient = this.getAnalyticsClient(channelName);
      const youtubeClient = this.getYouTubeClient(channelName);

      // Default date range: last 30 days
      const end = endDate || new Date().toISOString().split('T')[0];
      const start = startDate || this.getDateDaysAgo(30);

      // 1. Get basic stats and video info from Data API
      const [basicStats, videoInfo] = await Promise.all([
        this.getBasicVideoStats(youtubeClient, videoId),
        includeVideoInfo ? this.getVideoInfo(youtubeClient, videoId) : undefined,
      ]);

      // 2. Get core analytics metrics (all available)
      const coreMetrics = await this.getCoreAnalyticsMetrics(
        analyticsClient,
        channel.channelId!,
        videoId,
        start,
        end
      );

      // 3. Get optional metrics in parallel
      const [
        trafficSources,
        topCountries,
        deviceBreakdown,
        demographics,
      ] = await Promise.all([
        includeTrafficSources ? this.getTrafficSourceMetrics(analyticsClient, channel.channelId!, videoId, start, end) : undefined,
        includeGeography ? this.getGeographyMetrics(analyticsClient, channel.channelId!, videoId, start, end) : undefined,
        includeDevices ? this.getDeviceMetrics(analyticsClient, channel.channelId!, videoId, start, end) : undefined,
        includeDemographics ? this.getDemographicsMetrics(analyticsClient, channel.channelId!, videoId, start, end) : undefined,
      ]);

      const metrics: VideoMetrics = {
        videoId,
        channelId: channel.channelId!,

        // Basic stats from Data API
        views: basicStats.views,
        likes: basicStats.likes,
        dislikes: basicStats.dislikes,
        comments: basicStats.comments,
        favoriteCount: basicStats.favoriteCount,

        // Core Analytics metrics
        estimatedMinutesWatched: coreMetrics.estimatedMinutesWatched,
        averageViewDuration: coreMetrics.averageViewDuration,
        averageViewPercentage: coreMetrics.averageViewPercentage,
        subscribersGained: coreMetrics.subscribersGained,
        subscribersLost: coreMetrics.subscribersLost,
        shares: coreMetrics.shares,

        // Card/Annotation metrics
        cardImpressions: coreMetrics.cardImpressions,
        cardClicks: coreMetrics.cardClicks,
        cardClickRate: coreMetrics.cardClickRate,
        cardTeaserImpressions: coreMetrics.cardTeaserImpressions,
        cardTeaserClicks: coreMetrics.cardTeaserClicks,
        cardTeaserClickRate: coreMetrics.cardTeaserClickRate,
        annotationImpressions: coreMetrics.annotationImpressions,
        annotationClicks: coreMetrics.annotationClicks,
        annotationClickThroughRate: coreMetrics.annotationClickThroughRate,
        annotationCloseRate: coreMetrics.annotationCloseRate,

        // Playlist metrics
        videosAddedToPlaylists: coreMetrics.videosAddedToPlaylists,
        videosRemovedFromPlaylists: coreMetrics.videosRemovedFromPlaylists,

        // Optional extended data
        videoInfo,
        trafficSources,
        topCountries,
        deviceBreakdown: deviceBreakdown?.devices,
        operatingSystemBreakdown: deviceBreakdown?.operatingSystems,
        ageGroups: demographics?.ageGroups,
        genderBreakdown: demographics?.genders,

        // Metadata
        queryDate: new Date().toISOString(),
        startDate: start,
        endDate: end,
      };

      // Calculate reward
      const reward = this.calculateReward(metrics);

      logger.info({ videoId, views: metrics.views, reward: reward.totalReward }, 'Video metrics fetched successfully');

      return {
        success: true,
        data: metrics,
        reward,
      };
    } catch (error) {
      logger.error({ error, videoId }, 'Failed to fetch video metrics');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get basic video statistics from YouTube Data API v3
   */
  private async getBasicVideoStats(youtubeClient: any, videoId: string) {
    try {
      const response = await youtubeClient.videos.list({
        part: ['statistics'],
        id: [videoId],
      });

      const video = response.data.items?.[0];
      const stats = video?.statistics || {};

      return {
        views: parseInt(stats.viewCount) || 0,
        likes: parseInt(stats.likeCount) || 0,
        dislikes: parseInt(stats.dislikeCount) || 0,
        comments: parseInt(stats.commentCount) || 0,
        favoriteCount: parseInt(stats.favoriteCount) || 0,
      };
    } catch (error) {
      logger.warn({ error, videoId }, 'Failed to get basic video stats, using defaults');
      return { views: 0, likes: 0, dislikes: 0, comments: 0, favoriteCount: 0 };
    }
  }

  /**
   * Get video info from YouTube Data API v3
   */
  private async getVideoInfo(youtubeClient: any, videoId: string): Promise<VideoBasicInfo | undefined> {
    try {
      const response = await youtubeClient.videos.list({
        part: ['snippet', 'contentDetails', 'status'],
        id: [videoId],
      });

      const video = response.data.items?.[0];
      if (!video) return undefined;

      const snippet = video.snippet || {};
      const contentDetails = video.contentDetails || {};
      const status = video.status || {};

      return {
        videoId,
        channelId: snippet.channelId || '',
        channelTitle: snippet.channelTitle || '',
        title: snippet.title || '',
        description: snippet.description || '',
        publishedAt: snippet.publishedAt || '',
        tags: snippet.tags,
        categoryId: snippet.categoryId,
        defaultLanguage: snippet.defaultLanguage,
        thumbnails: snippet.thumbnails,
        duration: contentDetails.duration,
        durationSeconds: this.parseDuration(contentDetails.duration),
        dimension: contentDetails.dimension,
        definition: contentDetails.definition,
        caption: contentDetails.caption,
        licensedContent: contentDetails.licensedContent,
        uploadStatus: status.uploadStatus,
        privacyStatus: status.privacyStatus,
        embeddable: status.embeddable,
        madeForKids: status.madeForKids,
      };
    } catch (error) {
      logger.warn({ error, videoId }, 'Failed to get video info');
      return undefined;
    }
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseDuration(duration?: string): number | undefined {
    if (!duration) return undefined;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return undefined;
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Get core analytics metrics from YouTube Analytics API
   */
  private async getCoreAnalyticsMetrics(
    analyticsClient: youtubeAnalytics_v2.Youtubeanalytics,
    channelId: string,
    videoId: string,
    startDate: string,
    endDate: string
  ) {
    try {
      // All available metrics for video dimension
      const metrics = [
        'estimatedMinutesWatched',
        'averageViewDuration',
        'averageViewPercentage',
        'subscribersGained',
        'subscribersLost',
        'shares',
        'likes',
        'dislikes',
        'comments',
        'cardImpressions',
        'cardClicks',
        'cardClickRate',
        'cardTeaserImpressions',
        'cardTeaserClicks',
        'cardTeaserClickRate',
        'annotationImpressions',
        'annotationClicks',
        'annotationClickThroughRate',
        'annotationCloseRate',
        'videosAddedToPlaylists',
        'videosRemovedFromPlaylists',
      ].join(',');

      const response = await analyticsClient.reports.query({
        ids: `channel==${channelId}`,
        startDate,
        endDate,
        metrics,
        filters: `video==${videoId}`,
        dimensions: 'video',
      });

      const rows = response.data.rows || [];
      const data = rows[0] || [];
      const headers = response.data.columnHeaders || [];

      // Build result object from headers and data
      const result: any = {};
      headers.forEach((header, index) => {
        const name = header.name;
        if (name && name !== 'video') {
          const value = data[index];
          result[name] = typeof value === 'string' ? parseFloat(value) || 0 : value || 0;
        }
      });

      return {
        estimatedMinutesWatched: result.estimatedMinutesWatched || 0,
        averageViewDuration: result.averageViewDuration || 0,
        averageViewPercentage: result.averageViewPercentage || 0,
        subscribersGained: result.subscribersGained || 0,
        subscribersLost: result.subscribersLost || 0,
        shares: result.shares || 0,
        cardImpressions: result.cardImpressions,
        cardClicks: result.cardClicks,
        cardClickRate: result.cardClickRate,
        cardTeaserImpressions: result.cardTeaserImpressions,
        cardTeaserClicks: result.cardTeaserClicks,
        cardTeaserClickRate: result.cardTeaserClickRate,
        annotationImpressions: result.annotationImpressions,
        annotationClicks: result.annotationClicks,
        annotationClickThroughRate: result.annotationClickThroughRate,
        annotationCloseRate: result.annotationCloseRate,
        videosAddedToPlaylists: result.videosAddedToPlaylists,
        videosRemovedFromPlaylists: result.videosRemovedFromPlaylists,
      };
    } catch (error) {
      logger.warn({ error, videoId }, 'Failed to get core analytics metrics');
      return {
        estimatedMinutesWatched: 0,
        averageViewDuration: 0,
        averageViewPercentage: 0,
        subscribersGained: 0,
        subscribersLost: 0,
        shares: 0,
      };
    }
  }

  /**
   * Get traffic source metrics
   */
  private async getTrafficSourceMetrics(
    analyticsClient: youtubeAnalytics_v2.Youtubeanalytics,
    channelId: string,
    videoId: string,
    startDate: string,
    endDate: string
  ): Promise<TrafficSourceDetail[] | undefined> {
    try {
      const response = await analyticsClient.reports.query({
        ids: `channel==${channelId}`,
        startDate,
        endDate,
        metrics: 'views,estimatedMinutesWatched',
        filters: `video==${videoId}`,
        dimensions: 'insightTrafficSourceType',
        sort: '-views',
      });

      const rows = response.data.rows || [];
      return rows.map((row) => ({
        source: row[0] as string,
        views: parseInt(row[1] as string) || 0,
        estimatedMinutesWatched: parseFloat(row[2] as string) || 0,
      }));
    } catch (error) {
      logger.warn({ error, videoId }, 'Failed to get traffic source metrics');
      return undefined;
    }
  }

  /**
   * Get geography metrics
   */
  private async getGeographyMetrics(
    analyticsClient: youtubeAnalytics_v2.Youtubeanalytics,
    channelId: string,
    videoId: string,
    startDate: string,
    endDate: string
  ): Promise<CountryDetail[] | undefined> {
    try {
      const response = await analyticsClient.reports.query({
        ids: `channel==${channelId}`,
        startDate,
        endDate,
        metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
        filters: `video==${videoId}`,
        dimensions: 'country',
        sort: '-views',
        maxResults: 25,
      });

      const rows = response.data.rows || [];
      return rows.map((row) => ({
        country: row[0] as string,
        views: parseInt(row[1] as string) || 0,
        estimatedMinutesWatched: parseFloat(row[2] as string) || 0,
        averageViewDuration: parseFloat(row[3] as string) || 0,
        averageViewPercentage: parseFloat(row[4] as string) || 0,
      }));
    } catch (error) {
      logger.warn({ error, videoId }, 'Failed to get geography metrics');
      return undefined;
    }
  }

  /**
   * Get device metrics
   */
  private async getDeviceMetrics(
    analyticsClient: youtubeAnalytics_v2.Youtubeanalytics,
    channelId: string,
    videoId: string,
    startDate: string,
    endDate: string
  ): Promise<{ devices: DeviceDetail[]; operatingSystems: OperatingSystemDetail[] } | undefined> {
    try {
      const [deviceResponse, osResponse] = await Promise.all([
        analyticsClient.reports.query({
          ids: `channel==${channelId}`,
          startDate,
          endDate,
          metrics: 'views,estimatedMinutesWatched',
          filters: `video==${videoId}`,
          dimensions: 'deviceType',
          sort: '-views',
        }),
        analyticsClient.reports.query({
          ids: `channel==${channelId}`,
          startDate,
          endDate,
          metrics: 'views,estimatedMinutesWatched',
          filters: `video==${videoId}`,
          dimensions: 'operatingSystem',
          sort: '-views',
        }),
      ]);

      const devices = (deviceResponse.data.rows || []).map((row) => ({
        deviceType: row[0] as string,
        views: parseInt(row[1] as string) || 0,
        estimatedMinutesWatched: parseFloat(row[2] as string) || 0,
      }));

      const operatingSystems = (osResponse.data.rows || []).map((row) => ({
        operatingSystem: row[0] as string,
        views: parseInt(row[1] as string) || 0,
        estimatedMinutesWatched: parseFloat(row[2] as string) || 0,
      }));

      return { devices, operatingSystems };
    } catch (error) {
      logger.warn({ error, videoId }, 'Failed to get device metrics');
      return undefined;
    }
  }

  /**
   * Get demographics metrics
   */
  private async getDemographicsMetrics(
    analyticsClient: youtubeAnalytics_v2.Youtubeanalytics,
    channelId: string,
    videoId: string,
    startDate: string,
    endDate: string
  ): Promise<{ ageGroups: AgeGroupDetail[]; genders: GenderDetail[] } | undefined> {
    try {
      const [ageResponse, genderResponse] = await Promise.all([
        analyticsClient.reports.query({
          ids: `channel==${channelId}`,
          startDate,
          endDate,
          metrics: 'viewerPercentage',
          filters: `video==${videoId}`,
          dimensions: 'ageGroup',
        }),
        analyticsClient.reports.query({
          ids: `channel==${channelId}`,
          startDate,
          endDate,
          metrics: 'viewerPercentage',
          filters: `video==${videoId}`,
          dimensions: 'gender',
        }),
      ]);

      const ageGroups = (ageResponse.data.rows || []).map((row) => ({
        ageGroup: row[0] as string,
        viewerPercentage: parseFloat(row[1] as string) || 0,
      }));

      const genders = (genderResponse.data.rows || []).map((row) => ({
        gender: row[0] as string,
        viewerPercentage: parseFloat(row[1] as string) || 0,
      }));

      return { ageGroups, genders };
    } catch (error) {
      logger.warn({ error, videoId }, 'Failed to get demographics metrics');
      return undefined;
    }
  }

  /**
   * Calculate reinforcement learning reward from metrics
   *
   * 보상 함수:
   * - 시청 유지율 (40%): Shorts는 완주율이 핵심
   * - 참여도 (30%): 좋아요/조회수 비율
   * - 성장 (20%): 구독자 획득
   * - 공유 (10%): 바이럴 지표
   */
  calculateReward(metrics: VideoMetrics): RewardMetrics {
    // 1. Retention Score (0-1): 시청 유지율
    const retentionScore = Math.min(metrics.averageViewPercentage / 100, 1);

    // 2. Engagement Score (0-1): 참여도 (좋아요/조회수)
    const likeRatio = metrics.views > 0 ? metrics.likes / metrics.views : 0;
    const engagementScore = Math.min(likeRatio * 20, 1); // 5% 좋아요율 = 1.0

    // 3. Growth Score (0-1): 구독자 성장
    const netSubscribers = metrics.subscribersGained - metrics.subscribersLost;
    const growthScore = Math.min(Math.max(netSubscribers / 10, 0), 1); // 10명 순증 = 1.0

    // 4. Viral Score (0-1): 공유
    const shareRatio = metrics.views > 0 ? metrics.shares / metrics.views : 0;
    const viralScore = Math.min(shareRatio * 50, 1); // 2% 공유율 = 1.0

    // 5. Playlist Score (optional)
    const playlistNet = (metrics.videosAddedToPlaylists || 0) - (metrics.videosRemovedFromPlaylists || 0);
    const playlistScore = Math.min(Math.max(playlistNet / 5, 0), 1); // 5개 순증 = 1.0

    // 6. Card Interaction Score (optional)
    const cardInteractionScore = metrics.cardClickRate
      ? Math.min(metrics.cardClickRate / 10, 1) // 10% CTR = 1.0
      : undefined;

    // Weighted total reward
    const totalReward =
      retentionScore * 0.4 +
      engagementScore * 0.3 +
      growthScore * 0.2 +
      viralScore * 0.1;

    return {
      videoId: metrics.videoId,
      retentionScore,
      engagementScore,
      growthScore,
      viralScore,
      playlistScore,
      cardInteractionScore,
      totalReward,
      rawMetrics: {
        views: metrics.views,
        likes: metrics.likes,
        shares: metrics.shares,
        subscribersNet: netSubscribers,
        averageViewPercentage: metrics.averageViewPercentage,
      },
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get analytics for multiple videos
   */
  async getChannelVideoAnalytics(
    channelName: string,
    videoIds: string[],
    startDate?: string,
    endDate?: string
  ): Promise<ChannelAnalytics> {
    const channel = this.channelManager.getChannel(channelName);
    if (!channel) {
      throw new Error(`Channel not found: ${channelName}`);
    }

    const videos: VideoMetrics[] = [];
    let totalViews = 0;
    let totalWatchTime = 0;
    let totalSubscribersGained = 0;
    let totalSubscribersLost = 0;
    let totalLikes = 0;
    let totalShares = 0;
    let totalComments = 0;

    for (const videoId of videoIds) {
      const result = await this.getVideoMetrics({
        channelName,
        videoId,
        startDate,
        endDate,
        includeVideoInfo: false,
        includeTrafficSources: false,
        includeGeography: false,
        includeDevices: false,
        includeDemographics: false,
      });

      if (result.success && result.data) {
        videos.push(result.data);
        totalViews += result.data.views;
        totalWatchTime += result.data.estimatedMinutesWatched;
        totalSubscribersGained += result.data.subscribersGained;
        totalSubscribersLost += result.data.subscribersLost;
        totalLikes += result.data.likes;
        totalShares += result.data.shares;
        totalComments += result.data.comments;
      }
    }

    return {
      channelId: channel.channelId!,
      channelName,
      totalViews,
      totalWatchTime,
      totalSubscribersGained,
      totalSubscribersLost,
      totalLikes,
      totalShares,
      totalComments,
      videos,
      startDate: startDate || this.getDateDaysAgo(30),
      endDate: endDate || new Date().toISOString().split('T')[0],
    };
  }

  /**
   * Get list of available channels
   */
  getAvailableChannels() {
    return this.channelManager.listChannels();
  }

  /**
   * Get list of videos from a channel
   * Uses YouTube Data API to fetch uploaded videos
   */
  async getChannelVideos(
    channelName: string,
    maxResults: number = 50
  ): Promise<{
    success: boolean;
    videos?: Array<{
      videoId: string;
      title: string;
      publishedAt: string;
      thumbnailUrl?: string;
      description?: string;
    }>;
    error?: string;
  }> {
    try {
      const channel = this.channelManager.getChannel(channelName);
      if (!channel) {
        return { success: false, error: `Channel not found: ${channelName}` };
      }

      const oauth2Client = this.createOAuth2Client(channelName);
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      // 1. Get the channel's uploads playlist ID
      const channelResponse = await youtube.channels.list({
        part: ['contentDetails'],
        id: [channel.channelId!],
      });

      const uploadsPlaylistId =
        channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

      if (!uploadsPlaylistId) {
        return { success: false, error: 'Could not find uploads playlist' };
      }

      // 2. Get videos from the uploads playlist
      const playlistResponse = await youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId: uploadsPlaylistId,
        maxResults: Math.min(maxResults, 50),
      });

      const videos = (playlistResponse.data.items || []).map((item) => ({
        videoId: item.contentDetails?.videoId || '',
        title: item.snippet?.title || '',
        publishedAt: item.snippet?.publishedAt || '',
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? undefined,
        description: item.snippet?.description?.substring(0, 200),
      }));

      logger.info(
        { channelName, videoCount: videos.length },
        'Fetched channel videos'
      );

      return { success: true, videos };
    } catch (error) {
      logger.error({ error, channelName }, 'Failed to get channel videos');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Helper: Get date N days ago in YYYY-MM-DD format
   */
  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }
}
