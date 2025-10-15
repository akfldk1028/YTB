/**
 * YouTube Channel Interface
 * Represents a single YouTube channel
 */
export interface IYouTubeChannel {
  channelId: string;          // YouTube channel ID (UCxxxx...)
  channelTitle: string;       // Channel display name
  customUrl?: string;         // Channel custom URL (@xxx)
  description?: string;       // Channel description
  thumbnailUrl?: string;      // Channel thumbnail
  accountName: string;        // Which OAuth account owns/accesses this channel
  publishedAt?: string;       // Channel creation date
  addedAt: Date;              // When added to our system
}

/**
 * Channel Discovery Result
 * Returned when discovering channels for an authenticated account
 */
export interface IChannelDiscoveryResult {
  accountName: string;
  channels: IYouTubeChannel[];
  totalFound: number;
}
