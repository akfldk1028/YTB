import { GoogleTTS } from "./google-tts";
import { ElevenLabsTTS } from "./elevenlabs-tts";
import { FFMpeg } from "./FFmpeg";
import { logger } from "../../config";
import type { Voices } from "../../types/shorts";
import type { Kokoro } from "./Kokoro";

/**
 * TTS Provider with automatic fallback support
 * ElevenLabs → Google TTS → Kokoro 순서로 fallback
 */
export class TTSProvider {
  constructor(
    private primaryProvider: Kokoro | GoogleTTS | ElevenLabsTTS,
    private fallbackProvider?: GoogleTTS | Kokoro,
    private secondaryFallback?: Kokoro
  ) {}

  async generate(
    text: string,
    voice: Voices,
  ): Promise<{
    audio: ArrayBuffer;
    audioLength: number;
  }> {
    // 빈 텍스트 처리: 유효성 검사 후 무음 오디오 반환
    const trimmedText = text?.trim();
    if (!trimmedText) {
      logger.debug("Empty text provided, returning silent audio");
      return await this.generateSilentAudio(0.1); // 0.1초 무음
    }

    // 1차 시도: Primary provider (ElevenLabs/Google/Kokoro)
    try {
      logger.debug({ 
        provider: this.getProviderName(this.primaryProvider),
        text: text.substring(0, 50)
      }, "Attempting primary TTS provider");
      
      const result = await this.primaryProvider.generate(text, voice);
      
      logger.debug({ 
        provider: this.getProviderName(this.primaryProvider),
        success: true
      }, "Primary TTS provider succeeded");
      
      return result;
    } catch (primaryError) {
      logger.warn({ 
        error: primaryError,
        provider: this.getProviderName(this.primaryProvider)
      }, "Primary TTS provider failed, trying fallback");
      
      // 2차 시도: Fallback provider
      if (this.fallbackProvider) {
        try {
          logger.debug({ 
            provider: this.getProviderName(this.fallbackProvider),
            text: text.substring(0, 50)
          }, "Attempting fallback TTS provider");
          
          const result = await this.fallbackProvider.generate(text, voice);
          
          logger.info({ 
            primaryProvider: this.getProviderName(this.primaryProvider),
            fallbackProvider: this.getProviderName(this.fallbackProvider),
            success: true
          }, "Fallback TTS provider succeeded");
          
          return result;
        } catch (fallbackError) {
          logger.warn({
            error: fallbackError,
            provider: this.getProviderName(this.fallbackProvider)
          }, "Fallback TTS provider failed");

          // Kokoro is disabled to avoid phonemizer crash
          logger.error({
            primaryError,
            fallbackError,
            text: text.substring(0, 50)
          }, "Primary and fallback TTS providers failed, no secondary fallback available");

          throw new Error(`Primary and fallback TTS providers failed. Primary: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}, Fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        }
      } else {
        logger.error({ 
          primaryError,
          text: text.substring(0, 50)
        }, "Primary TTS provider failed, no fallback provider available");
        
        throw primaryError;
      }
    }
  }

  listAvailableVoices(): Voices[] {
    // Primary provider의 음성 목록 반환
    return this.primaryProvider.listAvailableVoices();
  }

  private getProviderName(provider: any): string {
    if (provider instanceof ElevenLabsTTS) return 'ElevenLabs';
    if (provider instanceof GoogleTTS) return 'Google TTS';
    // Kokoro check removed to avoid import issues
    return 'Unknown';
  }

  /**
   * 빈 텍스트를 위한 무음 오디오 생성 (FFmpeg 사용)
   */
  private async generateSilentAudio(duration: number): Promise<{
    audio: ArrayBuffer;
    audioLength: number;
  }> {
    try {
      const ffmpeg = await FFMpeg.init();
      
      // FFmpeg를 사용해 무음 오디오 생성
      // anullsrc 필터를 사용해 무음 생성 후 MP3로 인코딩
      const silentAudioBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        
        require('fluent-ffmpeg')()
          .input(`anullsrc=channel_layout=mono:sample_rate=44100`)
          .inputOptions(['-f', 'lavfi', '-t', duration.toString()])
          .audioCodec('libmp3lame')
          .audioBitrate(128)
          .audioChannels(1)
          .toFormat('mp3')
          .on('error', (err: Error) => {
            logger.warn({ error: err }, "Error generating silent audio with FFmpeg");
            reject(err);
          })
          .pipe()
          .on('data', (data: Buffer) => {
            chunks.push(data);
          })
          .on('end', () => {
            const buffer = Buffer.concat(chunks);
            resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
          })
          .on('error', (err: Error) => {
            reject(err);
          });
      });

      logger.debug({ 
        duration, 
        bytesGenerated: silentAudioBuffer.byteLength 
      }, "Generated silent audio with FFmpeg");

      return {
        audio: silentAudioBuffer,
        audioLength: duration
      };
    } catch (error) {
      logger.warn({ error }, "Failed to generate silent audio with FFmpeg, using minimal fallback");
      
      // FFmpeg 실패 시 최소한의 빈 ArrayBuffer 반환 (비상 대응)
      const emptyBuffer = new ArrayBuffer(0);
      return {
        audio: emptyBuffer,
        audioLength: 0
      };
    }
  }

  /**
   * Factory method to create TTS provider with automatic fallback
   */
  static async createWithFallback(
    primaryType: "elevenlabs" | "google" | "kokoro",
    configs: {
      elevenLabsConfig?: any;
      googleTtsConfig?: any;
      kokoroConfig?: any;
    }
  ): Promise<TTSProvider> {
    let primaryProvider: Kokoro | GoogleTTS | ElevenLabsTTS;
    let fallbackProvider: GoogleTTS | Kokoro | undefined;
    let secondaryFallback: Kokoro | undefined;

    // Primary provider 초기화
    switch (primaryType) {
      case "elevenlabs":
        primaryProvider = await ElevenLabsTTS.init(configs.elevenLabsConfig);
        // ElevenLabs → Google TTS → Kokoro fallback chain
        if (configs.googleTtsConfig) {
          fallbackProvider = await GoogleTTS.init(configs.googleTtsConfig);
          // Lazy load Kokoro only if needed as secondary fallback
          // Don't initialize yet - will be initialized when actually needed
        } else {
          // Lazy load Kokoro only if needed as fallback
          // Don't initialize yet
        }
        break;

      case "google":
        primaryProvider = await GoogleTTS.init(configs.googleTtsConfig);
        // Google TTS → Kokoro fallback
        // Lazy load Kokoro only if needed
        break;

      case "kokoro":
      default:
        // Kokoro is disabled due to phonemizer crash issues
        // Use ElevenLabs or Google TTS instead
        throw new Error("Kokoro TTS is disabled. Please use 'elevenlabs' or 'google' as TTS_PROVIDER.");
        break;
    }

    logger.info({
      primaryProvider: primaryType,
      hasFallback: !!fallbackProvider,
      hasSecondaryFallback: !!secondaryFallback
    }, "TTS Provider with fallback initialized");

    return new TTSProvider(primaryProvider, fallbackProvider, secondaryFallback);
  }
}