import type { Scene, RenderConfig, SceneInput } from "../../types/shorts";
import type { OrientationEnum } from "../../types/shorts";
import type { Config } from "../../config";

export interface WorkflowContext {
  videoId: string;
  orientation: OrientationEnum;
  config: RenderConfig;
  systemConfig: Config; // Full system configuration including VEO3 settings
  metadata?: any;
}

export interface WorkflowResult {
  outputPath: string;
  duration: number;
  scenes: Scene[];
}

export abstract class BaseWorkflow {
  abstract process(
    scenes: Scene[],
    inputScenes: SceneInput[],
    context: WorkflowContext
  ): Promise<WorkflowResult>;

  protected validateScenes(scenes: Scene[]): void {
    if (!scenes || scenes.length === 0) {
      throw new Error("No scenes provided for processing");
    }

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (!scene.audio || !scene.video) {
        throw new Error(`Scene ${i + 1} is missing audio or video`);
      }
    }
  }

  protected calculateTotalDuration(scenes: Scene[]): number {
    return scenes.reduce((total, scene) => {
      return total + (scene.audio?.duration || 0);
    }, 0);
  }
}