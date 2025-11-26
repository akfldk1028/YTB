/**
 * Google Sheets Video Metadata Types
 * 영상 생성 메타데이터 및 Analytics 저장용 타입 정의
 */

/**
 * 영상 생성 기본 정보 (생성 시 저장)
 */
export interface VideoGenerationRecord {
  // 식별자
  videoId: string;              // YouTube 비디오 ID (업로드 후)
  jobId: string;                // 내부 작업 ID

  // 생성 정보
  createdAt: string;            // 생성 시간 (ISO 8601)
  channelName: string;          // 채널 이름 (ATT, main_channel 등)

  // 영상 정보
  title: string;                // 영상 제목
  description?: string;         // 영상 설명
  tags?: string[];              // 태그
  duration?: number;            // 길이 (초)

  // 생성 설정
  mode: 'pexels' | 'veo3' | 'nano-banana' | 'consistent-shorts';
  sceneCount: number;           // 씬 개수
  voice?: string;               // TTS 음성
  orientation?: 'portrait' | 'landscape';

  // 업로드 상태
  uploadStatus: 'pending' | 'uploaded' | 'failed';
  uploadedAt?: string;          // 업로드 완료 시간

  // GCS 정보
  gcsUrl?: string;              // GCS 저장 경로
}

/**
 * Analytics 메트릭 (나중에 업데이트)
 */
export interface VideoAnalyticsRecord {
  videoId: string;

  // 기본 메트릭
  views: number;
  likes: number;
  comments: number;
  shares: number;

  // 시청 유지율
  averageViewDuration: number;
  averageViewPercentage: number;
  estimatedMinutesWatched: number;

  // 구독자
  subscribersGained: number;
  subscribersLost: number;

  // 강화학습 보상
  retentionScore: number;
  engagementScore: number;
  growthScore: number;
  viralScore: number;
  totalReward: number;

  // 업데이트 시간
  lastUpdated: string;
}

/**
 * 시트 전체 레코드 (생성 정보 + Analytics)
 */
export interface VideoFullRecord extends VideoGenerationRecord {
  // Analytics 필드 (업데이트 시 추가)
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  averageViewDuration?: number;
  averageViewPercentage?: number;
  estimatedMinutesWatched?: number;
  subscribersGained?: number;
  subscribersLost?: number;
  retentionScore?: number;
  engagementScore?: number;
  growthScore?: number;
  viralScore?: number;
  totalReward?: number;
  analyticsLastUpdated?: string;
}

/**
 * 시트 행 데이터 (실제 저장 형식)
 */
export interface SheetRowData {
  // A열부터 순서대로
  videoId: string;
  jobId: string;
  createdAt: string;
  channelName: string;
  title: string;
  description: string;
  tags: string;                 // JSON 문자열
  duration: number;
  mode: string;
  sceneCount: number;
  voice: string;
  orientation: string;
  uploadStatus: string;
  uploadedAt: string;
  gcsUrl: string;
  // Analytics 필드
  views: number;
  likes: number;
  comments: number;
  shares: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  estimatedMinutesWatched: number;
  subscribersGained: number;
  subscribersLost: number;
  retentionScore: number;
  engagementScore: number;
  growthScore: number;
  viralScore: number;
  totalReward: number;
  analyticsLastUpdated: string;
}

/**
 * 시트 헤더 컬럼
 */
export const SHEET_HEADERS = [
  'videoId',
  'jobId',
  'createdAt',
  'channelName',
  'title',
  'description',
  'tags',
  'duration',
  'mode',
  'sceneCount',
  'voice',
  'orientation',
  'uploadStatus',
  'uploadedAt',
  'gcsUrl',
  'views',
  'likes',
  'comments',
  'shares',
  'averageViewDuration',
  'averageViewPercentage',
  'estimatedMinutesWatched',
  'subscribersGained',
  'subscribersLost',
  'retentionScore',
  'engagementScore',
  'growthScore',
  'viralScore',
  'totalReward',
  'analyticsLastUpdated',
];

/**
 * 필터 옵션
 */
export interface VideoFilterOptions {
  videoId?: string;
  channelName?: string;
  mode?: string;
  uploadStatus?: string;
  startDate?: string;           // YYYY-MM-DD
  endDate?: string;             // YYYY-MM-DD
}

/**
 * 시트 서비스 설정
 */
export interface SheetServiceConfig {
  spreadsheetId: string;
  sheetName?: string;           // 기본: 'Videos'
}
