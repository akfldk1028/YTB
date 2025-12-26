/**
 * FFmpeg Module - Re-export from modular structure
 *
 * This file maintains backward compatibility with existing imports.
 * All functionality is now in the ./ffmpeg/ folder.
 *
 * @deprecated Import from './ffmpeg' instead for new code
 *
 * Structure:
 * - ffmpeg/index.ts     - FFMpeg facade class
 * - ffmpeg/utils.ts     - Shared utilities (initFFmpeg, findAvailableFontPath, etc.)
 * - ffmpeg/AudioProcessor.ts - Audio operations
 * - ffmpeg/SubtitleFilter.ts - Subtitle/caption filter generation
 * - ffmpeg/VideoConcat.ts    - Video concatenation
 * - ffmpeg/VideoEditor.ts    - Video editing operations
 */

// Re-export everything from the modular structure
export * from "./ffmpeg-core";
export { FFMpeg } from "./ffmpeg-core";
export { FFMpeg as default } from "./ffmpeg-core";
