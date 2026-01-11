/**
 * BGM Provider Interface
 *
 * 배경음악 생성 제공자(Loudly 등)가 구현해야 하는 인터페이스
 */

export type BGMGenre =
  | 'pop'
  | 'rock'
  | 'electronic'
  | 'hip-hop'
  | 'jazz'
  | 'classical'
  | 'ambient'
  | 'folk'
  | 'country'
  | 'latin'
  | 'cinematic'
  | 'lofi'
  | 'acoustic';

export type BGMMood =
  | 'happy'
  | 'sad'
  | 'energetic'
  | 'calm'
  | 'romantic'
  | 'dramatic'
  | 'dark'
  | 'uplifting'
  | 'mysterious'
  | 'playful'
  | 'nostalgic'
  | 'epic'
  | 'relaxing'
  | 'inspiring';

export interface BGMTrack {
  id: string;
  name: string;
  title: string;
  artist?: string;
  duration: number;           // 초 단위
  genre?: string;
  mood?: string;
  tempo?: number;             // BPM
  tags?: string[];
  path?: string;              // 로컬 경로
  url?: string;               // 원격 URL
  previewUrl?: string;
  audioUrl?: string;
}

export interface BGMOptions {
  duration?: number;          // 원하는 길이 (초)
  genre?: BGMGenre | string;
  mood?: BGMMood | string;
  tempo?: number | { min?: number; max?: number };  // BPM
  energy?: number;            // 0.0 ~ 1.0
  volume?: number;            // 0 ~ 1
  loop?: boolean;
  fadeIn?: number;            // 페이드인 (초)
  fadeOut?: number;           // 페이드아웃 (초)
  seekStart?: number;         // 시작 위치 (초) - 인트로 스킵용
}

export interface BGMResult {
  path: string;               // 출력 파일 경로
  duration: number;           // 실제 길이 (초)
  prompt: string;
  trackId?: string;
  trackTitle?: string;
  track?: BGMTrack;
  genre?: string;
  mood?: string;
  source: 'loudly' | 'local' | string;
  license?: string;
  processingTime?: number;
}

export interface IBGMProvider {
  /** Provider 이름 */
  readonly name: string;

  /** 프롬프트로 BGM 생성 */
  generate(
    prompt: string,
    outputPath: string,
    options?: BGMOptions
  ): Promise<BGMResult>;

  /** 프리셋으로 BGM 생성 */
  generateFromPreset?(
    presetId: string,
    outputPath: string,
    duration?: number
  ): Promise<BGMResult>;

  /** 분위기로 BGM 생성 */
  generateForMood?(
    mood: string,
    outputPath: string,
    duration?: number
  ): Promise<BGMResult>;

  /** 트랙 검색 */
  search?(options?: BGMOptions): Promise<BGMTrack[]>;

  /** 랜덤 BGM 가져오기 */
  getRandom?(outputPath: string, options?: BGMOptions): Promise<BGMResult>;

  /** 지원하는 장르 목록 */
  getSupportedGenres?(): BGMGenre[];

  /** 지원하는 분위기 목록 */
  getSupportedMoods?(): BGMMood[];

  /** 사용 가능 여부 확인 */
  isAvailable(): Promise<boolean>;
}
