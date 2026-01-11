import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { VoiceEnum, type Voices } from '../../../types/shorts';
import { logger } from '../../../config';

export interface ElevenLabsConfig {
  apiKey?: string;
  [key: string]: any;
}

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category: string;
  labels: { [key: string]: string };
}

export class ElevenLabsTTS {
  private client: ElevenLabsClient;
  private availableVoices: ElevenLabsVoice[] = [];

  constructor(config?: ElevenLabsConfig) {
    // ElevenLabs SDK는 ElevenLabsClient 클래스 사용
    if (!config?.apiKey) {
      throw new Error('ElevenLabs API key is required');
    }
    
    this.client = new ElevenLabsClient({
      apiKey: config.apiKey
    });
    this.initializeVoices();
  }

  private initializeVoices(): void {
    // ElevenLabs의 기본 제공 음성들 (높은 품질의 다국어 지원)
    this.availableVoices = [
      // 🔥 YouTube Shorts / TikTok / Instagram Reels 전용 음성들 (에너지 넘침!)
      // Female - Shorts 최적화
      { voiceId: 'kPzsL2i3teMYv0FxEYQ6', name: 'Brittney', category: 'Female', labels: { accent: 'american', age: 'young', gender: 'female', style: 'shorts' } },  // 소셜 미디어 전문
      { voiceId: 'N8CqI3qXFmT0tJHnzlrq', name: 'Arfa', category: 'Female', labels: { accent: 'american', age: 'young', gender: 'female', style: 'shorts' } },      // Reels/Shorts 최적화!
      { voiceId: 'ecp3DWciuUyW7BYM7II1', name: 'Anika', category: 'Female', labels: { accent: 'american', age: 'young', gender: 'female', style: 'shorts' } },     // Sweet & Lively
      { voiceId: 'bxiObU1YDrf7lrFAyV99', name: 'Ashley', category: 'Female', labels: { accent: 'american', age: 'young', gender: 'female', style: 'shorts' } },    // YouTube/TikTok 전용

      // Male - Shorts 최적화
      { voiceId: 'baRq1qg6PxLsnSQ04d8c', name: 'Axl', category: 'Male', labels: { accent: 'american', age: 'young', gender: 'male', style: 'shorts' } },           // 에너지 넘침, 시네마틱
      { voiceId: 'TtRFBnwQdH1k01vR0hMz', name: 'Arthur', category: 'Male', labels: { accent: 'american', age: 'young', gender: 'male', style: 'shorts' } },        // 소셜 미디어 최적화
      { voiceId: 'dyTPmGzuLaJM15vpN3DS', name: 'Aiden', category: 'Male', labels: { accent: 'american', age: 'young', gender: 'male', style: 'shorts' } },         // Happy Video 전문
      { voiceId: 'gWaDC0oXAheKoZfljzuI', name: 'Snap', category: 'Male', labels: { accent: 'american', age: 'young', gender: 'male', style: 'shorts' } },          // Vibrant Energy
      { voiceId: '2TgCsDinEcLJ95vqmLKm', name: 'ASH', category: 'Male', labels: { accent: 'american', age: 'young', gender: 'male', style: 'shorts' } },           // YouTube 전문 Enthusiastic

      // 영어 (미국) - 기존 높은 품질 음성들
      { voiceId: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', category: 'Male', labels: { accent: 'american', age: 'middle_aged', gender: 'male' } },
      { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Sarah', category: 'Female', labels: { accent: 'american', age: 'young', gender: 'female' } },
      { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', category: 'Male', labels: { accent: 'american', age: 'young', gender: 'male' } },
      { voiceId: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', category: 'Female', labels: { accent: 'american', age: 'young', gender: 'female' } },
      { voiceId: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', category: 'Female', labels: { accent: 'american', age: 'young', gender: 'female' } },
      { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', category: 'Female', labels: { accent: 'american', age: 'young', gender: 'female' } },
      { voiceId: 'ErXwobaYiN019PkySvjV', name: 'Antoni', category: 'Male', labels: { accent: 'american', age: 'young', gender: 'male' } },
      { voiceId: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', category: 'Female', labels: { accent: 'american', age: 'young', gender: 'female' } },
      { voiceId: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', category: 'Male', labels: { accent: 'american', age: 'young', gender: 'male' } },
      { voiceId: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', category: 'Male', labels: { accent: 'american', age: 'middle_aged', gender: 'male' } },

      // 영어 (영국) 억양
      { voiceId: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace', category: 'Female', labels: { accent: 'british', age: 'young', gender: 'female' } },
      { voiceId: 'cjVigY5qzO86Huf0OWal', name: 'Freya', category: 'Female', labels: { accent: 'british', age: 'young', gender: 'female' } },

      // 다국어 지원 음성들
      { voiceId: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', category: 'Male', labels: { accent: 'australian', age: 'middle_aged', gender: 'male' } },
      { voiceId: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', category: 'Male', labels: { accent: 'british', age: 'middle_aged', gender: 'male' } },
    ];
  }

  async generate(
    text: string,
    voice: Voices,
  ): Promise<{
    audio: ArrayBuffer;
    audioLength: number;
    alignment?: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  }> {
    try {
      // 기존 Kokoro 음성을 ElevenLabs 음성으로 매핑
      const elevenLabsVoice = this.mapKokoroToElevenLabsVoice(voice);

      logger.debug({
        text: text.substring(0, 100),
        voice,
        elevenLabsVoice: elevenLabsVoice.name
      }, "Generating audio with ElevenLabs TTS (with timestamps)");

      // ElevenLabs API 호출 - convertWithTimestamps 사용하여 alignment 데이터 함께 가져오기
      const sdkResponseRaw = await Promise.race([
        this.client.textToSpeech.convertWithTimestamps(elevenLabsVoice.voiceId, {
          text: text,
          modelId: "eleven_multilingual_v2" // 다국어 지원 모델
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ElevenLabs API timeout after 30 seconds')), 30000)
        )
      ]);

      // Debug: SDK response 구조 확인
      logger.debug({
        responseType: typeof sdkResponseRaw,
        hasData: 'data' in (sdkResponseRaw as any),
        keys: Object.keys(sdkResponseRaw as any),
      }, "ElevenLabs SDK response structure");

      // SDK response에서 실제 데이터 추출
      const sdkResponse = sdkResponseRaw as {
        data?: {
          audioBase64: string;
          alignment: {
            characters: string[];
            characterStartTimesSeconds: number[];
            characterEndTimesSeconds: number[];
          } | null;
        };
        audioBase64?: string;
        alignment?: {
          characters: string[];
          characterStartTimesSeconds: number[];
          characterEndTimesSeconds: number[];
        } | null;
      };

      // SDK가 { data: ... } 로 래핑하는 경우와 직접 반환하는 경우 모두 처리
      const response = sdkResponse.data || sdkResponse;

      // response 검증
      if (!response.audioBase64) {
        logger.error({
          responseKeys: Object.keys(response),
          hasAudioBase64: 'audioBase64' in response,
        }, "ElevenLabs response missing audioBase64");
        throw new Error('ElevenLabs response missing audioBase64 field');
      }

      // Base64를 ArrayBuffer로 변환 (Node.js 방식)
      const audioBuffer = Buffer.from(response.audioBase64, 'base64').buffer;

      // alignment 데이터에서 오디오 길이 계산 (마지막 문자의 end time)
      let audioLength: number;
      if (response.alignment && response.alignment.characterEndTimesSeconds.length > 0) {
        audioLength = Math.max(...response.alignment.characterEndTimesSeconds);
      } else {
        // fallback: 파일 크기로 추정
        audioLength = (audioBuffer.byteLength * 8) / 128000;
      }

      logger.debug({
        voice,
        audioLength: audioLength.toFixed(2),
        audioSizeBytes: audioBuffer.byteLength,
        elevenLabsVoice: elevenLabsVoice.name,
        hasAlignment: !!response.alignment
      }, "Audio generated with ElevenLabs TTS (with timestamps)");

      // SDK response를 기존 interface에 맞게 변환
      const alignmentConverted = response.alignment ? {
        characters: response.alignment.characters,
        character_start_times_seconds: response.alignment.characterStartTimesSeconds,
        character_end_times_seconds: response.alignment.characterEndTimesSeconds,
      } : undefined;

      return {
        audio: audioBuffer,
        audioLength: audioLength,
        alignment: alignmentConverted,
      };
    } catch (error) {
      // 더 자세한 에러 로깅
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
        code: (error as any)?.code,
      };

      logger.error({
        errorDetails,
        text: text.substring(0, 100),
        voice
      }, "Error generating audio with ElevenLabs TTS - will throw for fallback");

      // ElevenLabsError를 그대로 throw하여 상위에서 fallback 처리할 수 있도록 함
      throw error;
    }
  }

  private mapKokoroToElevenLabsVoice(kokoroVoice: Voices): ElevenLabsVoice {
    // Kokoro 음성을 ElevenLabs의 고품질 음성으로 매핑
    const voiceMap: Record<string, ElevenLabsVoice> = {
      // Female voices - 다양한 ElevenLabs 여성 음성으로 매핑
      'af_heart': this.availableVoices.find(v => v.name === 'Rachel')!,      // 자연스러운 여성 음성
      'af_alloy': this.availableVoices.find(v => v.name === 'Sarah')!,       // 부드러운 여성 음성
      'af_aoede': this.availableVoices.find(v => v.name === 'Bella')!,       // 표현력 있는 여성 음성
      'af_bella': this.availableVoices.find(v => v.name === 'Elli')!,        // 젊은 여성 음성
      'af_jessica': this.availableVoices.find(v => v.name === 'Domi')!,      // 프로페셔널한 여성 음성
      'af_kore': this.availableVoices.find(v => v.name === 'Grace')!,        // 영국 억양 여성 음성
      'af_nicole': this.availableVoices.find(v => v.name === 'Rachel')!,     // 기본 자연스러운 음성
      'af_nova': this.availableVoices.find(v => v.name === 'Sarah')!,        // 신선한 느낌의 음성
      'af_river': this.availableVoices.find(v => v.name === 'Freya')!,       // 영국 억양 차분한 음성
      'af_sarah': this.availableVoices.find(v => v.name === 'Sarah')!,       // Sarah 직접 매핑
      'af_sky': this.availableVoices.find(v => v.name === 'Bella')!,         // 밝은 느낌의 음성
      'bf_emma': this.availableVoices.find(v => v.name === 'Elli')!,         // 비즈니스 여성 음성
      'bf_isabella': this.availableVoices.find(v => v.name === 'Domi')!,     // 성숙한 여성 음성
      'bf_alice': this.availableVoices.find(v => v.name === 'Grace')!,       // 클래식한 여성 음성
      'bf_lily': this.availableVoices.find(v => v.name === 'Rachel')!,       // 부드러운 여성 음성
      
      // Male voices - 다양한 ElevenLabs 남성 음성으로 매핑
      'am_adam': this.availableVoices.find(v => v.name === 'Adam')!,         // Adam 직접 매핑
      'am_echo': this.availableVoices.find(v => v.name === 'Josh')!,         // 젊은 남성 음성
      'am_eric': this.availableVoices.find(v => v.name === 'George')!,       // 성숙한 남성 음성
      'am_fenrir': this.availableVoices.find(v => v.name === 'Antoni')!,     // 드라마틱한 남성 음성
      'am_liam': this.availableVoices.find(v => v.name === 'Daniel')!,       // 영국 억양 남성
      'am_michael': this.availableVoices.find(v => v.name === 'Arnold')!,    // 중년 남성 음성
      'am_onyx': this.availableVoices.find(v => v.name === 'George')!,       // 깊은 남성 음성
      'am_puck': this.availableVoices.find(v => v.name === 'Josh')!,         // 장난스러운 남성 음성
      'am_santa': this.availableVoices.find(v => v.name === 'Arnold')!,      // 따뜻한 중년 남성
      'bm_george': this.availableVoices.find(v => v.name === 'George')!,     // George 직접 매핑
      'bm_lewis': this.availableVoices.find(v => v.name === 'Daniel')!,      // 영국 억양 비즈니스 남성
      'bm_daniel': this.availableVoices.find(v => v.name === 'Daniel')!,     // Daniel 직접 매핑
      'bm_fable': this.availableVoices.find(v => v.name === 'Charlie')!,     // 호주 억양 남성
    };

    const mappedVoice = voiceMap[kokoroVoice];
    if (!mappedVoice) {
      // Check if kokoroVoice is actually an ElevenLabs voice ID (not a Kokoro name)
      // ElevenLabs voice IDs are typically 20+ character alphanumeric strings
      const isElevenLabsVoiceId = kokoroVoice &&
        kokoroVoice.length > 15 &&
        !kokoroVoice.includes('_') &&
        /^[a-zA-Z0-9]+$/.test(kokoroVoice);

      if (isElevenLabsVoiceId) {
        // Check if this voice ID exists in our available voices
        const directVoice = this.availableVoices.find(v => v.voiceId === kokoroVoice);
        if (directVoice) {
          logger.info({ voiceId: kokoroVoice, voiceName: directVoice.name }, "Using direct ElevenLabs voice ID from available voices");
          return directVoice;
        }

        // If not in our list, create a custom voice entry to use the ID directly
        logger.info({ voiceId: kokoroVoice }, "Using custom ElevenLabs voice ID directly");
        return {
          voiceId: kokoroVoice,
          name: 'Custom',
          category: 'Custom',
          labels: { accent: 'unknown', age: 'unknown', gender: 'unknown' }
        };
      }

      // 기본값으로 자연스러운 여성 음성 사용
      logger.warn({ kokoroVoice }, "Unknown voice, using default ElevenLabs voice");
      return this.availableVoices.find(v => v.name === 'Sarah')!;
    }

    return mappedVoice;
  }

  listAvailableVoices(): Voices[] {
    // 기존 Kokoro 음성 목록을 유지하여 호환성 보장
    return Object.values(VoiceEnum) as Voices[];
  }

  // ElevenLabs의 실제 음성 목록 가져오기 (선택사항)
  async getElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
    try {
      // API에서 실제 사용 가능한 음성 목록을 가져올 수 있음
      // 현재는 기본 설정된 음성 목록 반환
      return this.availableVoices;
    } catch (error) {
      logger.error({ error }, "Error fetching ElevenLabs voices");
      return this.availableVoices;
    }
  }

  // 🔥 Shorts/Reels 전용 음성 목록 가져오기
  getShortsVoices(): ElevenLabsVoice[] {
    return this.availableVoices.filter(v => v.labels.style === 'shorts');
  }

  // 🔥 Shorts 기본 음성 가져오기 (성별 선택 가능)
  getDefaultShortsVoice(gender: 'male' | 'female' = 'female'): ElevenLabsVoice {
    const shortsVoices = this.getShortsVoices();
    const genderVoices = shortsVoices.filter(v => v.labels.gender === gender);

    // 기본 추천: 여성 = Arfa (Reels 최적화), 남성 = Axl (에너지 넘침)
    if (gender === 'female') {
      return genderVoices.find(v => v.name === 'Arfa') || genderVoices[0];
    } else {
      return genderVoices.find(v => v.name === 'Axl') || genderVoices[0];
    }
  }

  // 🔥 voice ID로 직접 음성 사용 (N8N에서 직접 지정 시)
  getVoiceById(voiceId: string): ElevenLabsVoice | undefined {
    return this.availableVoices.find(v => v.voiceId === voiceId);
  }

  // 🔥 이름으로 음성 검색
  getVoiceByName(name: string): ElevenLabsVoice | undefined {
    return this.availableVoices.find(v => v.name.toLowerCase() === name.toLowerCase());
  }

  static async init(config?: ElevenLabsConfig): Promise<ElevenLabsTTS> {
    const elevenLabsTts = new ElevenLabsTTS(config);
    
    try {
      // 초기화 시 음성 목록 확인 (선택사항)
      const voices = await elevenLabsTts.getElevenLabsVoices();
      logger.info({ 
        voiceCount: voices.length,
        provider: 'ElevenLabs'
      }, "ElevenLabs TTS initialized successfully");
    } catch (error) {
      logger.warn({ error }, "Could not fetch ElevenLabs voices, using default list");
    }

    return elevenLabsTts;
  }
}