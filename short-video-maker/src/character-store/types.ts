/**
 * Character Store Types
 * 채널별 캐릭터 저장 및 관리를 위한 타입 정의
 */

/**
 * 개별 캐릭터 정의
 */
export interface Character {
  /** 캐릭터 고유 ID (예: "husband", "wife") */
  id: string;

  /** 캐릭터 이름 (예: "남편 수달", "아내 수달") */
  name: string;

  /** Nano Banana용 캐릭터 설명 (프롬프트) */
  description: string;

  /** 캐릭터 스타일 (예: "pixar", "anime", "realistic") */
  style?: string;

  /** 캐릭터 구분 특징 (예: "pink ribbon on head") */
  distinguishingFeatures?: string;

  /** 레퍼런스 이미지 URL (GCS) */
  referenceImageUrl?: string;

  /** 레퍼런스 이미지 Base64 (임시 저장용) */
  referenceImageBase64?: string;

  /** 추가 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 채널 캐릭터 프로필 (여러 캐릭터 포함)
 */
export interface CharacterProfile {
  /** 프로필 고유 ID (예: "otter-couple") */
  profileId: string;

  /** 프로필 이름 (예: "수달 부부") */
  name: string;

  /** 프로필 설명 */
  description?: string;

  /** 연결된 YouTube 채널 이름 (optional) */
  channelName?: string;

  /** 캐릭터 목록 */
  characters: Character[];

  /** 기본 스타일 (모든 캐릭터에 적용) */
  defaultStyle?: string;

  /** 기본 분위기 */
  defaultMood?: string;

  /** 생성 일시 */
  createdAt: string;

  /** 수정 일시 */
  updatedAt: string;

  /** 추가 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 캐릭터 생성 요청
 */
export interface CreateCharacterRequest {
  /** 캐릭터 ID */
  id: string;

  /** 캐릭터 이름 */
  name: string;

  /** 캐릭터 설명 */
  description: string;

  /** 스타일 (optional) */
  style?: string;

  /** 구분 특징 (optional) */
  distinguishingFeatures?: string;

  /** 레퍼런스 이미지 Base64 (optional) */
  referenceImageBase64?: string;
}

/**
 * 프로필 생성 요청
 */
export interface CreateProfileRequest {
  /** 프로필 ID */
  profileId: string;

  /** 프로필 이름 */
  name: string;

  /** 설명 (optional) */
  description?: string;

  /** 연결된 채널 이름 (optional) */
  channelName?: string;

  /** 캐릭터 목록 */
  characters: CreateCharacterRequest[];

  /** 기본 스타일 (optional) */
  defaultStyle?: string;

  /** 기본 분위기 (optional) */
  defaultMood?: string;
}

/**
 * 프로필 업데이트 요청
 */
export interface UpdateProfileRequest {
  /** 프로필 이름 (optional) */
  name?: string;

  /** 설명 (optional) */
  description?: string;

  /** 연결된 채널 이름 (optional) */
  channelName?: string;

  /** 기본 스타일 (optional) */
  defaultStyle?: string;

  /** 기본 분위기 (optional) */
  defaultMood?: string;
}

/**
 * 캐릭터 추가 요청
 */
export interface AddCharacterRequest extends CreateCharacterRequest {}

/**
 * 캐릭터 업데이트 요청
 */
export interface UpdateCharacterRequest {
  /** 캐릭터 이름 (optional) */
  name?: string;

  /** 캐릭터 설명 (optional) */
  description?: string;

  /** 스타일 (optional) */
  style?: string;

  /** 구분 특징 (optional) */
  distinguishingFeatures?: string;

  /** 레퍼런스 이미지 Base64 (optional) */
  referenceImageBase64?: string;
}

/**
 * Consistent Shorts에서 사용할 캐릭터 참조
 */
export interface CharacterReference {
  /** 프로필 ID */
  profileId: string;

  /** 특정 캐릭터만 사용할 경우 ID 목록 (optional) */
  characterIds?: string[];

  /** 씬별 캐릭터 지정 (optional) */
  sceneCharacterMap?: Record<number, string[]>;
}

/**
 * 스토리지 응답 타입
 */
export interface StorageResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 프로필 목록 응답
 */
export interface ProfileListResponse {
  profiles: CharacterProfile[];
  total: number;
}
