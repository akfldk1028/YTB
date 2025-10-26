import fs from 'fs-extra';
import path from 'path';
import { logger } from '../logger';
import {
  VideoWorkflowState,
  YouTubeUploadState,
  StageStatus
} from './types';
import type {
  WorkflowStatus,
  WorkflowLogEntry,
  WorkflowStage,
  YouTubeUploadStatus
} from './types';

/**
 * WorkflowManager
 * Manages workflow status tracking and persistence
 */
export class WorkflowManager {
  private activeWorkflows: Map<string, WorkflowStatus> = new Map();
  private youtubeUploads: Map<string, YouTubeUploadStatus> = new Map();
  private workflowDir: string;
  private historyDir: string;

  constructor(dataDir: string) {
    this.workflowDir = path.join(dataDir, 'workflows');
    this.historyDir = path.join(this.workflowDir, 'history');

    fs.ensureDirSync(this.workflowDir);
    fs.ensureDirSync(this.historyDir);

    // Load active workflows from disk
    this.loadActiveWorkflows();
  }

  /**
   * Create a new workflow
   */
  createWorkflow(videoId: string, metadata?: any): WorkflowStatus {
    const now = new Date().toISOString();

    const workflow: WorkflowStatus = {
      videoId,
      currentState: VideoWorkflowState.QUEUED,
      progress: 0,
      startedAt: now,
      updatedAt: now,
      logs: [],
      stages: {},
      metadata
    };

    this.activeWorkflows.set(videoId, workflow);
    this.persistWorkflow(videoId);

    logger.info({ videoId }, '📋 Workflow created');

    return workflow;
  }

