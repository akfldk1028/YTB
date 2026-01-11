/**
 * Sound Effects Provider Interface
 *
 * 효과음 생성 제공자(ElevenLabs, Freesound 등)가 구현해야 하는 인터페이스
 */

export interface SoundEffectPreset {
  id: string;
  name: string;
  query: string;              // 검색 쿼리 또는 프롬프트
  duration?: number;          // 기본 길이 (초)
  description?: string;
}

export interface SoundEffectOptions {
  duration?: number;          // 원하는 길이 (초)
  volume?: number;            // 0 ~ 1
  promptInfluence?: number;   // ElevenLabs: 0 ~ 1
  fadeIn?: number;            // 페이드인 (초)
  fadeOut?: number;           // 페이드아웃 (초)
  format?: 'mp3' | 'wav';
}

export interface SoundEffectResult {
  path: string;               // 출력 파일 경로
  duration: number;           // 실제 길이 (초)
  description: string;        // 사용된 프롬프트/쿼리
  source: string;             // 'elevenlabs' | 'freesound'
  preset?: string;
  query?: string;
  soundId?: number;           // Freesound specific
  soundName?: string;         // Freesound specific
  license?: string;           // 라이선스 정보
  processingTime?: number;    // ms 단위
}

export interface ISoundEffectsProvider {
  /** Provider 이름 */
  readonly name: string;

  /** 프리셋 ID로 효과음 생성 */
  generateFromPreset(
    presetId: string,
    outputPath: string,
    options?: SoundEffectOptions
  ): Promise<SoundEffectResult>;

  /** 텍스트 설명으로 효과음 생성 */
  generateFromText(
    description: string,
    outputPath: string,
    options?: SoundEffectOptions
  ): Promise<SoundEffectResult>;

  /** 지원하는 프리셋 목록 */
  getPresets(): SoundEffectPreset[];

  /** 사용 가능 여부 확인 */
  isAvailable(): Promise<boolean>;
}
