import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { VoiceEnum, type Voices } from '../../../types/shorts';
import { logger } from '../../../config';

export interface GoogleTTSConfig {
  projectId?: string;
  keyFilename?: string;
  credentials?: object;
  [key: string]: any; // Index signature for Google Cloud client options
}

export interface GoogleVoice {
  languageCode: string;
  name: string;
  ssmlGender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  naturalSampleRateHertz: number;
}

export class GoogleTTS {
  private client: TextToSpeechClient;
  private availableVoices: GoogleVoice[] = [];

  constructor(config?: GoogleTTSConfig) {
    this.client = new TextToSpeechClient(config);
    this.initializeVoices();
  }

  private initializeVoices(): void {
    // Google Cloud TTS에서 제공하는 주요 자연스러운 음성들
    this.availableVoices = [
      // English (US) - Neural2 and Studio voices
      { languageCode: 'en-US', name: 'en-US-Neural2-A', ssmlGender: 'MALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'en-US', name: 'en-US-Neural2-C', ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'en-US', name: 'en-US-Neural2-D', ssmlGender: 'MALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'en-US', name: 'en-US-Neural2-E', ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'en-US', name: 'en-US-Neural2-F', ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'en-US', name: 'en-US-Neural2-G', ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'en-US', name: 'en-US-Neural2-H', ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'en-US', name: 'en-US-Neural2-I', ssmlGender: 'MALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'en-US', name: 'en-US-Neural2-J', ssmlGender: 'MALE', naturalSampleRateHertz: 24000 },
      
      // Studio voices for broadcasting quality
      { languageCode: 'en-US', name: 'en-US-Studio-M', ssmlGender: 'MALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'en-US', name: 'en-US-Studio-O', ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
      
      // English (UK)
      { languageCode: 'en-GB', name: 'en-GB-Neural2-A', ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'en-GB', name: 'en-GB-Neural2-B', ssmlGender: 'MALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'en-GB', name: 'en-GB-Neural2-C', ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'en-GB', name: 'en-GB-Neural2-D', ssmlGender: 'MALE', naturalSampleRateHertz: 24000 },
      
      // 한국어
      { languageCode: 'ko-KR', name: 'ko-KR-Neural2-A', ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'ko-KR', name: 'ko-KR-Neural2-B', ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'ko-KR', name: 'ko-KR-Neural2-C', ssmlGender: 'MALE', naturalSampleRateHertz: 24000 },
      
      // 일본어
      { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B', ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', ssmlGender: 'MALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D', ssmlGender: 'MALE', naturalSampleRateHertz: 24000 },
      
      // Spanish
      { languageCode: 'es-US', name: 'es-US-Neural2-A', ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'es-US', name: 'es-US-Neural2-B', ssmlGender: 'MALE', naturalSampleRateHertz: 24000 },
      { languageCode: 'es-US', name: 'es-US-Neural2-C', ssmlGender: 'MALE', naturalSampleRateHertz: 24000 },
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
      // 기존 Kokoro 음성을 Google TTS 음성으로 매핑
      const googleVoice = this.mapKokoroToGoogleVoice(voice);
      
      const request = {
        input: { text },
        voice: {
          languageCode: googleVoice.languageCode,
          name: googleVoice.name,
          ssmlGender: googleVoice.ssmlGender as any,
        },
        audioConfig: {
          audioEncoding: 'LINEAR16' as const,
          sampleRateHertz: 16000, // Whisper와 호환을 위해 16kHz 사용
        },
      };

      logger.debug({ text: text.substring(0, 100), voice, googleVoice: googleVoice.name }, "Generating audio with Google TTS");

      const [response] = await this.client.synthesizeSpeech(request);
      
      if (!response.audioContent) {
        throw new Error('No audio content received from Google TTS');
      }

      // 오디오 길이 계산 (16kHz, 16-bit PCM 기준)
      const audioBuffer = Buffer.from(response.audioContent as Uint8Array).buffer;
      const audioLength = audioBuffer.byteLength / (16000 * 2); // 초 단위
      
      logger.debug({ voice, audioLength, audioSizeBytes: audioBuffer.byteLength }, "Audio generated with Google TTS");

      return {
        audio: audioBuffer,
        audioLength: audioLength,
      };
    } catch (error) {
      logger.error({ error, text: text.substring(0, 100), voice }, "Error generating audio with Google TTS");
      throw error;
    }
  }

  private mapKokoroToGoogleVoice(kokoroVoice: Voices): GoogleVoice {
    // Kokoro 음성을 Google TTS의 자연스러운 음성으로 매핑
    const voiceMap: Record<string, GoogleVoice> = {
      // Female voices
      'af_heart': this.availableVoices.find(v => v.name === 'en-US-Neural2-C')!,
      'af_alloy': this.availableVoices.find(v => v.name === 'en-US-Neural2-E')!,
      'af_aoede': this.availableVoices.find(v => v.name === 'en-US-Neural2-F')!,
      'af_bella': this.availableVoices.find(v => v.name === 'en-US-Neural2-G')!,
      'af_jessica': this.availableVoices.find(v => v.name === 'en-US-Neural2-H')!,
      'af_kore': this.availableVoices.find(v => v.name === 'en-US-Studio-O')!,
      'af_nicole': this.availableVoices.find(v => v.name === 'en-GB-Neural2-A')!,
      'af_nova': this.availableVoices.find(v => v.name === 'en-GB-Neural2-C')!,
      'af_river': this.availableVoices.find(v => v.name === 'ko-KR-Neural2-A')!,
      'af_sarah': this.availableVoices.find(v => v.name === 'ko-KR-Neural2-B')!,
      'af_sky': this.availableVoices.find(v => v.name === 'ja-JP-Neural2-B')!,
      'bf_emma': this.availableVoices.find(v => v.name === 'es-US-Neural2-A')!,
      'bf_isabella': this.availableVoices.find(v => v.name === 'en-US-Neural2-C')!,
      'bf_alice': this.availableVoices.find(v => v.name === 'en-US-Neural2-E')!,
      'bf_lily': this.availableVoices.find(v => v.name === 'en-US-Neural2-F')!,
      
      // Male voices
      'am_adam': this.availableVoices.find(v => v.name === 'en-US-Neural2-A')!,
      'am_echo': this.availableVoices.find(v => v.name === 'en-US-Neural2-D')!,
      'am_eric': this.availableVoices.find(v => v.name === 'en-US-Neural2-I')!,
      'am_fenrir': this.availableVoices.find(v => v.name === 'en-US-Neural2-J')!,
      'am_liam': this.availableVoices.find(v => v.name === 'en-US-Studio-M')!,
      'am_michael': this.availableVoices.find(v => v.name === 'en-GB-Neural2-B')!,
      'am_onyx': this.availableVoices.find(v => v.name === 'en-GB-Neural2-D')!,
      'am_puck': this.availableVoices.find(v => v.name === 'ko-KR-Neural2-C')!,
      'am_santa': this.availableVoices.find(v => v.name === 'ja-JP-Neural2-C')!,
      'bm_george': this.availableVoices.find(v => v.name === 'ja-JP-Neural2-D')!,
      'bm_lewis': this.availableVoices.find(v => v.name === 'es-US-Neural2-B')!,
      'bm_daniel': this.availableVoices.find(v => v.name === 'es-US-Neural2-C')!,
      'bm_fable': this.availableVoices.find(v => v.name === 'en-US-Neural2-A')!,
    };

    const mappedVoice = voiceMap[kokoroVoice];
    if (!mappedVoice) {
      // 기본값으로 자연스러운 여성 음성 사용
      logger.warn({ kokoroVoice }, "Unknown voice, using default");
      return this.availableVoices.find(v => v.name === 'en-US-Neural2-C')!;
    }

    return mappedVoice;
  }

  listAvailableVoices(): Voices[] {
    // 기존 Kokoro 음성 목록을 유지하여 호환성 보장
    return Object.values(VoiceEnum) as Voices[];
  }

  // Google TTS의 실제 음성 목록 가져오기
  async getGoogleVoices(): Promise<GoogleVoice[]> {
    try {
      const [response] = await this.client.listVoices({});
      return response.voices?.map(voice => ({
        languageCode: voice.languageCodes?.[0] || '',
        name: voice.name || '',
        ssmlGender: (voice.ssmlGender as 'MALE' | 'FEMALE' | 'NEUTRAL') || 'NEUTRAL',
        naturalSampleRateHertz: voice.naturalSampleRateHertz || 24000,
      })) || [];
    } catch (error) {
      logger.error({ error }, "Error fetching Google TTS voices");
      return this.availableVoices;
    }
  }

  static async init(config?: GoogleTTSConfig): Promise<GoogleTTS> {
    const googleTts = new GoogleTTS(config);
    
    try {
      // 초기화 시 실제 사용 가능한 음성 목록 업데이트
      const voices = await googleTts.getGoogleVoices();
      if (voices.length > 0) {
        googleTts.availableVoices = voices.filter(voice => 
          voice.name.includes('Neural2') || voice.name.includes('Studio')
        );
      }
      logger.info({ voiceCount: googleTts.availableVoices.length }, "Google TTS initialized successfully");
    } catch (error) {
      logger.warn({ error }, "Could not fetch Google TTS voices, using default list");
    }

    return googleTts;
  }
}