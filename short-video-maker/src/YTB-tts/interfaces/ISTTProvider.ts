/**
 * STT (Speech-to-Text) Provider Interface
 *
 * 음성 인식 제공자(Whisper 등)가 구현해야 하는 인터페이스
 */

export interface STTWord {
  word: string;
  start: number;        // 시작 시간 (초)
  end: number;          // 종료 시간 (초)
  confidence?: number;  // 신뢰도 (0~1)
}

export interface STTSegment {
  text: string;
  start: number;
  end: number;
  words?: STTWord[];
}

export interface STTOptions {
  language?: string;           // 'ko', 'en' 등
  model?: string;              // 'base', 'small', 'medium', 'large'
  wordTimestamps?: boolean;    // 단어별 타임스탬프
  maxDuration?: number;        // 최대 처리 시간 (초)
}

export interface STTResult {
  text: string;                // 전체 텍스트
  segments: STTSegment[];      // 세그먼트별 결과
  language: string;            // 감지된 언어
  duration: number;            // 오디오 길이 (초)
}

export interface ISTTProvider {
  /** Provider 이름 */
  readonly name: string;

  /** 오디오 파일을 텍스트로 변환 */
  transcribe(audioPath: string, options?: STTOptions): Promise<STTResult>;

  /** 지원 언어 목록 */
  getSupportedLanguages(): string[];

  /** 사용 가능 여부 확인 */
  isAvailable(): Promise<boolean>;
}