  /**
   * Update workflow state
   */
  updateWorkflowState(
    videoId: string,
    state: VideoWorkflowState,
    metadata?: {
      progress?: number;
      details?: string;
      error?: any;
    }
  ): void {
    const workflow = this.activeWorkflows.get(videoId);
    if (!workflow) {
      logger.warn({ videoId }, 'Workflow not found for state update');
      return;
    }

    const now = new Date().toISOString();
    const previousState = workflow.currentState;

    // Calculate duration in previous state
    const duration = new Date(now).getTime() - new Date(workflow.updatedAt).getTime();

    // Update stage status
    if (previousState !== state) {
      // Complete previous stage
      if (workflow.stages[previousState]) {
        workflow.stages[previousState]!.status = StageStatus.COMPLETED;
        workflow.stages[previousState]!.completedAt = now;
        workflow.stages[previousState]!.duration = duration;
      }

      // Start new stage
      workflow.stages[state] = {
        status: StageStatus.IN_PROGRESS,
        startedAt: now
      };
    }

    // Handle failed state
    if (state === VideoWorkflowState.FAILED && workflow.stages[previousState]) {
      workflow.stages[previousState]!.status = StageStatus.FAILED;
      workflow.stages[previousState]!.error = metadata?.error?.message || 'Unknown error';
    }

    // Create log entry
    const logEntry: WorkflowLogEntry = {
      videoId,
      timestamp: now,
      state,
      previousState,
      duration,
      metadata
    };

    workflow.logs.push(logEntry);
    workflow.currentState = state;
    workflow.updatedAt = now;

    // Update progress
    if (metadata?.progress !== undefined) {
      workflow.progress = metadata.progress;
    } else {
      workflow.progress = this.calculateProgress(state);
    }

    // Handle completion
    if (state === VideoWorkflowState.COMPLETED) {
      workflow.completedAt = now;
      workflow.progress = 100;

      // Complete final stage
      if (workflow.stages[state]) {
        workflow.stages[state]!.status = StageStatus.COMPLETED;
        workflow.stages[state]!.completedAt = now;
      }
    }

    this.persistWorkflow(videoId);

    logger.info(
      {
        videoId,
        state,
        previousState,
        progress: workflow.progress,
        duration
      },
      `🔄 Workflow state updated: ${previousState} → ${state}`
    );
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(videoId: string): WorkflowStatus | null {
    return this.activeWorkflows.get(videoId) || null;
  }

  /**
   * Get all active workflows
   */
  getAllActiveWorkflows(): WorkflowStatus[] {
    return Array.from(this.activeWorkflows.values());
  }

  /**
   * Get workflow history
   */
  getWorkflowHistory(filters?: {
    limit?: number;
    offset?: number;
    status?: 'completed' | 'failed';
  }): { workflows: WorkflowStatus[]; total: number } {
    const historyFiles = fs.readdirSync(this.historyDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    const workflows: WorkflowStatus[] = [];

    for (const file of historyFiles) {
      const workflow = fs.readJsonSync(path.join(this.historyDir, file));

      // Apply status filter
      if (filters?.status) {
        if (filters.status === 'completed' && workflow.currentState !== VideoWorkflowState.COMPLETED) {
          continue;
        }
        if (filters.status === 'failed' && workflow.currentState !== VideoWorkflowState.FAILED) {
          continue;
        }
      }

      workflows.push(workflow);
    }

    const total = workflows.length;
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;

    return {
      workflows: workflows.slice(offset, offset + limit),
      total
    };
  }

  /**
   * Complete workflow and move to history
   */
  completeWorkflow(videoId: string): void {
    const workflow = this.activeWorkflows.get(videoId);
    if (!workflow) return;

    // Move to history
    const historyPath = path.join(this.historyDir, `${videoId}.json`);
    fs.writeJsonSync(historyPath, workflow, { spaces: 2 });

    // Remove from active
    this.activeWorkflows.delete(videoId);

    // Remove active file
    const activePath = path.join(this.workflowDir, `${videoId}.json`);
    if (fs.existsSync(activePath)) {
      fs.removeSync(activePath);
    }

    logger.info({ videoId }, '✅ Workflow completed and archived');
  }

  /**
   * Create YouTube upload status
   */
  createYouTubeUpload(
    videoId: string,
    channelName: string
  ): YouTubeUploadStatus {
    const key = `${videoId}:${channelName}`;
    const now = new Date().toISOString();

    const upload: YouTubeUploadStatus = {
      videoId,
      channelName,
      state: YouTubeUploadState.PENDING,
      startedAt: now
    };

    this.youtubeUploads.set(key, upload);

    logger.info({ videoId, channelName }, '📤 YouTube upload tracking created');

    return upload;
  }

  /**
   * Update YouTube upload state
   */
  updateYouTubeUploadState(
    videoId: string,
    channelName: string,
    state: YouTubeUploadState,
    data?: {
      youtubeVideoId?: string;
      youtubeUrl?: string;
      error?: {
        message: string;
        code?: string;
        retryable: boolean;
      };
    }
  ): void {
    const key = `${videoId}:${channelName}`;
    const upload = this.youtubeUploads.get(key);

    if (!upload) {
      logger.warn({ videoId, channelName }, 'YouTube upload not found for state update');
      return;
    }

    upload.state = state;

    if (state === YouTubeUploadState.UPLOADED) {
      upload.completedAt = new Date().toISOString();
      upload.youtubeVideoId = data?.youtubeVideoId;
      upload.youtubeUrl = data?.youtubeUrl;
    }

    if (state === YouTubeUploadState.FAILED) {
      upload.completedAt = new Date().toISOString();
      upload.error = data?.error;
    }

    logger.info(
      { videoId, channelName, state, youtubeVideoId: data?.youtubeVideoId },
      `📤 YouTube upload state updated: ${state}`
    );
  }

  /**
   * Get YouTube upload status
   */
  getYouTubeUploadStatus(videoId: string, channelName: string): YouTubeUploadStatus | null {
    const key = `${videoId}:${channelName}`;
    return this.youtubeUploads.get(key) || null;
  }

  /**
   * Get all YouTube uploads for a video
   */
  getYouTubeUploadsForVideo(videoId: string): YouTubeUploadStatus[] {
    const uploads: YouTubeUploadStatus[] = [];

    for (const [key, upload] of this.youtubeUploads.entries()) {
      if (key.startsWith(`${videoId}:`)) {
        uploads.push(upload);
      }
    }

    return uploads;
  }

  /**
   * Calculate progress based on state
   */
  private calculateProgress(state: VideoWorkflowState): number {
    const progressMap: Record<VideoWorkflowState, number> = {
      [VideoWorkflowState.QUEUED]: 0,
      [VideoWorkflowState.GENERATING_TTS]: 15,
      [VideoWorkflowState.TRANSCRIBING]: 30,
      [VideoWorkflowState.SEARCHING_VIDEO]: 45,
      [VideoWorkflowState.GENERATING_VIDEO]: 60,
      [VideoWorkflowState.PROCESSING_VIDEO]: 80,
      [VideoWorkflowState.COMPLETED]: 100,
      [VideoWorkflowState.FAILED]: 0
    };

    return progressMap[state] || 0;
  }

  /**
   * Persist workflow to disk
   */
  private persistWorkflow(videoId: string): void {
    const workflow = this.activeWorkflows.get(videoId);
    if (!workflow) return;

    const filePath = path.join(this.workflowDir, `${videoId}.json`);
    fs.writeJsonSync(filePath, workflow, { spaces: 2 });
  }

  /**
   * Load active workflows from disk
   */
  private loadActiveWorkflows(): void {
    if (!fs.existsSync(this.workflowDir)) return;

    const files = fs.readdirSync(this.workflowDir)
      .filter(f => f.endsWith('.json') && f !== 'history');

    for (const file of files) {
      try {
        const workflow = fs.readJsonSync(path.join(this.workflowDir, file));
        this.activeWorkflows.set(workflow.videoId, workflow);
      } catch (error) {
        logger.error({ file, error }, 'Failed to load workflow from disk');
      }
    }

    logger.info({ count: this.activeWorkflows.size }, 'Loaded active workflows from disk');
  }
}
