// Using refactored version with fixed components
export { ShortCreatorRefactored as ShortCreator } from './ShortCreatorRefactored';
// export { ShortCreator } from './deprecated/ShortCreator';
// export { ShortCreatorRefactored } from './ShortCreatorRefactored';

// Export modular components for direct use
export { VideoQueue } from './queue/VideoQueue';
export { QueueItem } from './queue/QueueItem';

export { BaseVideoSource } from './video-sources/BaseVideoSource';
export { PexelsVideoSource } from './video-sources/PexelsVideoSource';
export { VeoVideoSource } from './video-sources/VeoVideoSource';
export { LeonardoVideoSource } from './video-sources/LeonardoVideoSource';
export { NanoBananaVideoSource } from './video-sources/NanoBananaVideoSource';

export { AudioProcessor } from './processors/AudioProcessor';
export { VideoProcessor } from './processors/VideoProcessor';

export { BaseWorkflow } from './workflows/BaseWorkflow';
export { SingleSceneWorkflow } from './workflows/SingleSceneWorkflow';
export { MultiSceneWorkflow } from './workflows/MultiSceneWorkflow';
export { NanoBananaStaticWorkflow } from './workflows/NanoBananaStaticWorkflow';

export { StatusManager } from './managers/StatusManager';
export { CallbackManager } from './managers/CallbackManager';
export { FileManager } from './managers/FileManager';

export { ErrorHandler } from './utils/ErrorHandler';
export * from './utils/Constants';

// Legacy exports to maintain compatibility
export * from './libraries';
export { MusicManager } from './music';
export { NanoBananaStaticVideoHelper } from './nanoBananaStaticVideo';