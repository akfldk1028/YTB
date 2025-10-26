import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../logger';
import type {
  WebhookRegistration,
  WebhookEvent,
  WebhookEventType,
  FailedWebhookDelivery,
  WebhookDeliveryAttempt
} from './types';

/**
 * WebhookManager
 * Manages webhook registrations and delivery
 */
export class WebhookManager {
  private webhooks: Map<string, WebhookRegistration> = new Map();
  private failedDeliveries: Map<string, FailedWebhookDelivery> = new Map();
  private webhookDir: string;
  private failedDir: string;
  private registrationsFile: string;

  // Retry delays in milliseconds
  private readonly RETRY_DELAYS = [
    0,              // Immediate
    60 * 1000,      // 1 minute
    5 * 60 * 1000,  // 5 minutes
    15 * 60 * 1000, // 15 minutes
    60 * 60 * 1000  // 1 hour
  ];

  private readonly MAX_ATTEMPTS = 5;

  constructor(dataDir: string) {
    this.webhookDir = path.join(dataDir, 'webhooks');
    this.failedDir = path.join(this.webhookDir, 'failed');
    this.registrationsFile = path.join(this.webhookDir, 'registrations.json');

    fs.ensureDirSync(this.webhookDir);
    fs.ensureDirSync(this.failedDir);

    // Load webhook registrations
    this.loadWebhooks();
  }

  /**
   * Register a new webhook
   */
  registerWebhook(
    url: string,
    events: WebhookEventType[],
    secret: string
  ): WebhookRegistration {
    const webhookId = this.generateWebhookId();

    const webhook: WebhookRegistration = {
      webhookId,
      url,
      events,
      secret,
      createdAt: new Date().toISOString(),
      active: true
    };

    this.webhooks.set(webhookId, webhook);
    this.saveWebhooks();

    logger.info({ webhookId, url, events }, '🔔 Webhook registered');

    return webhook;
  }

  /**
   * List all webhooks
   */
  listWebhooks(): WebhookRegistration[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Get webhook by ID
   */
  getWebhook(webhookId: string): WebhookRegistration | null {
    return this.webhooks.get(webhookId) || null;
  }

  /**
   * Delete webhook
   */
  deleteWebhook(webhookId: string): boolean {
    const deleted = this.webhooks.delete(webhookId);

    if (deleted) {
      this.saveWebhooks();
      logger.info({ webhookId }, '🗑️ Webhook deleted');
    }

    return deleted;
  }

  /**
   * Update webhook
   */
  updateWebhook(
    webhookId: string,
    updates: {
      url?: string;
      events?: WebhookEventType[];
      secret?: string;
      active?: boolean;
    }
  ): WebhookRegistration | null {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook) {
      return null;
    }

    Object.assign(webhook, updates);
    this.saveWebhooks();

    logger.info({ webhookId, updates }, '✏️ Webhook updated');

    return webhook;
  }

  /**
   * Trigger webhook for an event
   */
  async triggerWebhook(event: WebhookEvent): Promise<void> {
    const matchingWebhooks = Array.from(this.webhooks.values())
      .filter(w => w.active && w.events.includes(event.eventType));

    if (matchingWebhooks.length === 0) {
      logger.debug({ eventType: event.eventType }, 'No webhooks registered for event type');
      return;
    }

    logger.info(
      { eventId: event.eventId, eventType: event.eventType, webhookCount: matchingWebhooks.length },
      '🔔 Triggering webhooks'
    );

    // Deliver to all matching webhooks in parallel
    await Promise.allSettled(
      matchingWebhooks.map(webhook => this.deliverWebhook(webhook, event))
    );
  }

  /**
   * Retry failed webhook deliveries
   */
  async retryFailedWebhooks(): Promise<void> {
    const now = Date.now();
    const toRetry: FailedWebhookDelivery[] = [];

    // Find deliveries ready for retry
    for (const delivery of this.failedDeliveries.values()) {
      if (delivery.maxAttemptsReached) {
        continue;
      }

      if (!delivery.nextRetryAt || new Date(delivery.nextRetryAt).getTime() <= now) {
        toRetry.push(delivery);
      }
    }

    if (toRetry.length === 0) {
      return;
    }

    logger.info({ count: toRetry.length }, '🔄 Retrying failed webhook deliveries');

    for (const delivery of toRetry) {
      const webhook = this.webhooks.get(delivery.webhookId);

      if (!webhook) {
        // Webhook was deleted, remove from failed deliveries
        this.failedDeliveries.delete(delivery.eventId);
        this.removeFailedDeliveryFile(delivery.eventId);
        continue;
      }

      await this.deliverWebhook(webhook, delivery.event, delivery.attempts.length);
    }
  }

  /**
   * Get failed webhook deliveries
   */
  getFailedDeliveries(): FailedWebhookDelivery[] {
    return Array.from(this.failedDeliveries.values());
  }

