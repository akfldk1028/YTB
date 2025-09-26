import { Kokoro } from "./Kokoro";
import { GoogleTTS } from "./google-tts";
import { ElevenLabsTTS } from "./elevenlabs-tts";
import { logger } from "../../config";
import type { Voices } from "../../types/shorts";

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
          }, "Fallback TTS provider failed, trying secondary fallback");
          
          // 3차 시도: Secondary fallback (Kokoro)
          if (this.secondaryFallback) {
            try {
              logger.debug({ 
                provider: this.getProviderName(this.secondaryFallback),
                text: text.substring(0, 50)
              }, "Attempting secondary fallback TTS provider");
              
              const result = await this.secondaryFallback.generate(text, voice);
              
              logger.info({ 
                primaryProvider: this.getProviderName(this.primaryProvider),
                fallbackProvider: this.getProviderName(this.fallbackProvider),
                secondaryFallback: this.getProviderName(this.secondaryFallback),
                success: true
              }, "Secondary fallback TTS provider succeeded");
              
              return result;
            } catch (secondaryError) {
              logger.error({ 
                primaryError,
                fallbackError,
                secondaryError,
                text: text.substring(0, 50)
              }, "All TTS providers failed");
              
              throw new Error(`All TTS providers failed. Primary: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}, Fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}, Secondary: ${secondaryError instanceof Error ? secondaryError.message : String(secondaryError)}`);
            }
          } else {
            logger.error({ 
              primaryError,
              fallbackError,
              text: text.substring(0, 50)
            }, "Primary and fallback TTS providers failed, no secondary fallback available");
            
            throw new Error(`Primary and fallback TTS providers failed. Primary: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}, Fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
          }
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
    if (provider instanceof Kokoro) return 'Kokoro';
    return 'Unknown';
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
          secondaryFallback = await Kokoro.init(configs.kokoroConfig?.kokoroModelPrecision || "fp32");
        } else {
          fallbackProvider = await Kokoro.init(configs.kokoroConfig?.kokoroModelPrecision || "fp32");
        }
        break;
        
      case "google":
        primaryProvider = await GoogleTTS.init(configs.googleTtsConfig);
        // Google TTS → Kokoro fallback
        fallbackProvider = await Kokoro.init(configs.kokoroConfig?.kokoroModelPrecision || "fp32");
        break;
        
      case "kokoro":
      default:
        primaryProvider = await Kokoro.init(configs.kokoroConfig?.kokoroModelPrecision || "fp32");
        // Kokoro는 fallback 없음 (가장 안정적)
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