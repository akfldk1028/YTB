import { Router, Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { WorkflowManager } from '../WorkflowManager';
import { logger } from '../../logger';

export class WorkflowRoutes {
  public router: Router;

  constructor(private workflowManager: WorkflowManager) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Get workflow status by videoId
    this.router.get('/status/:videoId', this.getWorkflowStatus.bind(this));

    // Get all active workflows
    this.router.get('/active', this.getAllActiveWorkflows.bind(this));

    // Get workflow history
    this.router.get('/history', this.getWorkflowHistory.bind(this));

    // Get YouTube upload status
    this.router.get('/youtube/:videoId/:channelName', this.getYouTubeUploadStatus.bind(this));

    // Get all YouTube uploads for a video
    this.router.get('/youtube/:videoId', this.getYouTubeUploadsForVideo.bind(this));
  }

  /**
   * GET /api/workflow/status/:videoId
   * Get workflow status by videoId
   */
  private async getWorkflowStatus(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void> {
    try {
      const { videoId } = req.params;

      logger.info({ videoId }, 'Workflow status request received');

      const workflow = this.workflowManager.getWorkflowStatus(videoId);

      if (!workflow) {
        res.status(404).json({
          success: false,
          error: 'Workflow not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: workflow
      });
    } catch (error: any) {
      logger.error({ error }, 'Error getting workflow status');

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * GET /api/workflow/active
   * Get all active workflows
   */
  private async getAllActiveWorkflows(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void> {
    try {
      logger.info('Active workflows request received');

      const workflows = this.workflowManager.getAllActiveWorkflows();

      res.status(200).json({
        success: true,
        data: {
          workflows,
          count: workflows.length
        }
      });
    } catch (error: any) {
      logger.error({ error }, 'Error getting active workflows');

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * GET /api/workflow/history?limit=50&offset=0&status=completed
   * Get workflow history
   */
  private async getWorkflowHistory(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const status = req.query.status as 'completed' | 'failed' | undefined;

      logger.info({ limit, offset, status }, 'Workflow history request received');

      const result = this.workflowManager.getWorkflowHistory({
        limit,
        offset,
        status
      });

      res.status(200).json({
        success: true,
        data: {
          workflows: result.workflows,
          total: result.total,
          limit,
          offset
        }
      });
    } catch (error: any) {
      logger.error({ error }, 'Error getting workflow history');

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * GET /api/workflow/youtube/:videoId/:channelName
   * Get YouTube upload status
   */
  private async getYouTubeUploadStatus(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void> {
    try {
      const { videoId, channelName } = req.params;

      logger.info({ videoId, channelName }, 'YouTube upload status request received');

      const upload = this.workflowManager.getYouTubeUploadStatus(videoId, channelName);

      if (!upload) {
        res.status(404).json({
          success: false,
          error: 'YouTube upload not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: upload
      });
    } catch (error: any) {
      logger.error({ error }, 'Error getting YouTube upload status');

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * GET /api/workflow/youtube/:videoId
   * Get all YouTube uploads for a video
   */
  private async getYouTubeUploadsForVideo(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void> {
    try {
      const { videoId } = req.params;

      logger.info({ videoId }, 'YouTube uploads request received');

      const uploads = this.workflowManager.getYouTubeUploadsForVideo(videoId);

      res.status(200).json({
        success: true,
        data: {
          uploads,
          count: uploads.length
        }
      });
    } catch (error: any) {
      logger.error({ error }, 'Error getting YouTube uploads');

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
}
