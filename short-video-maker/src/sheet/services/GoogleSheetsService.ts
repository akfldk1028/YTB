/**
 * Google Sheets Service
 * 영상 생성 메타데이터 저장 및 Analytics 업데이트
 */

import { google, sheets_v4 } from 'googleapis';
import { logger } from '../../logger';
import { Config } from '../../config';
import {
  VideoGenerationRecord,
  VideoAnalyticsRecord,
  VideoFullRecord,
  VideoFilterOptions,
  SHEET_HEADERS,
} from '../types';

export class GoogleSheetsService {
  private sheets: sheets_v4.Sheets | null = null;
  private spreadsheetId: string;
  private sheetName: string;
  private config: Config;
  private initialized: boolean = false;

  constructor(config: Config) {
    this.config = config;
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '';
    this.sheetName = process.env.GOOGLE_SHEETS_NAME || 'Videos';
  }

  /**
   * 서비스 초기화 (Application Default Credentials 사용)
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    if (!this.spreadsheetId) {
      logger.warn('GOOGLE_SHEETS_SPREADSHEET_ID not set, sheet logging disabled');
      return false;
    }

    try {
      // Cloud Run에서는 ADC 사용, 로컬에서는 서비스 계정 키 파일
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth });

      // 시트 존재 여부 확인 및 헤더 초기화
      await this.ensureSheetHeaders();

      this.initialized = true;
      logger.info({ spreadsheetId: this.spreadsheetId, sheetName: this.sheetName }, 'Google Sheets service initialized');
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Google Sheets service');
      return false;
    }
  }

  /**
   * 시트 헤더 확인 및 초기화
   */
  private async ensureSheetHeaders(): Promise<void> {
    if (!this.sheets) return;

    try {
      // 첫 번째 행 읽기
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:AE1`,
      });

      const headers = response.data.values?.[0];

      // 헤더가 없으면 초기화
      if (!headers || headers.length === 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [SHEET_HEADERS],
          },
        });
        logger.info('Sheet headers initialized');
      }
    } catch (error: unknown) {
      // 시트가 없으면 생성
      if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 400) {
        await this.createSheet();
      } else {
        throw error;
      }
    }
  }

  /**
   * 새 시트 생성
   */
  private async createSheet(): Promise<void> {
    if (!this.sheets) return;

    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: this.sheetName,
                },
              },
            },
          ],
        },
      });

      // 헤더 추가
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [SHEET_HEADERS],
        },
      });

      logger.info({ sheetName: this.sheetName }, 'New sheet created with headers');
    } catch (error) {
      logger.error({ error }, 'Failed to create sheet');
      throw error;
    }
  }

  /**
   * 영상 생성 기록 저장
   */
  async logVideoGeneration(record: VideoGenerationRecord): Promise<boolean> {
    if (!await this.initialize()) {
      logger.warn('Sheet service not initialized, skipping log');
      return false;
    }

    if (!this.sheets) return false;

    try {
      const row = this.recordToRow(record);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:AE`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [row],
        },
      });

      logger.info({ videoId: record.videoId, jobId: record.jobId }, 'Video generation logged to sheet');
      return true;
    } catch (error) {
      logger.error({ error, record }, 'Failed to log video generation');
      return false;
    }
  }

  /**
   * Analytics 데이터 업데이트
   */
  async updateVideoAnalytics(videoId: string, analytics: VideoAnalyticsRecord): Promise<boolean> {
    if (!await this.initialize()) {
      return false;
    }

    if (!this.sheets) return false;

    try {
      // 비디오 ID로 행 찾기
      const rowIndex = await this.findRowByVideoId(videoId);

      if (rowIndex === -1) {
        logger.warn({ videoId }, 'Video not found in sheet for analytics update');
        return false;
      }

      // Analytics 컬럼 업데이트 (Q열부터 AE열) - youtubeUrl이 P열에 추가됨
      const analyticsValues = [
        analytics.views,
        analytics.likes,
        analytics.comments,
        analytics.shares,
        analytics.averageViewDuration,
        analytics.averageViewPercentage,
        analytics.estimatedMinutesWatched,
        analytics.subscribersGained,
        analytics.subscribersLost,
        analytics.retentionScore,
        analytics.engagementScore,
        analytics.growthScore,
        analytics.viralScore,
        analytics.totalReward,
        analytics.lastUpdated,
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!Q${rowIndex}:AE${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [analyticsValues],
        },
      });

      logger.info({ videoId, totalReward: analytics.totalReward }, 'Video analytics updated in sheet');
      return true;
    } catch (error) {
      logger.error({ error, videoId }, 'Failed to update video analytics');
      return false;
    }
  }

  /**
   * 업로드 상태 업데이트
   */
  async updateUploadStatus(
    jobId: string,
    videoId: string,
    status: 'uploaded' | 'failed',
    uploadedAt?: string
  ): Promise<boolean> {
    if (!await this.initialize()) {
      return false;
    }

    if (!this.sheets) return false;

    try {
      // jobId로 행 찾기
      const rowIndex = await this.findRowByJobId(jobId);

      if (rowIndex === -1) {
        logger.warn({ jobId }, 'Job not found in sheet for status update');
        return false;
      }

      // videoId (A열), uploadStatus (M열), uploadedAt (N열) 업데이트
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            {
              range: `${this.sheetName}!A${rowIndex}`,
              values: [[videoId]],
            },
            {
              range: `${this.sheetName}!M${rowIndex}:N${rowIndex}`,
              values: [[status, uploadedAt || '']],
            },
          ],
        },
      });

      logger.info({ jobId, videoId, status }, 'Upload status updated in sheet');
      return true;
    } catch (error) {
      logger.error({ error, jobId }, 'Failed to update upload status');
      return false;
    }
  }

  /**
   * 비디오 목록 조회
   */
  async getVideos(filter?: VideoFilterOptions): Promise<VideoFullRecord[]> {
    if (!await this.initialize()) {
      return [];
    }

    if (!this.sheets) return [];

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A2:AE`,
      });

      const rows = response.data.values || [];
      let records = rows.map(row => this.rowToRecord(row));

      // 필터 적용
      if (filter) {
        if (filter.videoId) {
          records = records.filter(r => r.videoId === filter.videoId);
        }
        if (filter.channelName) {
          records = records.filter(r => r.channelName === filter.channelName);
        }
        if (filter.mode) {
          records = records.filter(r => r.mode === filter.mode);
        }
        if (filter.uploadStatus) {
          records = records.filter(r => r.uploadStatus === filter.uploadStatus);
        }
        if (filter.startDate) {
          records = records.filter(r => r.createdAt >= filter.startDate!);
        }
        if (filter.endDate) {
          records = records.filter(r => r.createdAt <= filter.endDate! + 'T23:59:59Z');
        }
      }

      return records;
    } catch (error) {
      logger.error({ error }, 'Failed to get videos from sheet');
      return [];
    }
  }

  /**
   * 단일 비디오 조회
   */
  async getVideoById(videoId: string): Promise<VideoFullRecord | null> {
    const videos = await this.getVideos({ videoId });
    return videos[0] || null;
  }

  /**
   * 특정 기간의 비디오 조회
   */
  async getVideosByDateRange(startDate: string, endDate: string, channelName?: string): Promise<VideoFullRecord[]> {
    return this.getVideos({
      startDate,
      endDate,
      channelName,
    });
  }

  /**
   * Analytics 업데이트가 필요한 비디오 조회 (analytics 데이터가 없거나 오래된 것)
   */
  async getVideosNeedingAnalyticsUpdate(maxAgeHours: number = 24): Promise<VideoFullRecord[]> {
    const videos = await this.getVideos({ uploadStatus: 'uploaded' });
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

    return videos.filter(v => {
      // Analytics가 없거나 오래된 경우
      return !v.analyticsLastUpdated || v.analyticsLastUpdated < cutoffTime;
    });
  }

  /**
   * VideoId로 행 인덱스 찾기
   */
  private async findRowByVideoId(videoId: string): Promise<number> {
    if (!this.sheets) return -1;

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A:A`,
    });

    const values = response.data.values || [];
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === videoId) {
        return i + 1; // 1-indexed
      }
    }
    return -1;
  }

  /**
   * JobId로 행 인덱스 찾기
   */
  private async findRowByJobId(jobId: string): Promise<number> {
    if (!this.sheets) return -1;

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!B:B`,
    });

    const values = response.data.values || [];
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === jobId) {
        return i + 1; // 1-indexed
      }
    }
    return -1;
  }

  /**
   * Record를 시트 행으로 변환
   */
  private recordToRow(record: VideoGenerationRecord): (string | number)[] {
    return [
      record.videoId || '',
      record.jobId,
      record.createdAt,
      record.channelName,
      record.title,
      record.description || '',
      JSON.stringify(record.tags || []),
      record.duration || 0,
      record.mode,
      record.sceneCount,
      record.voice || '',
      record.orientation || 'portrait',
      record.uploadStatus,
      record.uploadedAt || '',
      record.gcsUrl || '',
      record.youtubeUrl || (record.videoId ? `https://youtube.com/watch?v=${record.videoId}` : ''),
      // Analytics 필드 (빈 값)
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '',
    ];
  }

  /**
   * 시트 행을 Record로 변환
   */
  private rowToRecord(row: (string | number | undefined)[]): VideoFullRecord {
    const getString = (index: number): string => String(row[index] || '');
    const getNumber = (index: number): number => Number(row[index]) || 0;

    let tags: string[] = [];
    try {
      const tagsStr = getString(6);
      if (tagsStr) {
        tags = JSON.parse(tagsStr);
      }
    } catch {
      tags = [];
    }

    return {
      videoId: getString(0),
      jobId: getString(1),
      createdAt: getString(2),
      channelName: getString(3),
      title: getString(4),
      description: getString(5),
      tags,
      duration: getNumber(7),
      mode: getString(8) as VideoFullRecord['mode'],
      sceneCount: getNumber(9),
      voice: getString(10),
      orientation: getString(11) as 'portrait' | 'landscape',
      uploadStatus: getString(12) as 'pending' | 'uploaded' | 'failed',
      uploadedAt: getString(13) || undefined,
      gcsUrl: getString(14) || undefined,
      youtubeUrl: getString(15) || undefined,
      // Analytics (인덱스 +1 됨)
      views: getNumber(16) || undefined,
      likes: getNumber(17) || undefined,
      comments: getNumber(18) || undefined,
      shares: getNumber(19) || undefined,
      averageViewDuration: getNumber(20) || undefined,
      averageViewPercentage: getNumber(21) || undefined,
      estimatedMinutesWatched: getNumber(22) || undefined,
      subscribersGained: getNumber(23) || undefined,
      subscribersLost: getNumber(24) || undefined,
      retentionScore: getNumber(25) || undefined,
      engagementScore: getNumber(26) || undefined,
      growthScore: getNumber(27) || undefined,
      viralScore: getNumber(28) || undefined,
      totalReward: getNumber(29) || undefined,
      analyticsLastUpdated: getString(30) || undefined,
    };
  }

  /**
   * 서비스 상태 확인
   */
  isConfigured(): boolean {
    return !!this.spreadsheetId;
  }

  /**
   * Spreadsheet ID 반환
   */
  getSpreadsheetId(): string {
    return this.spreadsheetId;
  }
}
