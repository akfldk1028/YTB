/**
 * FFmpeg Module - Re-export from YTB-ffmpeg
 *
 * This file maintains backward compatibility with existing imports.
 * All functionality is now in src/YTB-ffmpeg/ folder.
 *
 * @deprecated Import from '../../YTB-ffmpeg' instead for new code
 *
 * Structure:
 * - YTB-ffmpeg/index.ts     - FFMpeg facade class
 * - YTB-ffmpeg/utils.ts     - Shared utilities (initFFmpeg, findAvailableFontPath, etc.)
 * - YTB-ffmpeg/AudioProcessor.ts - Audio operations
 * - YTB-ffmpeg/SubtitleFilter.ts - Subtitle/caption filter generation
 * - YTB-ffmpeg/VideoConcat.ts    - Video concatenation
 * - YTB-ffmpeg/VideoEditor.ts    - Video editing operations
 */

// Re-export everything from YTB-ffmpeg module
export * from "../../YTB-ffmpeg";
export { FFMpeg } from "../../YTB-ffmpeg";
export { FFMpeg as default } from "../../YTB-ffmpeg";
