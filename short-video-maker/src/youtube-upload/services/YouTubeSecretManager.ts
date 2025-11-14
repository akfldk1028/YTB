import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { logger } from '../../logger';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { Config } from '../../config';

/**
 * YouTube Secret Manager Integration
 * Handles automatic backup of YouTube tokens to GCP Secret Manager
 */
export class YouTubeSecretManager {
  private secretClient: SecretManagerServiceClient | null = null;
  private config: Config;
  private projectId: string;
  private enabled: boolean;

  constructor(config: Config) {
    this.config = config;
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || '';

    // Only enable in Cloud Run (DOCKER environment)
    this.enabled = process.env.DOCKER === 'true' && !!this.projectId;

    if (this.enabled) {
      try {
        this.secretClient = new SecretManagerServiceClient();
        logger.info('YouTube Secret Manager integration enabled');
      } catch (error) {
        logger.warn({ error }, 'Failed to initialize Secret Manager client - token auto-backup disabled');
        this.enabled = false;
      }
    } else {
      logger.info('YouTube Secret Manager integration disabled (not in Cloud Run environment)');
    }
  }

  /**
   * Update YOUTUBE_DATA secret in Secret Manager with all YouTube token files
   * This ensures tokens persist across Cloud Run instance restarts
   */
  async updateYouTubeDataSecret(): Promise<void> {
    if (!this.enabled || !this.secretClient) {
      logger.debug('Secret Manager update skipped (not enabled)');
      return;
    }

    try {
      const dataDir = this.config.getDataDirPath();
      const tempDir = '/tmp';
      const tarFile = path.join(tempDir, 'youtube-data.tar.gz');
      const base64File = path.join(tempDir, 'youtube-data-base64.txt');

      // Step 1: Create tar.gz archive of all YouTube files
      const youtubFiles = fs.readdirSync(dataDir).filter(file =>
        file.startsWith('youtube-') && file.endsWith('.json')
      );

      if (youtubFiles.length === 0) {
        logger.warn('No YouTube files found to backup');
        return;
      }

      logger.debug({ files: youtubFiles }, 'Creating YouTube data archive');

      // Create tar.gz
      const fileList = youtubFiles.join(' ');
      execSync(`cd ${dataDir} && tar czf ${tarFile} ${fileList}`, {
        encoding: 'utf-8'
      });

      // Step 2: Base64 encode (Secret Manager requires UTF-8)
      execSync(`base64 ${tarFile} > ${base64File}`, {
        encoding: 'utf-8'
      });

      // Step 3: Read base64 content
      const base64Content = fs.readFileSync(base64File, 'utf-8');

      // Step 4: Update Secret Manager
      const secretName = `projects/${this.projectId}/secrets/YOUTUBE_DATA`;

      try {
        // Add new version to existing secret
        await this.secretClient.addSecretVersion({
          parent: secretName,
          payload: {
            data: Buffer.from(base64Content, 'utf-8'),
          },
        });

        logger.info({ project: this.projectId }, '✅ YouTube tokens backed up to Secret Manager');
      } catch (error: any) {
        if (error.code === 5) { // NOT_FOUND
          logger.warn('YOUTUBE_DATA secret does not exist - skipping backup');
        } else {
          throw error;
        }
      }

      // Clean up temporary files
      fs.unlinkSync(tarFile);
      fs.unlinkSync(base64File);

    } catch (error) {
      logger.error({ error }, 'Failed to update YouTube data secret');
      // Don't throw - token saving should succeed even if Secret Manager update fails
    }
  }

  /**
   * Check if Secret Manager integration is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
