import fs from 'fs-extra';
import path from 'path';
import { logger } from '../logger';
import { Config } from '../config';

/**
 * Local File Cleanup Service
 * Automatically cleans up old video files based on age
 */
export class LocalFileCleanupService {
  private config: Config;
  private cleanupIntervalMs: number;
  private intervalId?: NodeJS.Timeout;

  constructor(config: Config, cleanupIntervalMs: number = 60 * 60 * 1000) { // Default: 1 hour
    this.config = config;
    this.cleanupIntervalMs = cleanupIntervalMs;
  }

  /**
   * Start automatic cleanup worker
   */
  start(): void {
    if (this.config.gcsAutoDeleteLocalAfterDays === 0) {
      logger.info('Local file auto-cleanup disabled (GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=0)');
      return;
    }

    logger.info(
      {
        intervalMs: this.cleanupIntervalMs,
        deleteAfterDays: this.config.gcsAutoDeleteLocalAfterDays,
      },
      'Starting local file cleanup worker'
    );

    // Run immediately on start
    this.cleanupOldFiles();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.cleanupOldFiles();
    }, this.cleanupIntervalMs);
  }

  /**
   * Stop cleanup worker
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info('Local file cleanup worker stopped');
    }
  }

  /**
   * Clean up files older than configured days
   */
  async cleanupOldFiles(): Promise<void> {
    try {
      const videosDirPath = this.config.videosDirPath;
      const deleteAfterDays = this.config.gcsAutoDeleteLocalAfterDays;

      if (deleteAfterDays === 0) {
        return; // Cleanup disabled
      }

      if (!fs.existsSync(videosDirPath)) {
        logger.warn({ videosDirPath }, 'Videos directory does not exist');
        return;
      }

      const files = fs.readdirSync(videosDirPath);
      const now = Date.now();
      const maxAgeMs = deleteAfterDays * 24 * 60 * 60 * 1000;

      let deletedCount = 0;
      let skippedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.mp4')) {
          continue; // Skip non-video files
        }

        const filePath = path.join(videosDirPath, file);
        const stats = fs.statSync(filePath);
        const fileAgeMs = now - stats.mtimeMs;

        if (fileAgeMs > maxAgeMs) {
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
            logger.info(
              {
                file,
                ageDays: Math.round(fileAgeMs / (24 * 60 * 60 * 1000)),
                deleteAfterDays,
              },
              'Deleted old local video file'
            );
          } catch (error) {
            logger.error({ error, file }, 'Failed to delete old video file');
          }
        } else {
          skippedCount++;
        }
      }

      if (deletedCount > 0 || skippedCount > 0) {
        logger.info(
          {
            deletedCount,
            skippedCount,
            deleteAfterDays,
          },
          'Local file cleanup completed'
        );
      }
    } catch (error) {
      logger.error({ error }, 'Error during local file cleanup');
    }
  }

  /**
   * Get cleanup status
   */
  getStatus(): {
    enabled: boolean;
    deleteAfterDays: number;
    intervalMs: number;
    running: boolean;
  } {
    return {
      enabled: this.config.gcsAutoDeleteLocalAfterDays > 0,
      deleteAfterDays: this.config.gcsAutoDeleteLocalAfterDays,
      intervalMs: this.cleanupIntervalMs,
      running: this.intervalId !== undefined,
    };
  }
}
