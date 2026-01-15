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
   * Download video file from GCS to local filesystem
   */
  async downloadVideo(
    videoId: string,
    localFilePath: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const fileName = `videos/${videoId}.mp4`;
      const file = this.bucket.file(fileName);

      // Check if file exists in GCS
      const [exists] = await file.exists();
      if (!exists) {
        logger.warn({ videoId, fileName }, 'Video file does not exist in GCS');
        return {
          success: false,
          error: `Video file not found in GCS: ${fileName}`,
        };
      }

      // Ensure parent directory exists
      await fs.ensureDir(localFilePath.substring(0, localFilePath.lastIndexOf('/')));

      logger.info({ videoId, fileName, localFilePath }, 'Downloading video from GCS');

      // Download file
      await file.download({ destination: localFilePath });

      const fileStats = fs.statSync(localFilePath);
      logger.info(
        {
          videoId,
          localFilePath,
          fileSize: fileStats.size,
          fileSizeMB: (fileStats.size / 1024 / 1024).toFixed(2),
        },
        'Video downloaded from GCS successfully'
      );

      return { success: true };
    } catch (error) {
      logger.error({ error, videoId, localFilePath }, 'Failed to download video from GCS');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
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

  // ============================================================================
  // 🔥 Font Management - GCS에서 폰트 다운로드
  // ============================================================================

  /**
   * 폰트 파일 목록 (GCS fonts/ 폴더에 있어야 함)
   */
  private static readonly FONT_FILES = [
    'BlackHanSans-Regular.ttf',
    'GmarketSansTTFBold.ttf',
    'GmarketSansTTFLight.ttf',
    'GmarketSansTTFMedium.ttf',
  ];

  /**
   * GCS에서 모든 폰트 파일 다운로드
   * Cloud Run 시작 시 호출
   *
   * @param localFontDir - 로컬 폰트 저장 디렉토리 (기본: /app/font)
   * @returns 다운로드된 폰트 파일 경로 목록
   */
  async downloadFonts(localFontDir: string = '/app/font'): Promise<{
    success: boolean;
    downloadedFonts: string[];
    errors: string[];
  }> {
    const downloadedFonts: string[] = [];
    const errors: string[] = [];

    logger.info({ localFontDir }, '[GCS Font] Starting font download from GCS');

    // 로컬 폰트 디렉토리 생성
    try {
      await fs.ensureDir(localFontDir);
    } catch (error) {
      logger.error({ error, localFontDir }, '[GCS Font] Failed to create local font directory');
      return {
        success: false,
        downloadedFonts: [],
        errors: [`Failed to create directory: ${localFontDir}`],
      };
    }

    // 각 폰트 파일 다운로드
    for (const fontFile of GoogleCloudStorageService.FONT_FILES) {
      const gcsPath = `fonts/${fontFile}`;
      const localPath = `${localFontDir}/${fontFile}`;

      try {
        // 이미 존재하는지 확인
        if (fs.existsSync(localPath)) {
          const stats = fs.statSync(localPath);
          if (stats.size > 0) {
            logger.debug({ fontFile, localPath, size: stats.size }, '[GCS Font] Font already exists locally, skipping');
            downloadedFonts.push(localPath);
            continue;
          }
        }

        // GCS에서 파일 존재 확인
        const file = this.bucket.file(gcsPath);
        const [exists] = await file.exists();

        if (!exists) {
          logger.warn({ gcsPath }, '[GCS Font] Font file not found in GCS');
          errors.push(`Font not found in GCS: ${gcsPath}`);
          continue;
        }

        // 다운로드
        logger.info({ gcsPath, localPath }, '[GCS Font] Downloading font from GCS');
        await file.download({ destination: localPath });

        // 다운로드 확인 및 TTF 유효성 검증
        const stats = fs.statSync(localPath);

        // 🔥 TTF 파일 유효성 검증 (magic bytes 체크)
        const fontBuffer = fs.readFileSync(localPath);
        const magicBytes = fontBuffer.slice(0, 4);
        const isTTF = magicBytes[0] === 0x00 && magicBytes[1] === 0x01 && magicBytes[2] === 0x00 && magicBytes[3] === 0x00;
        const isOTF = magicBytes.toString('ascii') === 'OTTO';
        const isValidFont = isTTF || isOTF;

        logger.info({
          fontFile,
          localPath,
          sizeBytes: stats.size,
          sizeMB: (stats.size / 1024 / 1024).toFixed(2),
          magicHex: magicBytes.toString('hex'),
          isTTF,
          isOTF,
          isValidFont,
        }, '[GCS Font] ✅ Font downloaded and validated');

        if (!isValidFont) {
          logger.warn({
            fontFile,
            magicHex: magicBytes.toString('hex'),
          }, '[GCS Font] ⚠️ Downloaded file may not be a valid font');
        }

        downloadedFonts.push(localPath);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error, fontFile, gcsPath }, '[GCS Font] ❌ Failed to download font');
        errors.push(`Failed to download ${fontFile}: ${errorMsg}`);
      }
    }

    // 🔥 fontconfig 캐시 업데이트 (런타임에 다운로드된 폰트 등록)
    if (downloadedFonts.length > 0) {
      try {
        const { execSync } = require('child_process');
        logger.info({ localFontDir }, '[GCS Font] Running fc-cache to register new fonts with fontconfig');

        // fc-cache 실행 (시스템 폰트 캐시 업데이트)
        execSync(`fc-cache -fv ${localFontDir}`, { timeout: 30000 });

        // 폰트가 제대로 등록되었는지 확인
        const fcListOutput = execSync(`fc-list | grep -i gmarket || fc-list | grep -i blackhan || echo "No custom fonts found"`, { timeout: 10000 }).toString();
        logger.info({
          fcListOutput: fcListOutput.substring(0, 500),
        }, '[GCS Font] ✅ fontconfig cache updated');
      } catch (fcError) {
        const fcErrorMsg = fcError instanceof Error ? fcError.message : 'Unknown error';
        logger.warn({ error: fcErrorMsg }, '[GCS Font] ⚠️ fc-cache failed (non-critical)');
        errors.push(`fc-cache warning: ${fcErrorMsg}`);
      }
    }

    const success = downloadedFonts.length > 0;
    logger.info({
      success,
      downloadedCount: downloadedFonts.length,
      errorCount: errors.length,
      downloadedFonts,
      errors,
    }, '[GCS Font] Font download completed');

    return { success, downloadedFonts, errors };
  }

  /**
   * 로컬 폰트 파일을 GCS에 업로드
   * 초기 설정 시 사용
   *
   * @param localFontDir - 로컬 폰트 디렉토리 경로
   * @returns 업로드 결과
   */
  async uploadFonts(localFontDir: string): Promise<{
    success: boolean;
    uploadedFonts: string[];
    errors: string[];
  }> {
    const uploadedFonts: string[] = [];
    const errors: string[] = [];

    logger.info({ localFontDir }, '[GCS Font] Starting font upload to GCS');

    // 로컬 폰트 디렉토리 확인
    if (!fs.existsSync(localFontDir)) {
      return {
        success: false,
        uploadedFonts: [],
        errors: [`Local font directory not found: ${localFontDir}`],
      };
    }

    // 각 폰트 파일 업로드
    for (const fontFile of GoogleCloudStorageService.FONT_FILES) {
      const localPath = `${localFontDir}/${fontFile}`;
      const gcsPath = `fonts/${fontFile}`;

      try {
        // 로컬 파일 존재 확인
        if (!fs.existsSync(localPath)) {
          logger.warn({ localPath }, '[GCS Font] Local font file not found, skipping');
          continue;
        }

        const stats = fs.statSync(localPath);

        // GCS에 업로드
        const file = this.bucket.file(gcsPath);
        await file.save(fs.readFileSync(localPath), {
          contentType: 'font/ttf',
          metadata: {
            uploadedAt: new Date().toISOString(),
          },
        });

        logger.info({
          fontFile,
          gcsPath,
          sizeBytes: stats.size,
          sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        }, '[GCS Font] ✅ Font uploaded to GCS');

        uploadedFonts.push(gcsPath);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error, fontFile }, '[GCS Font] ❌ Failed to upload font');
        errors.push(`Failed to upload ${fontFile}: ${errorMsg}`);
      }
    }

    const success = uploadedFonts.length > 0;
    logger.info({
      success,
      uploadedCount: uploadedFonts.length,
      errorCount: errors.length,
    }, '[GCS Font] Font upload completed');

    return { success, uploadedFonts, errors };
  }

  /**
   * GCS에 폰트가 있는지 확인
   */
  async checkFontsExistInGCS(): Promise<{
    allExist: boolean;
    existingFonts: string[];
    missingFonts: string[];
  }> {
    const existingFonts: string[] = [];
    const missingFonts: string[] = [];

    for (const fontFile of GoogleCloudStorageService.FONT_FILES) {
      const gcsPath = `fonts/${fontFile}`;
      const file = this.bucket.file(gcsPath);
      const [exists] = await file.exists();

      if (exists) {
        existingFonts.push(fontFile);
      } else {
        missingFonts.push(fontFile);
      }
    }

    return {
      allExist: missingFonts.length === 0,
      existingFonts,
      missingFonts,
    };
  }
}
