/**
 * YouTube Analytics Types
 * 강화학습용 메트릭 데이터 타입 정의
 * YouTube Analytics API + YouTube Data API v3 전체 메트릭 포함
 */

/**
 * YouTube Data API v3 - Video 기본 정보
 */
export interface VideoBasicInfo {
  videoId: string;
  channelId: string;
  channelTitle: string;

  // Snippet
  title: string;
  description: string;
  publishedAt: string;                 // ISO 8601 날짜
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;

  // Thumbnails
  thumbnails?: {
    default?: { url: string; width: number; height: number };
    medium?: { url: string; width: number; height: number };
    high?: { url: string; width: number; height: number };
    standard?: { url: string; width: number; height: number };
    maxres?: { url: string; width: number; height: number };
  };

  // Content Details
  duration?: string;                   // ISO 8601 duration (PT1M30S)
  durationSeconds?: number;            // 초 단위로 변환한 값
  dimension?: string;                  // 2d or 3d
  definition?: string;                 // hd or sd
  caption?: string;                    // true or false
  licensedContent?: boolean;

  // Status
  uploadStatus?: string;               // uploaded, processed, failed, rejected, deleted
  privacyStatus?: string;              // private, public, unlisted
  embeddable?: boolean;
  madeForKids?: boolean;
}

/**
 * YouTube Data API v3 - 기본 통계
 */
export interface VideoStatistics {
  viewCount: number;
  likeCount: number;
  dislikeCount: number;                // deprecated but might still be available
  favoriteCount: number;
  commentCount: number;
}

/**
 * YouTube Analytics API - 핵심 메트릭
 */
export interface AnalyticsCoreMetrics {
  // 조회 관련
  views: number;                       // 총 조회수
  estimatedMinutesWatched: number;     // 총 시청 시간 (분)

  // 시청 유지율
  averageViewDuration: number;         // 평균 시청 시간 (초)
  averageViewPercentage: number;       // 시청 유지율 (%)

  // 구독자
  subscribersGained: number;           // 획득 구독자
  subscribersLost: number;             // 이탈 구독자

  // 참여도
  likes: number;
  dislikes: number;
  shares: number;
  comments: number;
}

/**
 * YouTube Analytics API - 카드/엔드스크린 메트릭
 */
export interface AnnotationMetrics {
  // Cards (카드)
  cardImpressions?: number;            // 카드 노출 수
  cardClicks?: number;                 // 카드 클릭 수
  cardClickRate?: number;              // 카드 클릭률
  cardTeaserImpressions?: number;      // 카드 티저 노출 수
  cardTeaserClicks?: number;           // 카드 티저 클릭 수
  cardTeaserClickRate?: number;        // 카드 티저 클릭률

  // End Screens (엔드 스크린)
  annotationImpressions?: number;
  annotationClickableImpressions?: number;
  annotationClosableImpressions?: number;
  annotationClicks?: number;
  annotationCloses?: number;
  annotationClickThroughRate?: number;
  annotationCloseRate?: number;
}

/**
 * YouTube Analytics API - 플레이리스트 메트릭
 */
export interface PlaylistMetrics {
  videosAddedToPlaylists?: number;     // 재생목록 추가 수
  videosRemovedFromPlaylists?: number; // 재생목록 제거 수
}

/**
 * YouTube Analytics API - 트래픽 소스
 */
export interface TrafficSourceMetrics {
  // 트래픽 소스별 조회수 (별도 쿼리 필요)
  trafficSourceDetail?: TrafficSourceDetail[];
}

export interface TrafficSourceDetail {
  source: string;                      // YOUTUBE_SEARCH, EXT_URL, RELATED_VIDEO, etc.
  views: number;
  estimatedMinutesWatched: number;
}

/**
 * YouTube Analytics API - 지역 메트릭
 */
export interface GeographyMetrics {
  // 국가별 조회수 (별도 쿼리 필요)
  countryDetails?: CountryDetail[];
}

export interface CountryDetail {
  country: string;                     // ISO 3166-1 alpha-2 코드
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
}

/**
 * YouTube Analytics API - 디바이스/운영체제 메트릭
 */
export interface DeviceMetrics {
  deviceDetails?: DeviceDetail[];
  operatingSystemDetails?: OperatingSystemDetail[];
}

export interface DeviceDetail {
  deviceType: string;                  // MOBILE, DESKTOP, TABLET, TV, GAME_CONSOLE
  views: number;
  estimatedMinutesWatched: number;
}

export interface OperatingSystemDetail {
  operatingSystem: string;             // ANDROID, IOS, WINDOWS, MACOS, LINUX
  views: number;
  estimatedMinutesWatched: number;
}

/**
 * YouTube Analytics API - 인구 통계
 */
export interface DemographicsMetrics {
  ageGroupDetails?: AgeGroupDetail[];
  genderDetails?: GenderDetail[];
}

export interface AgeGroupDetail {
  ageGroup: string;                    // age13-17, age18-24, age25-34, age35-44, age45-54, age55-64, age65-
  viewerPercentage: number;
}

