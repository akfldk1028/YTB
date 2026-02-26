/**
 * YTB-Trend-projects Types
 * YouTube URL → 스타일 분석 → 새 교육 영상 생성
 *
 * n8n Node Pattern: 각 노드별 명확한 Input/Output 인터페이스
 */

// ==================== Node 1: YouTube 다운로드 ====================

export interface YouTubeDownloadRequest {
  url: string;
  /** 최대 해상도 (기본: 720) */
  maxQuality?: number;
}

export interface YouTubeVideoMetadata {
  title: string;
  channel: string;
  duration: number;
  description: string;
}

export interface YouTubeDownloadResult {
  success: boolean;
  videoPath?: string;
  metadata?: YouTubeVideoMetadata;
  error?: string;
}

// ==================== Node 2: Gemini 영상 분석 ====================

export interface GeminiVideoAnalysisRequest {
  videoPath: string;
  contentType?: string;
}

export interface VisualStyle {
  colorPalette: string[];
  composition: string;
  backgroundType: string;
  characterPresence: string;
  transitionStyle: string;
}

export interface MotionProfile {
  cameraMovement: string;
  pace: string;
  cutFrequency: string;
}

export interface EducationalPattern {
  hookStyle: string;
  explanationApproach: string;
  conclusionStyle: string;
}

export interface AudioProfile {
  narratorGender?: 'male' | 'female';
  narratorTone: string;
  backgroundMusicStyle?: string;
}

export interface TechnicalSpecs {
  averageShotDuration: number;
  aspectRatio: string;
  typicalSceneDuration: number;
}

export interface StyleDNA {
  visualStyle: VisualStyle;
  motionProfile: MotionProfile;
  educationalPattern: EducationalPattern;
  audioProfile: AudioProfile;
  technicalSpecs: TechnicalSpecs;
}

export interface GeminiVideoAnalysisResult {
  success: boolean;
  styleDNA?: StyleDNA;
  rawAnalysis?: string;
  error?: string;
}

// ==================== Node 3: 스타일 프로필 빌드 ====================

export interface ImageGenerationConfig {
  narrativePrefix: string;
  educationalPrefix: string;
  globalSuffix: string;
}

export interface VideoGenerationConfig {
  motionStyle: string;
  paceInstruction: string;
}

export interface TTSConfig {
  voice: string;
  gender: 'male' | 'female';
  stylePrompt: string;
}

export interface SceneTimingRules {
  hookDuration: number;
  explanationDuration: number;
  conclusionDuration: number;
}

export interface TrendStyleProfile {
  id: string;
  displayName: string;
  sourceUrl: string;
  sourceChannel: string;
  createdAt: string;
  imageGeneration: ImageGenerationConfig;
  videoGeneration: VideoGenerationConfig;
  ttsConfig: TTSConfig;
  sceneTimingRules: SceneTimingRules;
  styleDNA: StyleDNA;
}

// ==================== Node 4: Video Gen Provider ====================

export enum VideoGenProvider {
  GROK_IMG2V = 'grok-img2v',
  VEO3_T2V = 'veo3-t2v',
  KENBURNS = 'kenburns',
}

export interface VideoGenRequest {
  prompt: string;
  duration: number;
  aspectRatio?: string;
  styleHint?: string;
  /** Grok용: 입력 이미지 경로 */
  imagePath?: string;
}

export interface VideoGenResult {
  success: boolean;
  videoPath?: string;
  provider: VideoGenProvider;
  costEstimate?: number;
  error?: string;
}

// ==================== Node 5: 오케스트레이터 ====================

export interface VideoCloneContent {
  title: string;
  hook: string;
  mainPoints: string[];
  conclusion: string;
}

export interface VideoCloneRequest {
  referenceUrl: string;
  content: VideoCloneContent;
  /** 비디오 생성 프로바이더 (기본: kenburns) */
  provider?: VideoGenProvider;
  /** 캐시된 프로필 재사용 */
  forceStyleProfile?: string;
}

export interface VideoCloneCosts {
  analysis: number;
  videoGeneration: number;
  tts: number;
  total: number;
}

export interface VideoCloneTiming {
  downloadMs: number;
  analysisMs: number;
  videoGenMs: number;
  totalMs: number;
}

