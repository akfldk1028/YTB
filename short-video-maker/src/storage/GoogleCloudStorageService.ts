import { Storage, Bucket } from '@google-cloud/storage';
import fs from 'fs-extra';
import { logger } from '../logger';
import { Config } from '../config';

export interface UploadProgress {
  bytesWritten: number;
  totalBytes: number;
  percentComplete: number;
}

export interface UploadResult {
  success: boolean;
  gcsPath: string;
  publicUrl?: string;
  signedUrl?: string;
  error?: string;
}

export interface SignedUrlOptions {
  action: 'read' | 'write' | 'delete';
  expires: number; // milliseconds from now
  contentType?: string;
}

/**
 * Google Cloud Storage Service
 * Handles video file uploads, deletions, and signed URL generation
 */
export class GoogleCloudStorageService {
  private storage: Storage;
  private bucket: Bucket;
  private config: Config;

  constructor(config: Config) {
    this.config = config;

    // Validate configuration
    if (!config.gcsBucketName) {
      throw new Error('GCS_BUCKET_NAME is required in environment variables');
    }

    // Service account key file is optional
    // Cloud Run uses Application Default Credentials (ADC) automatically
    const useServiceAccountKey =
      config.gcsServiceAccountPath &&
      fs.existsSync(config.gcsServiceAccountPath);

    if (config.gcsServiceAccountPath && !useServiceAccountKey) {
      logger.warn(
        { path: config.gcsServiceAccountPath },
        'Service account file specified but not found, using default credentials'
      );
    }

    // Initialize Storage client
    // If service account key exists, use it; otherwise use ADC (Cloud Run default)
    this.storage = new Storage(
      useServiceAccountKey
        ? {
            keyFilename: config.gcsServiceAccountPath,
            projectId: config.googleCloudProjectId,
          }
        : {
            projectId: config.googleCloudProjectId,
          }
    );

    this.bucket = this.storage.bucket(config.gcsBucketName);

    logger.info(
      {
        bucket: config.gcsBucketName,
        region: config.gcsRegion,
        storageClass: config.gcsStorageClass,
        authMethod: useServiceAccountKey ? 'service-account-key' : 'default-credentials',
      },
      'Google Cloud Storage service initialized'
    );
  }

  /**
   * Upload video file to GCS with progress tracking
   */
  async uploadVideo(
    videoId: string,
    localFilePath: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    try {
      logger.info({ videoId, localFilePath }, 'Starting GCS upload');

      // Validate file exists
      if (!fs.existsSync(localFilePath)) {
        throw new Error(`Video file not found: ${localFilePath}`);
      }

      const fileStats = fs.statSync(localFilePath);
      const totalBytes = fileStats.size;
      const fileName = `videos/${videoId}.mp4`;

      logger.info(
        {
          videoId,
          fileName,
          fileSize: totalBytes,
          fileSizeMB: (totalBytes / 1024 / 1024).toFixed(2),
        },
        'Uploading video to GCS'
      );

      // Create file reference
      const file = this.bucket.file(fileName);

      // Upload with resumable upload and progress tracking
      await new Promise<void>((resolve, reject) => {
        const readStream = fs.createReadStream(localFilePath);
        const writeStream = file.createWriteStream({
          resumable: true,
          metadata: {
            contentType: 'video/mp4',
            metadata: {
              videoId,
              uploadedAt: new Date().toISOString(),
              originalPath: localFilePath,
            },
          },
          // Set storage class if different from bucket default
          ...(this.config.gcsStorageClass !== 'STANDARD' && {
            storageClass: this.config.gcsStorageClass,
          }),
        });

        let bytesWritten = 0;

        // Track progress
        readStream.on('data', (chunk) => {
          bytesWritten += chunk.length;
          if (onProgress) {
            onProgress({
              bytesWritten,
              totalBytes,
              percentComplete: Math.round((bytesWritten / totalBytes) * 100),
            });
          }
        });

        writeStream.on('error', (error) => {
          logger.error({ error, videoId }, 'GCS upload stream error');
          reject(error);
        });

        writeStream.on('finish', () => {
          logger.info({ videoId, fileName }, 'GCS upload stream finished');
          resolve();
        });

        readStream.pipe(writeStream);
      });

      // Generate signed URL for temporary access
      const signedUrl = await this.generateSignedUrl(fileName, {
        action: 'read',
        expires: this.config.gcsSignedUrlExpiryHours * 60 * 60 * 1000,
      });

      logger.info(
        {
          videoId,
          gcsPath: `gs://${this.config.gcsBucketName}/${fileName}`,
          fileSize: totalBytes,
        },
        'Video uploaded to GCS successfully'
      );

      return {
        success: true,
        gcsPath: `gs://${this.config.gcsBucketName}/${fileName}`,
        publicUrl: `https://storage.googleapis.com/${this.config.gcsBucketName}/${fileName}`,
        signedUrl,
      };
    } catch (error) {
      logger.error({ error, videoId, localFilePath }, 'Failed to upload video to GCS');
      return {
        success: false,
        gcsPath: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete video file from GCS
   */
  async deleteVideo(videoId: string): Promise<boolean> {
    try {
      const fileName = `videos/${videoId}.mp4`;
      const file = this.bucket.file(fileName);

      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        logger.warn({ videoId, fileName }, 'Video file does not exist in GCS');
        return false;
      }

      // Delete file
      await file.delete();

      logger.info({ videoId, fileName }, 'Video deleted from GCS successfully');
      return true;
    } catch (error) {
      logger.error({ error, videoId }, 'Failed to delete video from GCS');
      return false;
    }
  }

  /**
   * Delete local video file after successful GCS upload
   */
  async deleteLocalVideo(localFilePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(localFilePath)) {
        logger.warn({ localFilePath }, 'Local video file does not exist');
        return false;
      }

      await fs.remove(localFilePath);
      logger.info({ localFilePath }, 'Local video file deleted successfully');
      return true;
    } catch (error) {
      logger.error({ error, localFilePath }, 'Failed to delete local video file');
      return false;
    }
  }

  /**
   * Generate signed URL for temporary access
   */
  async generateSignedUrl(
    fileName: string,
    options: SignedUrlOptions
  ): Promise<string> {
    try {
      const file = this.bucket.file(fileName);

      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: options.action,
        expires: Date.now() + options.expires,
        ...(options.contentType && { contentType: options.contentType }),
      });

      logger.debug(
        {
          fileName,
          action: options.action,
          expiresIn: `${options.expires / 1000 / 60 / 60}h`,
        },
        'Generated signed URL'
      );

      return url;
    } catch (error) {
      logger.error({ error, fileName }, 'Failed to generate signed URL');
      throw error;
    }
  }

  /**
   * Check if video exists in GCS
   */
  async videoExists(videoId: string): Promise<boolean> {
    try {
      const fileName = `videos/${videoId}.mp4`;
      const file = this.bucket.file(fileName);
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      logger.error({ error, videoId }, 'Failed to check if video exists');
      return false;
    }
  }

  /**
   * Test connection to GCS
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if bucket exists
      const [exists] = await this.bucket.exists();
      if (!exists) {
        return {
          success: false,
          error: `Bucket '${this.config.gcsBucketName}' does not exist`,
        };
      }

      // Check if we can read bucket metadata
      await this.bucket.getMetadata();

      logger.info({ bucket: this.config.gcsBucketName }, 'GCS connection test successful');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error }, 'GCS connection test failed');
      return { success: false, error: errorMessage };
    }
  }
}
