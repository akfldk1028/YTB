/**
 * Workflow monitoring types and interfaces
 */

export enum VideoWorkflowState {
  QUEUED = 'queued',
  GENERATING_TTS = 'generating_tts',
  TRANSCRIBING = 'transcribing',
  SEARCHING_VIDEO = 'searching_video',
  GENERATING_VIDEO = 'generating_video',
  PROCESSING_VIDEO = 'processing_video',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum YouTubeUploadState {
  PENDING = 'pending',
  AUTHENTICATING = 'authenticating',
  UPLOADING = 'uploading',
  UPLOADED = 'uploaded',
  FAILED = 'failed'
}

export enum StageStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface WorkflowError {
  message: string;
  stack?: string;
  code?: string;
}

export interface WorkflowLogEntry {
  videoId: string;
  timestamp: string;
  state: VideoWorkflowState;
  previousState?: VideoWorkflowState;
  duration?: number;
  metadata?: {
    progress?: number;
    details?: string;
    error?: WorkflowError;
  };
}

export interface WorkflowStage {
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  error?: string;
}

export interface WorkflowStatus {
  videoId: string;
  currentState: VideoWorkflowState;
  progress: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  estimatedTimeRemaining?: number;
  logs: WorkflowLogEntry[];
  stages: Partial<Record<VideoWorkflowState, WorkflowStage>>;
  metadata?: {
    videoSource?: string;
    ttsProvider?: string;
    orientation?: string;
    [key: string]: any;
  };
}

export interface YouTubeUploadStatus {
  videoId: string;
  channelName: string;
  state: YouTubeUploadState;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  startedAt: string;
  completedAt?: string;
  error?: {
    message: string;
    code?: string;
    retryable: boolean;
  };
}

export type WebhookEventType =
  | 'video.completed'
  | 'video.failed'
  | 'youtube.uploaded'
  | 'youtube.failed';

export interface WebhookEvent {
  eventId: string;
  eventType: WebhookEventType;
  timestamp: string;
  data: {
    videoId: string;
    channelName?: string;
    youtubeVideoId?: string;
    youtubeUrl?: string;
    videoPath?: string;
    error?: {
      message: string;
      code?: string;
    };
    metadata?: any;
  };
}

export interface WebhookRegistration {
  webhookId: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  createdAt: string;
  active: boolean;
}

export interface WebhookDeliveryAttempt {
  attemptNumber: number;
  timestamp: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  nextRetryAt?: string;
}

export interface FailedWebhookDelivery {
  eventId: string;
  webhookId: string;
  event: WebhookEvent;
  attempts: WebhookDeliveryAttempt[];
  createdAt: string;
  lastAttemptAt: string;
  nextRetryAt?: string;
  maxAttemptsReached: boolean;
}