  /**
   * Deliver webhook to a specific URL
   */
  private async deliverWebhook(
    webhook: WebhookRegistration,
    event: WebhookEvent,
    attemptNumber: number = 0
  ): Promise<void> {
    const payload = JSON.stringify(event);
    const signature = this.generateSignature(payload, webhook.secret);

    const attempt: WebhookDeliveryAttempt = {
      attemptNumber: attemptNumber + 1,
      timestamp: new Date().toISOString(),
      success: false
    };

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event.eventType,
          'User-Agent': 'Short-Video-Maker-Webhook/1.0'
        },
        body: payload,
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      attempt.statusCode = response.status;

      if (response.ok) {
        attempt.success = true;

        logger.info(
          {
            webhookId: webhook.webhookId,
            eventId: event.eventId,
            statusCode: response.status,
            attemptNumber: attempt.attemptNumber
          },
          '✅ Webhook delivered successfully'
        );

        // Remove from failed deliveries if it was there
        if (this.failedDeliveries.has(event.eventId)) {
          this.failedDeliveries.delete(event.eventId);
          this.removeFailedDeliveryFile(event.eventId);
        }
      } else {
        const errorText = await response.text();
        attempt.error = `HTTP ${response.status}: ${errorText}`;
        throw new Error(attempt.error);
      }
    } catch (error: any) {
      attempt.error = error.message;

      logger.warn(
        {
          webhookId: webhook.webhookId,
          eventId: event.eventId,
          attemptNumber: attempt.attemptNumber,
          error: error.message
        },
        '❌ Webhook delivery failed'
      );

      // Handle failed delivery
      await this.handleFailedDelivery(webhook, event, attempt);
    }
  }

  /**
   * Handle failed webhook delivery
   */
  private async handleFailedDelivery(
    webhook: WebhookRegistration,
    event: WebhookEvent,
    attempt: WebhookDeliveryAttempt
  ): Promise<void> {
    let failedDelivery = this.failedDeliveries.get(event.eventId);

    if (!failedDelivery) {
      failedDelivery = {
        eventId: event.eventId,
        webhookId: webhook.webhookId,
        event,
        attempts: [],
        createdAt: new Date().toISOString(),
        lastAttemptAt: attempt.timestamp,
        maxAttemptsReached: false
      };

      this.failedDeliveries.set(event.eventId, failedDelivery);
    }

    failedDelivery.attempts.push(attempt);
    failedDelivery.lastAttemptAt = attempt.timestamp;

    // Calculate next retry time
    if (attempt.attemptNumber < this.MAX_ATTEMPTS) {
      const delay = this.RETRY_DELAYS[attempt.attemptNumber] || this.RETRY_DELAYS[this.RETRY_DELAYS.length - 1];
      failedDelivery.nextRetryAt = new Date(Date.now() + delay).toISOString();
      attempt.nextRetryAt = failedDelivery.nextRetryAt;

      logger.info(
        {
          eventId: event.eventId,
          attemptNumber: attempt.attemptNumber,
          nextRetryAt: failedDelivery.nextRetryAt
        },
        '⏰ Webhook retry scheduled'
      );
    } else {
      failedDelivery.maxAttemptsReached = true;

      logger.error(
        { eventId: event.eventId, webhookId: webhook.webhookId },
        '🚫 Max webhook retry attempts reached'
      );
    }

    // Persist failed delivery
    this.saveFailedDelivery(failedDelivery);
  }

  /**
   * Generate webhook signature
   */
  private generateSignature(payload: string, secret: string): string {
    return 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify webhook signature
   */
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Generate unique webhook ID
   */
  private generateWebhookId(): string {
    return 'wh_' + crypto.randomBytes(16).toString('hex');
  }

  /**
   * Save webhooks to disk
   */
  private saveWebhooks(): void {
    const webhooks = Array.from(this.webhooks.values());
    fs.writeJsonSync(this.registrationsFile, webhooks, { spaces: 2 });
  }

  /**
   * Load webhooks from disk
   */
  private loadWebhooks(): void {
    if (!fs.existsSync(this.registrationsFile)) {
      return;
    }

    try {
      const webhooks: WebhookRegistration[] = fs.readJsonSync(this.registrationsFile);

      for (const webhook of webhooks) {
        this.webhooks.set(webhook.webhookId, webhook);
      }

      logger.info({ count: webhooks.length }, 'Loaded webhook registrations');
    } catch (error) {
      logger.error({ error }, 'Failed to load webhook registrations');
    }
  }

  /**
   * Save failed delivery to disk
   */
  private saveFailedDelivery(delivery: FailedWebhookDelivery): void {
    const filePath = path.join(this.failedDir, `${delivery.eventId}.json`);
    fs.writeJsonSync(filePath, delivery, { spaces: 2 });
  }

  /**
   * Remove failed delivery file
   */
  private removeFailedDeliveryFile(eventId: string): void {
    const filePath = path.join(this.failedDir, `${eventId}.json`);

    if (fs.existsSync(filePath)) {
      fs.removeSync(filePath);
    }
  }

  /**
   * Start retry worker (call periodically)
   */
  startRetryWorker(intervalMs: number = 60000): NodeJS.Timeout {
    logger.info({ intervalMs }, '🔄 Starting webhook retry worker');

    return setInterval(async () => {
      try {
        await this.retryFailedWebhooks();
      } catch (error) {
        logger.error({ error }, 'Error in webhook retry worker');
      }
    }, intervalMs);
  }
}
