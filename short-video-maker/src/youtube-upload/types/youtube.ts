/**
 * YouTube Upload Types
 * Type definitions for YouTube upload functionality with multi-channel support
 */

// Channel Management Types

/**
 * Represents a YouTube channel accessible via OAuth token
 * Multiple channels can share the same OAuth token (accountName)
 */
export interface YouTubeChannel {
  channelName: string; // Unique identifier (user-defined, e.g., "main_channel")
  channelId: string; // YouTube channel ID (UCxxxx...)
  channelTitle: string; // Channel display name
  email: string; // Associated Google account email
  thumbnailUrl?: string; // Channel thumbnail URL
  description?: string; // Channel description
  customUrl?: string; // Channel custom URL
  createdAt: Date; // When this channel was added to our system
  authenticated: boolean; // Whether this channel has valid tokens
  accountName?: string; // Which OAuth account this channel belongs to (optional for backward compatibility)
}

/**
 * Represents an OAuth-authenticated Google account
 * One account can manage multiple YouTube channels
 */
export interface YouTubeAccount {
  accountName: string; // Unique identifier (e.g., "main_account")
  email: string; // Google account email
  createdAt: Date; // When this account was added
  authenticated: boolean; // Whether this account has valid tokens
  channels: string[]; // Array of channelIds accessible by this account
}

export interface YouTubeChannelConfig {
  channels: { [channelName: string]: YouTubeChannel };
  accounts?: { [accountName: string]: YouTubeAccount };
}

export interface AddChannelRequest {
  channelName: string; // Unique name for this channel
  redirectUri?: string; // Optional custom redirect URI
}

export interface AddChannelResponse {
  authUrl: string;
  channelName: string;
  message: string;
}

// Video Upload Types

export interface YouTubeVideoMetadata {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus: 'public' | 'private' | 'unlisted';
  language?: string;
  defaultLanguage?: string;
}

export interface YouTubeUploadRequest {
  videoId: string; // Internal video ID from our system
  channelName: string; // Which channel to upload to
  metadata: YouTubeVideoMetadata;
  notifySubscribers?: boolean;
}

export interface YouTubeUploadResponse {
  success: boolean;
  youtubeVideoId?: string;
  url?: string;
  error?: string;
}

export interface YouTubeAuthConfig {
  clientSecretPath: string;
  redirectUri: string;
  scopes: string[];
}

export interface YouTubeTokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export interface YouTubeUploadStatus {
  videoId: string;
  channelName: string; // Which channel this was uploaded to
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress?: number;
  youtubeVideoId?: string;
  url?: string;
  error?: string;
  uploadedAt?: Date;
}

export interface YouTubeVideoCategory {
  id: string;
  title: string;
}

// Common YouTube Video Categories
export const YOUTUBE_CATEGORIES = {
  FILM_ANIMATION: '1',
  AUTOS_VEHICLES: '2',
  MUSIC: '10',
  PETS_ANIMALS: '15',
  SPORTS: '17',
  SHORT_MOVIES: '18',
  TRAVEL_EVENTS: '19',
  GAMING: '20',
  VIDEOBLOGGING: '21',
  PEOPLE_BLOGS: '22',
  COMEDY: '23',
  ENTERTAINMENT: '24',
  NEWS_POLITICS: '25',
  HOWTO_STYLE: '26',
  EDUCATION: '27',
  SCIENCE_TECHNOLOGY: '28',
  NONPROFITS_ACTIVISM: '29',
} as const;
