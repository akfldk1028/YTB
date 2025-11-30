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
  }> {
    try {
      // 기존 Kokoro 음성을 ElevenLabs 음성으로 매핑
      const elevenLabsVoice = this.mapKokoroToElevenLabsVoice(voice);
      
      logger.debug({ 
        text: text.substring(0, 100), 
        voice, 
        elevenLabsVoice: elevenLabsVoice.name 
      }, "Generating audio with ElevenLabs TTS");

      // ElevenLabs API 호출 - 다국어 모델 사용 (타임아웃 설정)
      const audioStream = await Promise.race([
        this.client.textToSpeech.convert(elevenLabsVoice.voiceId, {
          text: text,
          modelId: "eleven_multilingual_v2" // 다국어 지원 모델
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('ElevenLabs API timeout after 10 seconds')), 10000)
        )
      ]) as ReadableStream;

      // 스트림을 ArrayBuffer로 변환
      const chunks: Uint8Array[] = [];
      const reader = audioStream.getReader();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      // Uint8Array chunks를 ArrayBuffer로 결합
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      const audioBuffer = result.buffer;
      
      // MP3 길이 추정 (128kbps 기준 - 실제로는 더 정확한 계산이 필요하지만 근사치)
      // MP3 파일 크기를 기반으로 길이 추정: fileSize * 8 / bitrate
      const audioLength = (audioBuffer.byteLength * 8) / 128000; // 초 단위
      
      logger.debug({ 
        voice, 
        audioLength: audioLength.toFixed(2), 
        audioSizeBytes: audioBuffer.byteLength,
        elevenLabsVoice: elevenLabsVoice.name
      }, "Audio generated with ElevenLabs TTS");

      return {
        audio: audioBuffer,
        audioLength: audioLength,
      };
    } catch (error) {
      logger.error({ 
        error, 
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