export interface GenderDetail {
  gender: string;                      // male, female
  viewerPercentage: number;
}

/**
 * Shorts 전용 메트릭
 */
export interface ShortsMetrics {
  // Shorts Shelf 관련
  shortsFeedViews?: number;
  shortsFeedImpressions?: number;
  shortsFeedClickThroughRate?: number;

  // Shorts 참여도
  shortsLikes?: number;
  shortsComments?: number;
  shortsShares?: number;
}

/**
 * 비디오 Analytics 전체 메트릭 (통합)
 */
export interface VideoMetrics {
  // === 식별자 ===
  videoId: string;
  channelId: string;

  // === YouTube Data API v3 기본 통계 ===
  views: number;
  likes: number;
  dislikes: number;
  comments: number;
  favoriteCount?: number;

  // === YouTube Analytics API 핵심 메트릭 ===
  estimatedMinutesWatched: number;     // 총 시청 시간 (분)
  averageViewDuration: number;         // 평균 시청 시간 (초)
  averageViewPercentage: number;       // 시청 유지율 (%)

  // 구독자
  subscribersGained: number;           // 획득 구독자
  subscribersLost: number;             // 이탈 구독자

  // 공유
  shares: number;

  // === 카드/엔드스크린 ===
  cardImpressions?: number;
  cardClicks?: number;
  cardClickRate?: number;
  cardTeaserImpressions?: number;
  cardTeaserClicks?: number;
  cardTeaserClickRate?: number;
  annotationImpressions?: number;
  annotationClicks?: number;
  annotationClickThroughRate?: number;
  annotationCloseRate?: number;

  // === 플레이리스트 ===
  videosAddedToPlaylists?: number;
  videosRemovedFromPlaylists?: number;

  // === 비디오 기본 정보 (선택적) ===
  videoInfo?: VideoBasicInfo;

  // === 트래픽 소스 (선택적) ===
  trafficSources?: TrafficSourceDetail[];

  // === 지역 통계 (선택적) ===
  topCountries?: CountryDetail[];

  // === 디바이스 통계 (선택적) ===
  deviceBreakdown?: DeviceDetail[];
  operatingSystemBreakdown?: OperatingSystemDetail[];

  // === 인구 통계 (선택적) ===
  ageGroups?: AgeGroupDetail[];
  genderBreakdown?: GenderDetail[];

  // === 메타데이터 ===
  queryDate: string;                   // 조회 날짜
  startDate: string;                   // 데이터 시작일
  endDate: string;                     // 데이터 종료일
}

/**
 * 강화학습 보상 계산용 메트릭
 */
export interface RewardMetrics {
  videoId: string;

  // 핵심 보상 신호
  retentionScore: number;              // 시청 유지율 기반 점수 (0-1)
  engagementScore: number;             // 참여도 점수 (좋아요/조회수 등)
  growthScore: number;                 // 성장 점수 (구독자 증가)
  viralScore: number;                  // 바이럴 점수 (공유 기반)

  // 추가 보상 신호
  playlistScore?: number;              // 재생목록 추가 점수
  cardInteractionScore?: number;       // 카드 상호작용 점수

  // 종합 보상
  totalReward: number;                 // 최종 보상 값

  // 세부 정보
  rawMetrics?: {
    views: number;
    likes: number;
    shares: number;
    subscribersNet: number;
    averageViewPercentage: number;
  };

  // 계산 시점
  calculatedAt: string;
}

/**
 * Analytics 조회 옵션
 */
export interface AnalyticsQueryOptions {
  channelName: string;
  videoId: string;
  startDate?: string;                  // YYYY-MM-DD (기본: 업로드일)
  endDate?: string;                    // YYYY-MM-DD (기본: 오늘)

  // 추가 데이터 조회 옵션
  includeVideoInfo?: boolean;          // 비디오 기본 정보 포함
  includeTrafficSources?: boolean;     // 트래픽 소스 포함
  includeGeography?: boolean;          // 지역 통계 포함
  includeDevices?: boolean;            // 디바이스 통계 포함
  includeDemographics?: boolean;       // 인구 통계 포함
  includeCards?: boolean;              // 카드/엔드스크린 포함
  includePlaylists?: boolean;          // 플레이리스트 포함
}

/**
 * Analytics API 응답
 */
export interface AnalyticsResponse {
  success: boolean;
  data?: VideoMetrics;
  reward?: RewardMetrics;
  error?: string;
}

/**
 * 채널 전체 Analytics
 */
export interface ChannelAnalytics {
  channelId: string;
  channelName: string;

  // 기간별 총계
  totalViews: number;
  totalWatchTime: number;              // 분 단위
  totalSubscribersGained: number;
  totalSubscribersLost: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;

  // 비디오별 상세
  videos: VideoMetrics[];

  // 기간
  startDate: string;
  endDate: string;
}

/**
 * 실시간 Analytics (Shorts용)
 */
export interface RealtimeAnalytics {
  videoId: string;
  channelId: string;

  // 실시간 데이터 (마지막 48시간)
  realtimeViews: number;
  concurrentViewers?: number;

  // 타임스탬프
  lastUpdated: string;
}
