import express from 'express';
import { YouTubeUploader } from '../services/YouTubeUploader';
import { Config } from '../../config';
import { createAuthRoutes } from './authRoutes';
import { createChannelRoutes } from './channelRoutes';
import { createUploadRoutes } from './uploadRoutes';
import { logger } from '../../logger';

/**
 * YouTube API Main Router
 * Integrates all YouTube-related routes in a modular structure
 *
 * Structure:
 * - /auth/*         - OAuth2 authentication routes
 * - /channels/*     - Channel management routes
 * - /upload/*       - Video upload routes
 */
export class YouTubeRoutes {
  public router: express.Router;
  private youtubeUploader: YouTubeUploader;
  private config: Config;

  constructor(config: Config, youtubeUploader: YouTubeUploader) {
    this.config = config;
    this.youtubeUploader = youtubeUploader;
    this.router = express.Router();

    this.router.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    // Mount modular sub-routes
    this.router.use('/auth', createAuthRoutes(this.youtubeUploader));
    this.router.use('/channels', createChannelRoutes(this.youtubeUploader));
    this.router.use('/upload', createUploadRoutes(this.youtubeUploader));

    logger.info('YouTube routes initialized with modular structure');
  }
}