export interface VideoCloneResult {
  success: boolean;
  outputVideoPath?: string;
  profileUsed?: string;
  costs?: VideoCloneCosts;
  timing?: VideoCloneTiming;
  error?: string;
}

// ==================== 내부 헬퍼 타입 ====================

export interface ScenePlan {
  index: number;
  type: 'hook' | 'explanation' | 'conclusion';
  narration: string;
  visualPrompt: string;
  duration: number;
}

// ==================== v2.0: 트렌드 발견 + 자동 파이프라인 ====================

export enum TrendPlatform {
  YOUTUBE = 'youtube',
  TIKTOK = 'tiktok',
  REDDIT = 'reddit',
  BILIBILI = 'bilibili',
  GOOGLE_TRENDS = 'google_trends',
}

/** 트렌드 키워드 — 단일 플랫폼 결과 */
export interface TrendKeyword {
  keyword: string;
  platform: TrendPlatform;
  score: number;              // 0-100 정규화 점수
  category?: string;
  relatedKeywords?: string[];
  metadata?: {
    views?: number;
    posts?: number;
    growth?: string;          // "rising", "breakout", "stable"
  };
}

/** 크로스 플랫폼 집계 결과 */
export interface AggregatedTrend {
  keyword: string;
  normalizedKeyword: string;
  totalScore: number;
  platformCount: number;
  sources: TrendKeyword[];
  estimatedNiche: string;
  referenceVideos?: DiscoveredVideo[];
}

/** 발견된 레퍼런스 영상 */
export interface DiscoveredVideo {
  url: string;
  title: string;
  channel: string;
  views: number;
  likes?: number;
  publishedAt: string;
  duration: number;
  platform: TrendPlatform;
  engagementRate?: number;
  thumbnailUrl?: string;
}

/** ContentDNA — 콘텐츠 구조 추출 */
export interface ContentDNA {
  topic: string;
  niche: string;
  language: string;

  hook: {
    type: string;
    content: string;
    technique: string;
  };

  mainPoints: {
    point: string;
    explanation: string;
    visualApproach: string;
  }[];

  conclusion: {
    type: string;
    content: string;
  };

  fullTranscript: string;
  viralElements: string[];
  targetAudience: string;
  seoKeywords: string[];
  estimatedDuration: number;
}

/** 트렌드 발견 요청 */
export interface TrendDiscoveryRequest {
  platforms?: TrendPlatform[];
  region?: string;
  category?: string;
  maxResults?: number;
}

/** 트렌드 발견 결과 */
export interface TrendDiscoveryResult {
  success: boolean;
  trends: AggregatedTrend[];
  platformResults: Partial<Record<TrendPlatform, TrendKeyword[]>>;
  discoveredAt: string;
  error?: string;
}

/** 전자동 클론 요청 */
export interface AutoCloneRequest {
  trendKeyword?: string;
  autoSelect?: boolean;
  provider?: VideoGenProvider;
  targetLanguage?: string;
  maxReferenceVideos?: number;
  channelName?: string;
}

/** 전자동 클론 결과 */
export interface AutoCloneResult {
  success: boolean;
  trendUsed?: AggregatedTrend;
  referenceVideoAnalyzed?: DiscoveredVideo;
  contentDNA?: ContentDNA;
  styleDNA?: StyleDNA;
  rewrittenContent?: VideoCloneContent;
  outputVideoPath?: string;
  uploadResult?: { youtubeVideoId: string; url: string };
  costs?: VideoCloneCosts & { trendDiscovery: number; contentRewrite: number };
  timing?: VideoCloneTiming & { discoveryMs: number; searchMs: number; rewriteMs: number };
  error?: string;
}

/** Scraper Input (n8n 노드 공통 입력) */
export interface ScraperInput {
  region?: string;
  category?: string;
  maxResults?: number;
}

/** ContentDNA 추출 요청 */
export interface ContentExtractionRequest {
  videoPath: string;
}

/** ContentDNA 추출 + StyleDNA 분석 결합 결과 */
export interface FullVideoAnalysisResult {
  success: boolean;
  styleDNA?: StyleDNA;
  contentDNA?: ContentDNA;
  rawAnalysis?: string;
  error?: string;
}
