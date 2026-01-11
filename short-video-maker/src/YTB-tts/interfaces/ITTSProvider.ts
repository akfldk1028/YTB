/**
 * TTS Provider Interface
 *
 * 모든 TTS 제공자(ElevenLabs, Google 등)가 구현해야 하는 인터페이스
 */

export interface TTSVoice {
  id: string;
  name: string;
  language?: string;
  gender?: 'male' | 'female' | 'neutral';
  description?: string;
  previewUrl?: string;
}

export interface TTSOptions {
  voiceId?: string;           // Voice ID
  voice?: string;             // Voice name (alias for voiceId)
  model?: string;             // Model ID (e.g., 'eleven_multilingual_v2')
  speed?: number;             // 0.5 ~ 2.0
  pitch?: number;             // -20 ~ 20
  volume?: number;            // 0 ~ 1
  language?: string;          // 'ko-KR', 'en-US' 등
  outputFormat?: 'mp3' | 'wav' | 'ogg';

  // ElevenLabs specific
  stability?: number;         // 0 ~ 1
  similarityBoost?: number;   // 0 ~ 1
  style?: number;             // 0 ~ 1
  speakerBoost?: boolean;

  // Google specific
  volumeGainDb?: number;      // -96 ~ 16
  effectsProfileId?: string[];
}

export interface TTSResult {
  path: string;               // 출력 파일 경로
  duration: number;           // 초 단위
  text: string;
  voiceId?: string;
  voice?: string;
  model?: string;
  language?: string;
  processingTime?: number;    // ms 단위
}

export interface ITTSProvider {
  /** Provider 이름 */
  readonly name: string;

  /** 지원하는 음성 목록 조회 */
  getVoices(): Promise<TTSVoice[]>;

  /** 텍스트를 음성으로 변환 */
  synthesize(text: string, outputPath: string, options?: TTSOptions): Promise<TTSResult>;

  /** 여러 텍스트를 일괄 변환 */
  synthesizeBatch?(texts: string[], outputDir: string, options?: TTSOptions): Promise<TTSResult[]>;

  /** 사용 가능 여부 확인 (API 키 등) */
  isAvailable(): Promise<boolean>;
}
