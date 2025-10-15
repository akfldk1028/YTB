/**
 * OAuth Account Interface
 * Represents a Google account with OAuth credentials
 * One account can access multiple YouTube channels
 */
export interface IYouTubeAccount {
  accountName: string;        // Unique identifier (e.g., "main_account")
  email: string;              // Google account email  
  accessibleChannels: string[]; // Array of YouTube channel IDs this account can access
  createdAt: Date;
  lastAuthenticated: Date;
}

/**
 * OAuth Token Storage Interface
 */
export interface IYouTubeTokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
  refresh_token_expires_in?: number;
}
