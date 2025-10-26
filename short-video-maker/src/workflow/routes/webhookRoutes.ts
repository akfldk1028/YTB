import { Router, Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { WebhookManager } from '../WebhookManager';
import { logger } from '../../logger';
import type { WebhookEventType } from '../types';

export class WebhookRoutes {
  public router: Router;

  constructor(private webhookManager: WebhookManager) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Register webhook
    this.router.post('/register', this.registerWebhook.bind(this));

    // List webhooks
    this.router.get('/', this.listWebhooks.bind(this));

    // Get webhook by ID
    this.router.get('/:webhookId', this.getWebhook.bind(this));

    // Update webhook
    this.router.patch('/:webhookId', this.updateWebhook.bind(this));

    // Delete webhook
    this.router.delete('/:webhookId', this.deleteWebhook.bind(this));

    // Get failed deliveries
    this.router.get('/failed/list', this.getFailedDeliveries.bind(this));

    // Retry failed deliveries
    this.router.post('/failed/retry', this.retryFailedDeliveries.bind(this));
  }

  /**
   * POST /api/webhooks/register
   * Register a new webhook
   */
  private async registerWebhook(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void> {
    try {
      const { url, events, secret } = req.body;

      // Validation
      if (!url || !events || !secret) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: url, events, secret'
        });
        return;
      }

      if (!Array.isArray(events) || events.length === 0) {
        res.status(400).json({
          success: false,
          error: 'events must be a non-empty array'
        });
        return;
      }

      // Validate URL
      try {
        new URL(url);
      } catch {
        res.status(400).json({
          success: false,
          error: 'Invalid URL format'
        });
        return;
      }

      // Validate event types
      const validEvents: WebhookEventType[] = [
        'video.completed',
        'video.failed',
        'youtube.uploaded',
        'youtube.failed'
      ];

      for (const event of events) {
        if (!validEvents.includes(event)) {
          res.status(400).json({
            success: false,
            error: `Invalid event type: ${event}. Valid types: ${validEvents.join(', ')}`
          });
          return;
        }
      }

      logger.info({ url, events }, 'Webhook registration request received');

      const webhook = this.webhookManager.registerWebhook(url, events, secret);

      res.status(201).json({
        success: true,
        data: {
          webhookId: webhook.webhookId,
          url: webhook.url,
          events: webhook.events,
          createdAt: webhook.createdAt,
          active: webhook.active
        }
      });
    } catch (error: any) {
      logger.error({ error }, 'Error registering webhook');

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * GET /api/webhooks
   * List all webhooks
   */
  private async listWebhooks(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void> {
    try {
      logger.info('List webhooks request received');

      const webhooks = this.webhookManager.listWebhooks();

      // Don't expose secrets in list
      const safeWebhooks = webhooks.map(w => ({
        webhookId: w.webhookId,
        url: w.url,
        events: w.events,
        createdAt: w.createdAt,
        active: w.active
      }));

      res.status(200).json({
        success: true,
        data: {
          webhooks: safeWebhooks,
          count: safeWebhooks.length
        }
      });
    } catch (error: any) {
      logger.error({ error }, 'Error listing webhooks');

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * GET /api/webhooks/:webhookId
   * Get webhook by ID
   */
  private async getWebhook(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void> {
    try {
      const { webhookId } = req.params;

      logger.info({ webhookId }, 'Get webhook request received');

      const webhook = this.webhookManager.getWebhook(webhookId);

      if (!webhook) {
        res.status(404).json({
          success: false,
          error: 'Webhook not found'
        });
        return;
      }

      // Don't expose secret
      res.status(200).json({
        success: true,
        data: {
          webhookId: webhook.webhookId,
          url: webhook.url,
          events: webhook.events,
          createdAt: webhook.createdAt,
          active: webhook.active
        }
      });
    } catch (error: any) {
      logger.error({ error }, 'Error getting webhook');

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * PATCH /api/webhooks/:webhookId
   * Update webhook
   */
  private async updateWebhook(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void> {
    try {
      const { webhookId } = req.params;
      const updates = req.body;

      logger.info({ webhookId, updates }, 'Update webhook request received');

      const webhook = this.webhookManager.updateWebhook(webhookId, updates);

      if (!webhook) {
        res.status(404).json({
          success: false,
          error: 'Webhook not found'
        });
        return;
      }

      // Don't expose secret
      res.status(200).json({
        success: true,
        data: {
          webhookId: webhook.webhookId,
          url: webhook.url,
          events: webhook.events,
          createdAt: webhook.createdAt,
          active: webhook.active
        }
      });
    } catch (error: any) {
      logger.error({ error }, 'Error updating webhook');

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/webhooks/:webhookId
   * Delete webhook
   */
  private async deleteWebhook(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void> {
    try {
      const { webhookId } = req.params;

      logger.info({ webhookId }, 'Delete webhook request received');

      const deleted = this.webhookManager.deleteWebhook(webhookId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Webhook not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Webhook deleted successfully'
      });
    } catch (error: any) {
      logger.error({ error }, 'Error deleting webhook');

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * GET /api/webhooks/failed/list
   * Get failed webhook deliveries
   */
  private async getFailedDeliveries(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void> {
    try {
      logger.info('Get failed deliveries request received');

      const failed = this.webhookManager.getFailedDeliveries();

      res.status(200).json({
        success: true,
        data: {
          deliveries: failed,
          count: failed.length
        }
      });
    } catch (error: any) {
      logger.error({ error }, 'Error getting failed deliveries');

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * POST /api/webhooks/failed/retry
   * Retry failed webhook deliveries
   */
  private async retryFailedDeliveries(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void> {
    try {
      logger.info('Retry failed deliveries request received');

      await this.webhookManager.retryFailedWebhooks();

      res.status(200).json({
        success: true,
        message: 'Failed webhook deliveries retry initiated'
      });
    } catch (error: any) {
      logger.error({ error }, 'Error retrying failed deliveries');

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
}
