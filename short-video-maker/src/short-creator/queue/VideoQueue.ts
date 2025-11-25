import cuid from "cuid";
import { logger } from "../../logger";
import { QueueItem, QueueStatus } from "./QueueItem";
import type { SceneInput, RenderConfig } from "../../types/shorts";

export class VideoQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;

  constructor(
    private processVideoCallback: (item: QueueItem) => Promise<void>
  ) {
    logger.info("VideoQueue constructor called - queue initialized");
  }

  public addToQueue(
    sceneInput: SceneInput[],
    config: RenderConfig,
    callbackUrl?: string,
    metadata?: any
  ): string {
    logger.info("VideoQueue.addToQueue called - ENTRY POINT", {
      sceneCount: sceneInput?.length,
      hasConfig: !!config,
      hasCallbackUrl: !!callbackUrl,
      hasMetadata: !!metadata
    });

    const id = cuid();
    const item: QueueItem = {
      sceneInput,
      config,
      id,
      callbackUrl,
      metadata,
    };

    this.queue.push(item);
    logger.debug({ id, queueLength: this.queue.length }, "Item added to queue");

    if (!this.isProcessing) {
      logger.info("VideoQueue - about to start processQueue", {
        isProcessing: this.isProcessing,
        queueLength: this.queue.length
      });
      this.processQueue().catch(error => {
        logger.error(error, "Unhandled error in processQueue - queue may have stopped");
      });
    } else {
      logger.info("VideoQueue - processQueue already running", {
        isProcessing: this.isProcessing,
        queueLength: this.queue.length
      });
    }

    return id;
  }

  public getStatus(): QueueStatus {
    return {
      totalItems: this.queue.length,
      processingItem: this.isProcessing ? this.queue[0] : undefined,
      pendingItems: this.queue.length
    };
  }

  public findItem(id: string): QueueItem | undefined {
    return this.queue.find((item) => item.id === id);
  }

  private async processQueue(): Promise<void> {
    logger.info("VideoQueue.processQueue ENTERED", {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing
    });

    if (this.queue.length === 0 || this.isProcessing) {
      logger.info("VideoQueue.processQueue early return", {
        queueLength: this.queue.length,
        isProcessing: this.isProcessing,
        reason: this.queue.length === 0 ? "queue empty" : "already processing"
      });
      return;
    }

    this.isProcessing = true;
    const item = this.queue[0];

    logger.info("VideoQueue.processQueue about to process item", {
      itemId: item.id,
      sceneCount: item.sceneInput?.length
    });

    logger.debug(
      { sceneInput: item.sceneInput, config: item.config, id: item.id, callbackUrl: item.callbackUrl },
      "Processing video item in the queue",
    );

    try {
      await this.processVideoCallback(item);
      logger.debug({ id: item.id }, "Video processed successfully");
    } catch (error: unknown) {
      logger.error(error, "Error processing video in queue");
      throw error; // Re-throw to let caller handle callback
    } finally {
      this.queue.shift();
      this.isProcessing = false;
      this.processQueue(); // Process next item
    }
  }
}