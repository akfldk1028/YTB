/**
 * Gemini TTS Provider
 *
 * Google Gemini 2.5 Flash/Pro TTS API를 사용한 고품질 TTS
 * - 자연스러운 감정 표현
 * - 한국어 최적화
 * - 숏츠에 적합한 음성
 *
 * Voice 타입:
 * - 여성: Achernar(부드러운), Aoede, Autonoe, Despina, Erinome, Leda
 * - 남성: Algenib, Alnilam(단단한)
 *
 * 🔥 REST API 직접 호출 (SDK 404 에러 문제 해결)
 */

import { logger } from '../../../logger';

// ==================== Voice 정의 ====================

export type GeminiVoiceGender = 'female' | 'male' | 'random';

/**
 * 🔥 Gemini TTS Voice 목록 (공식 API 지원 Voice)
 * - 참고: https://ai.google.dev/gemini-api/docs/speech-generation
 * - 총 30개 Voice 지원, 24개 언어 (한국어 포함)
 */
export const GEMINI_KOREAN_VOICES = {
  female: [
    { name: 'Kore', style: 'clear', description: '또렷하고 명확한 목소리 (뉴스/안내)' },
    { name: 'Leda', style: 'warm', description: '따뜻하고 친근한 목소리' },
    { name: 'Zephyr', style: 'gentle', description: '부드럽고 편안한 목소리' },
    { name: 'Aoede', style: 'bright', description: '밝고 생동감 있는 목소리' },
  ],
  male: [
    { name: 'Puck', style: 'upbeat', description: '활기차고 경쾌한 목소리' },
    { name: 'Charon', style: 'firm', description: '단단하고 힘 있는 목소리' },
    { name: 'Fenrir', style: 'deep', description: '깊고 중후한 목소리' },
    { name: 'Enceladus', style: 'calm', description: '차분하고 안정적인 목소리' },
  ],
} as const;

/**
 * 뉴스 숏츠 추천 Voice (빠르고 명확한 전달)
 * - 여성: Kore (또렷하고 명확)
 * - 남성: Charon (단단하고 힘 있음)
 */
export const NEWS_SHORTS_RECOMMENDED = {
  female: ['Kore', 'Aoede', 'Leda'],  // 또렷하고 밝은 목소리
  male: ['Charon', 'Puck'],            // 단단하고 활기찬 목소리
};

// ==================== GeminiTTS Class ====================

export interface GeminiTTSConfig {
  apiKey?: string;
  // 🔥 Pro: 더 자연스럽고 표현력 좋음 (권장)
  // Flash: 더 빠름
  model?: 'gemini-2.5-pro-preview-tts' | 'gemini-2.5-flash-preview-tts';
  defaultGender?: GeminiVoiceGender;
}

export interface GeminiTTSResult {
  audio: ArrayBuffer;
  audioLength: number;
  voice: string;
  gender: string;
}

export class GeminiTTS {
  readonly name = 'gemini';
  private apiKey: string;
  private model: string;
  private defaultGender: GeminiVoiceGender;

  constructor(config?: GeminiTTSConfig) {
    const apiKey = config?.apiKey || process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('[GeminiTTS] API key required. Set GOOGLE_GEMINI_API_KEY env variable.');
    }

    this.apiKey = apiKey;
    // 🔥 Flash TTS: 낮은 latency, 안정적 (기본값)
    // Pro TTS: 더 자연스럽고 표현력이 좋음 (고품질 필요시)
    this.model = config?.model || 'gemini-2.5-flash-preview-tts';
    this.defaultGender = config?.defaultGender || 'female';

