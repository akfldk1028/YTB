/**
 * PoliticsProject 공통 타입 정의
 */

// ============================================
// 기본 타입
// ============================================

/** 시간 범위 (초 단위) */
export interface TimeRange {
  startSec: number;
  endSec: number;
}

/** 작업 상태 */
export type JobStatus =
  | 'pending'
  | 'downloading'
  | 'parsing'
  | 'analyzing'
  | 'processing'
  | 'completed'
  | 'failed';

// ============================================
// Downloader 타입
// ============================================

export interface DownloadOptions {
  outputDir: string;
  subtitleLang?: string[];  // ['ko', 'en']
  maxQuality?: number;      // 1080
}

export interface DownloadResult {
  videoPath: string;
  subtitlePath: string | null;
  title: string;
  duration: number;  // 초
}

// ============================================
// Parser 타입
// ============================================

export interface SubtitleEntry {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface ParsedSubtitle {
  entries: SubtitleEntry[];
  totalDuration: number;
  language: string;
}

// ============================================
// Analyzer 타입
// ============================================

export interface Highlight {
  startSec: number;
  endSec: number;
  title: string;
  reason: string;
  score?: number;  // 0-100
}

export interface AnalysisResult {
  highlights: Highlight[];
  totalAnalyzed: number;
  model: string;
}

export interface AnalyzerOptions {
  title: string;
  duration: number;
  maxHighlights?: number;  // default: 5
}

// ============================================
// Processor 타입
// ============================================

export interface CropOptions {
  inputPath: string;
  outputPath: string;
  timeRange: TimeRange;
  targetAspect: '9:16' | '16:9';
}

export interface BurnOptions {
  videoPath: string;
  subtitlePath: string;
  outputPath: string;
  style: SubtitleStyle;
}

export interface SubtitleStyle {
  titleColor: string;      // '#FFFF00'
  titleSize: number;       // 100
  bodyColor: string;       // '#FFFFFF'
  bodySize: number;        // 74
  position: 'top' | 'bottom';
  language?: 'ko' | 'en' | 'auto';  // 언어 (폰트 선택용)
  outline?: number;        // 테두리 두께 (default: 4)
  shadow?: number;         // 그림자 (default: 2)
}

// ============================================
// Workflow 타입
// ============================================

export interface WorkflowInput {
  youtubeUrl?: string;           // 단일 URL (하위 호환)
  youtubeUrls?: string[];        // 여러 URL (새 기능)
  options?: WorkflowOptions;
}

export interface WorkflowOptions {
  outputCount?: number;           // default: 3
  clipDuration?: { min: number; max: number };  // default: { min: 30, max: 60 }
  autoAnalyze?: boolean;          // default: false (Politics: 균등 분할)
  combineOutput?: boolean;        // default: true - 여러 클립을 하나로 합침
  overlayOptions?: OverlayConfig; // 텍스트 오버레이 옵션 (정적/동적)
  youtubeUpload?: YouTubeUploadOptions;    // YouTube 자동 업로드 옵션
}

/** 오버레이 설정 (정적 텍스트/동적 자막) */
export interface OverlayConfig {
  mode: 'static' | 'dynamic' | 'none';  // 오버레이 모드
  static?: {                            // 정적 텍스트 옵션
    text?: string;                      // 텍스트 (기본: 영상 제목)
    position?: 'top' | 'bottom' | 'center';
    fontSize?: number;                  // 기본: 36
    fontColor?: string;                 // 기본: white
    outlineColor?: string;              // 기본: black
    outlineWidth?: number;              // 기본: 2
    marginY?: number;                   // 기본: 50
    backgroundColor?: string;           // 배경색 (예: 'yellow@0.9', 'black@0.7')
    backgroundPadding?: number;         // 배경 패딩 (기본: 20)
  };
  dynamic?: {                           // 동적 자막 옵션 (나중에 사용)
    subtitlePath?: string;
    fontSize?: number;
  };
}

/** YouTube 업로드 옵션 */
export interface YouTubeUploadOptions {
  enabled: boolean;               // 업로드 활성화
  channelName: string;            // 채널 이름
  subChannel?: string;            // 서브채널 (Brand Account)
  privacyStatus?: 'public' | 'private' | 'unlisted';  // default: 'unlisted'
  title?: string;                 // 제목 (미지정 시 자동 생성)
  description?: string;           // 설명
  tags?: string[];                // 태그
  notifySubscribers?: boolean;    // 구독자 알림 (default: false)
}

export interface WorkflowResult {
  jobId: string;
  status: JobStatus;
  outputs: ShortOutput[];
  error?: string;
}

export interface ShortOutput {
  path: string;
  title: string;
  duration: number;
  highlight: Highlight;
  downloadUrl?: string;  // GCS signed URL
  gcsPath?: string;      // gs://bucket/path
  youtube?: {            // YouTube 업로드 결과
    videoId: string;
    url: string;
    channelName: string;
  };
}

// ============================================
// API 타입
// ============================================

export interface APIRequest {
  youtubeUrl?: string;           // 단일 URL (하위 호환)
  youtubeUrls?: string[];        // 여러 URL (새 기능)
  options?: WorkflowOptions;
  callbackUrl?: string;
}

export interface APIResponse {
  jobId: string;
  status: JobStatus;
  message: string;
  outputs?: ShortOutput[];
}
