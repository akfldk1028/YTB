import type { SceneInput, RenderConfig } from "../../types/shorts";

export interface QueueItem {
  sceneInput: SceneInput[];
  config: RenderConfig;
  id: string;
  callbackUrl?: string;
  metadata?: any;
}

export interface QueueStatus {
  totalItems: number;
  processingItem?: QueueItem;
  pendingItems: number;
}