    logger.info({ model: this.model }, '[GeminiTTS] 초기화 완료 (REST API 직접 호출)');
  }

  /**
   * 랜덤 Voice 선택
   */
  getRandomVoice(gender?: GeminiVoiceGender): { name: string; gender: 'female' | 'male' } {
    const targetGender = gender === 'random' || !gender
      ? (Math.random() > 0.5 ? 'female' : 'male')
      : gender;

    const voices = GEMINI_KOREAN_VOICES[targetGender];
    const randomIndex = Math.floor(Math.random() * voices.length);
    const selectedVoice = voices[randomIndex];

    logger.debug({
      selectedVoice: selectedVoice.name,
      gender: targetGender,
      style: selectedVoice.style
    }, '[GeminiTTS] Voice 선택');

    return {
      name: selectedVoice.name,
      gender: targetGender,
    };
  }

  /**
   * 뉴스 숏츠용 추천 Voice 선택 (랜덤)
   */
  getNewsVoice(gender?: GeminiVoiceGender): { name: string; gender: 'female' | 'male' } {
    const targetGender = gender === 'random' || !gender
      ? (Math.random() > 0.5 ? 'female' : 'male')
      : gender;

    const recommendedVoices = NEWS_SHORTS_RECOMMENDED[targetGender];
    const randomIndex = Math.floor(Math.random() * recommendedVoices.length);
    const selectedVoice = recommendedVoices[randomIndex];

    logger.debug({
      selectedVoice,
      gender: targetGender,
      type: 'news_recommended'
    }, '[GeminiTTS] 뉴스용 Voice 선택');

    return {
      name: selectedVoice,
      gender: targetGender,
    };
  }

  /**
   * 텍스트를 음성으로 변환 (Gemini API)
   */
  async generate(
    text: string,
    voice?: string,
    options?: {
      gender?: GeminiVoiceGender;
      useNewsVoice?: boolean;
      stylePrompt?: string;
    }
  ): Promise<GeminiTTSResult> {
    // Voice 결정
    let selectedVoice: { name: string; gender: 'female' | 'male' };

    if (voice) {
      // 🔥 voice가 유효한 Gemini voice인지 확인
      const isFemale = GEMINI_KOREAN_VOICES.female.some(v => v.name === voice);
      const isMale = GEMINI_KOREAN_VOICES.male.some(v => v.name === voice);

      if (isFemale || isMale) {
        // 유효한 Gemini voice
        selectedVoice = {
          name: voice,
          gender: isFemale ? 'female' : 'male',
        };
      } else {
        // 🔥 유효하지 않은 voice (예: ElevenLabs ID) → 랜덤 voice 사용
        logger.warn({
          invalidVoice: voice,
          fallbackTo: 'random'
        }, '[GeminiTTS] 유효하지 않은 voice ID, 랜덤 voice로 대체');
        selectedVoice = options?.useNewsVoice
          ? this.getNewsVoice(options?.gender)
          : this.getRandomVoice(options?.gender);
      }
    } else if (options?.useNewsVoice) {
      // 뉴스용 추천 Voice
      selectedVoice = this.getNewsVoice(options?.gender);
    } else {
      // 랜덤 Voice
      selectedVoice = this.getRandomVoice(options?.gender);
    }

    logger.info({
      textLength: text.length,
      voice: selectedVoice.name,
      gender: selectedVoice.gender,
      model: this.model,
    }, '[GeminiTTS] 음성 생성 시작');

    try {
      // 🔥 REST API 직접 호출 (SDK 404 에러 문제 해결)
      // 공식 문서: https://ai.google.dev/gemini-api/docs/speech-generation
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;

      // 🔥 공식 문서 기준 Request Body 구조
      const requestBody = {
        contents: [{
          parts: [{
            text: options?.stylePrompt ? `${options.stylePrompt}: ${text}` : text
          }]
        }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: selectedVoice.name,
              },
            },
          },
        },
      };

      // 🔥 전체 요청 로깅 (디버깅용)
      logger.info({
        url,
        voiceName: selectedVoice.name,
        model: this.model,
        textLength: text.length,
        requestBody: JSON.stringify(requestBody).substring(0, 500),
      }, '[GeminiTTS] REST API 호출');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,  // 🔥 공식 문서: Header로 API key 전달
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          errorText: errorText.substring(0, 500),
          model: this.model,
          voice: selectedVoice.name,
        }, '[GeminiTTS] API 요청 실패');
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // 🔥 전체 API 응답 로깅 (디버깅용)
      logger.info({
        responseKeys: Object.keys(data),
        candidates: data.candidates?.map((c: any) => ({
          finishReason: c.finishReason,
          hasParts: !!c.content?.parts,
          partsLength: c.content?.parts?.length || 0,
          firstPartType: c.content?.parts?.[0] ? Object.keys(c.content.parts[0]) : [],
        })),
        modelVersion: data.modelVersion,
        usageMetadata: data.usageMetadata,
      }, '[GeminiTTS] 전체 API 응답');

      // 🔥 API 응답 구조 디버깅 로깅
      logger.debug({
        hasCandidates: !!data.candidates,
        candidatesLength: data.candidates?.length || 0,
        hasContent: !!data.candidates?.[0]?.content,
        hasParts: !!data.candidates?.[0]?.content?.parts,
        partsLength: data.candidates?.[0]?.content?.parts?.length || 0,
        firstPartKeys: data.candidates?.[0]?.content?.parts?.[0]
          ? Object.keys(data.candidates[0].content.parts[0])
          : [],
        // 에러 체크
        errorMessage: data.error?.message,
        promptFeedback: data.promptFeedback,
      }, '[GeminiTTS] API 응답 구조 확인');

      // 응답에서 오디오 추출
      const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const audioData = inlineData?.data;
      const mimeType = inlineData?.mimeType || 'audio/pcm';

      // 🔥 mimeType 로깅 (디버깅용)
      logger.info({
        mimeType,
        hasData: !!audioData,
        dataLength: audioData?.length || 0,
      }, '[GeminiTTS] API 응답 mimeType 확인');

      if (!audioData) {
        // 🔥 상세 에러 정보 로깅
        logger.error({
          responseKeys: Object.keys(data),
          errorDetails: data.error,
          candidates: data.candidates?.map((c: any) => ({
            finishReason: c.finishReason,
            contentParts: c.content?.parts?.length,
          })),
        }, '[GeminiTTS] 오디오 데이터 없음 - 응답 구조 확인');
        throw new Error(`No audio data in response. Keys: ${Object.keys(data).join(', ')}`);
      }

      // Base64 → Buffer
      let audioBuffer = Buffer.from(audioData, 'base64');

      // 🔥 mimeType에 따른 처리
      // audio/pcm 또는 audio/raw: RAW PCM (헤더 없음) → 그대로 사용
      // audio/wav 또는 audio/wave: WAV 형식 (44바이트 헤더 있음) → 헤더 제거
      // audio/L16: 16-bit PCM → 그대로 사용
      if (mimeType === 'audio/wav' || mimeType === 'audio/wave') {
        // WAV 헤더 제거 (44바이트 또는 data chunk 시작 위치)
        const wavHeaderSize = this.findWavDataOffset(audioBuffer);
        logger.info({
          originalSize: audioBuffer.length,
          headerSize: wavHeaderSize,
        }, '[GeminiTTS] WAV 헤더 감지 - 제거 중');
        audioBuffer = audioBuffer.slice(wavHeaderSize);
      }

      // Buffer → ArrayBuffer
      const audioArrayBuffer = audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      );

      // 오디오 길이 추정 (Gemini TTS: 24kHz, 16-bit, mono)
      // 공식 문서: Sample Rate: 24000 Hz, Channels: 1 (mono), Sample Width: 2 bytes
      const estimatedLength = audioArrayBuffer.byteLength / (24000 * 2);

      logger.info({
        voice: selectedVoice.name,
        gender: selectedVoice.gender,
        audioSize: audioArrayBuffer.byteLength,
        estimatedLength: estimatedLength.toFixed(2),
      }, '[GeminiTTS] 음성 생성 완료');

      return {
        audio: audioArrayBuffer,
        audioLength: estimatedLength,
        voice: selectedVoice.name,
        gender: selectedVoice.gender,
      };
    } catch (error) {
      // 🔥 에러 메시지를 제대로 serialize
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
        errorMessage,
        voice: selectedVoice.name,
        errorStack: error instanceof Error ? error.stack : undefined,
      }, '[GeminiTTS] 음성 생성 실패');
      throw error;
    }
  }

  /**
   * 🔥 WAV 파일에서 "data" 청크의 시작 위치 찾기
   * WAV 형식: RIFF header (12 bytes) + fmt chunk + data chunk
   * data 청크는 "data" 문자열로 시작하고, 그 다음 4바이트는 데이터 크기
   * 실제 PCM 데이터는 "data" 문자열 + 4바이트 크기 정보 이후 시작
   */
  private findWavDataOffset(buffer: Buffer): number {
    // "data" 청크 검색 (ASCII: 0x64 0x61 0x74 0x61)
    const dataMarker = Buffer.from('data');
    for (let i = 0; i < Math.min(buffer.length - 8, 200); i++) {
      if (buffer.slice(i, i + 4).equals(dataMarker)) {
        // "data" + 4바이트 크기 정보 이후가 실제 PCM 데이터
        return i + 8;
      }
    }
    // 기본 WAV 헤더 크기 (표준 44바이트)
    return 44;
  }

  /**
   * Voice 목록 반환
   */
  listVoices(gender?: GeminiVoiceGender): Array<{ name: string; gender: string; style: string; description: string }> {
    if (gender && gender !== 'random') {
      return GEMINI_KOREAN_VOICES[gender].map(v => ({
        ...v,
        gender,
      }));
    }

    return [
      ...GEMINI_KOREAN_VOICES.female.map(v => ({ ...v, gender: 'female' as const })),
      ...GEMINI_KOREAN_VOICES.male.map(v => ({ ...v, gender: 'male' as const })),
    ];
  }

  /**
   * 추천 Voice 목록 반환
   */
  listNewsVoices(): typeof NEWS_SHORTS_RECOMMENDED {
    return NEWS_SHORTS_RECOMMENDED;
  }

  /**
   * 사용 가능한 Voice 목록 반환 (TTSProvider 인터페이스 호환)
   */
  listAvailableVoices(): string[] {
    return [
      ...GEMINI_KOREAN_VOICES.female.map(v => v.name),
      ...GEMINI_KOREAN_VOICES.male.map(v => v.name),
    ];
  }
}

export default GeminiTTS;
