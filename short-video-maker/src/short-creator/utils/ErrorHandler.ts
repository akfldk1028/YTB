import { ERROR_TYPES } from './Constants';

export class ErrorHandler {
  static categorizeError(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      if (message.includes('quota') || message.includes('429')) {
        return ERROR_TYPES.QUOTA_EXCEEDED;
      } else if (message.includes('authentication') || message.includes('401')) {
        return ERROR_TYPES.AUTHENTICATION_ERROR;
      } else if (message.includes('network') || message.includes('timeout')) {
        return ERROR_TYPES.NETWORK_ERROR;
      } else if (message.includes('veo') || message.includes('leonardo')) {
        return ERROR_TYPES.VIDEO_GENERATION_ERROR;
      } else if (message.includes('tts') || message.includes('audio')) {
        return ERROR_TYPES.AUDIO_GENERATION_ERROR;
      } else if (message.includes('whisper') || message.includes('transcribe')) {
        return ERROR_TYPES.TRANSCRIPTION_ERROR;
      } else if (message.includes('ffmpeg') || message.includes('render')) {
        return ERROR_TYPES.VIDEO_PROCESSING_ERROR;
      } else {
        return ERROR_TYPES.UNKNOWN_ERROR;
      }
    }
    return ERROR_TYPES.UNKNOWN_ERROR;
  }

  static createError(type: string, message: string, originalError?: unknown): Error {
    const error = new Error(`[${type}] ${message}`);
    if (originalError instanceof Error) {
      error.stack = originalError.stack;
    }
    return error;
  }
}