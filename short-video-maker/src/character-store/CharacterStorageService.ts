/**
 * Character Storage Service
 * GCS 기반 캐릭터 프로필 저장 및 관리
 */

import { Storage, Bucket } from '@google-cloud/storage';
import { logger } from '../logger';
import { Config } from '../config';
import {
  Character,
  CharacterProfile,
  CreateProfileRequest,
  UpdateProfileRequest,
  AddCharacterRequest,
  UpdateCharacterRequest,
  StorageResponse,
  ProfileListResponse,
} from './types';

const CHARACTERS_FOLDER = 'characters';
const PROFILE_FILE = 'profile.json';
const IMAGES_FOLDER = 'images';

export class CharacterStorageService {
  private storage!: Storage;
  private bucket!: Bucket;
  private config: Config;
  private initialized: boolean = false;

  constructor(config: Config) {
    this.config = config;

    if (!config.gcsBucketName) {
      logger.warn('GCS_BUCKET_NAME not set, character storage will be disabled');
      return;
    }

    this.storage = new Storage({
      projectId: config.googleCloudProjectId,
    });

    this.bucket = this.storage.bucket(config.gcsBucketName);
    this.initialized = true;

    logger.info(
      { bucket: config.gcsBucketName },
      'Character Storage Service initialized'
    );
  }

  /**
   * 서비스 사용 가능 여부 확인
   */
  isEnabled(): boolean {
    return this.initialized;
  }

  /**
   * 프로필 생성
   */
  async createProfile(request: CreateProfileRequest): Promise<StorageResponse<CharacterProfile>> {
    if (!this.initialized) {
      return { success: false, error: 'Character storage not initialized' };
    }

    try {
      // 기존 프로필 존재 여부 확인
      const existing = await this.getProfile(request.profileId);
      if (existing.success && existing.data) {
        return { success: false, error: `Profile ${request.profileId} already exists` };
      }

      const now = new Date().toISOString();
      const profile: CharacterProfile = {
        profileId: request.profileId,
        name: request.name,
        description: request.description,
        channelName: request.channelName,
        characters: [],
        defaultStyle: request.defaultStyle,
        defaultMood: request.defaultMood,
        createdAt: now,
        updatedAt: now,
      };

      // 캐릭터 추가 (이미지 저장 포함)
      for (const charReq of request.characters) {
        const character = await this.processCharacter(request.profileId, charReq);
        profile.characters.push(character);
      }

      // 프로필 저장
      await this.saveProfile(profile);

      logger.info(
        { profileId: request.profileId, characterCount: profile.characters.length },
        'Character profile created'
      );

      return { success: true, data: profile };
    } catch (error) {
      logger.error({ error, profileId: request.profileId }, 'Failed to create profile');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * 프로필 조회
   */
  async getProfile(profileId: string): Promise<StorageResponse<CharacterProfile>> {
    if (!this.initialized) {
      return { success: false, error: 'Character storage not initialized' };
    }

    try {
      const filePath = `${CHARACTERS_FOLDER}/${profileId}/${PROFILE_FILE}`;
      const file = this.bucket.file(filePath);

      const [exists] = await file.exists();
      if (!exists) {
        return { success: false, error: `Profile ${profileId} not found` };
      }

      const [content] = await file.download();
      const profile: CharacterProfile = JSON.parse(content.toString());

      return { success: true, data: profile };
    } catch (error) {
      logger.error({ error, profileId }, 'Failed to get profile');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * 모든 프로필 목록 조회
   */
  async listProfiles(): Promise<StorageResponse<ProfileListResponse>> {
    if (!this.initialized) {
      return { success: false, error: 'Character storage not initialized' };
    }

    try {
      // GCS에서 delimiter 사용 시 폴더 목록은 apiResponse.prefixes에 반환됨
      const [files, , apiResponse] = await this.bucket.getFiles({
        prefix: `${CHARACTERS_FOLDER}/`,
        delimiter: '/',
      });

      // 폴더 목록 추출 (프로필 ID)
      const profileIds = new Set<string>();

      // 방법 1: apiResponse.prefixes에서 폴더 추출 (권장)
      const prefixes = (apiResponse as { prefixes?: string[] })?.prefixes;
      if (prefixes && Array.isArray(prefixes)) {
        for (const prefix of prefixes) {
          // prefix 형식: "characters/otter-couple/"
          const parts = prefix.split('/');
          if (parts.length >= 2 && parts[1]) {
            profileIds.add(parts[1]);
          }
        }
      }

      // 방법 2: files에서도 추출 시도 (fallback)
      for (const file of files) {
        const parts = file.name.split('/');
        if (parts.length >= 2 && parts[1]) {
          profileIds.add(parts[1]);
        }
      }

      // 각 프로필 로드
      const profiles: CharacterProfile[] = [];
      for (const profileId of profileIds) {
        const result = await this.getProfile(profileId);
        if (result.success && result.data) {
          profiles.push(result.data);
        }
      }

      logger.debug({ profileCount: profiles.length, profileIds: Array.from(profileIds) }, 'Listed profiles');

      return {
        success: true,
        data: {
          profiles,
          total: profiles.length,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to list profiles');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * 프로필 업데이트
   */
  async updateProfile(
    profileId: string,
    request: UpdateProfileRequest
  ): Promise<StorageResponse<CharacterProfile>> {
    if (!this.initialized) {
      return { success: false, error: 'Character storage not initialized' };
    }

    try {
      const existing = await this.getProfile(profileId);
      if (!existing.success || !existing.data) {
        return { success: false, error: `Profile ${profileId} not found` };
      }

      const profile = existing.data;

      // 업데이트 적용
      if (request.name !== undefined) profile.name = request.name;
      if (request.description !== undefined) profile.description = request.description;
      if (request.channelName !== undefined) profile.channelName = request.channelName;
      if (request.defaultStyle !== undefined) profile.defaultStyle = request.defaultStyle;
      if (request.defaultMood !== undefined) profile.defaultMood = request.defaultMood;

      profile.updatedAt = new Date().toISOString();

      await this.saveProfile(profile);

      logger.info({ profileId }, 'Profile updated');
      return { success: true, data: profile };
    } catch (error) {
      logger.error({ error, profileId }, 'Failed to update profile');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * 프로필 삭제
   */
  async deleteProfile(profileId: string): Promise<StorageResponse<void>> {
    if (!this.initialized) {
      return { success: false, error: 'Character storage not initialized' };
    }

    try {
      const prefix = `${CHARACTERS_FOLDER}/${profileId}/`;
      const [files] = await this.bucket.getFiles({ prefix });

      // 모든 관련 파일 삭제
      await Promise.all(files.map((file) => file.delete()));

      logger.info({ profileId, deletedFiles: files.length }, 'Profile deleted');
      return { success: true };
    } catch (error) {
      logger.error({ error, profileId }, 'Failed to delete profile');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * 캐릭터 추가
   */
  async addCharacter(
    profileId: string,
    request: AddCharacterRequest
  ): Promise<StorageResponse<Character>> {
    if (!this.initialized) {
      return { success: false, error: 'Character storage not initialized' };
    }

    try {
      const profileResult = await this.getProfile(profileId);
      if (!profileResult.success || !profileResult.data) {
        return { success: false, error: `Profile ${profileId} not found` };
      }

      const profile = profileResult.data;

      // 중복 확인
      if (profile.characters.some((c) => c.id === request.id)) {
        return { success: false, error: `Character ${request.id} already exists in profile` };
      }

      // 캐릭터 처리 (이미지 저장 포함)
      const character = await this.processCharacter(profileId, request);
      profile.characters.push(character);
      profile.updatedAt = new Date().toISOString();

      await this.saveProfile(profile);

      logger.info({ profileId, characterId: request.id }, 'Character added to profile');
      return { success: true, data: character };
    } catch (error) {
      logger.error({ error, profileId, characterId: request.id }, 'Failed to add character');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * 캐릭터 업데이트
   */
  async updateCharacter(
    profileId: string,
    characterId: string,
    request: UpdateCharacterRequest
  ): Promise<StorageResponse<Character>> {
    if (!this.initialized) {
      return { success: false, error: 'Character storage not initialized' };
    }

    try {
      const profileResult = await this.getProfile(profileId);
      if (!profileResult.success || !profileResult.data) {
        return { success: false, error: `Profile ${profileId} not found` };
      }

      const profile = profileResult.data;
      const charIndex = profile.characters.findIndex((c) => c.id === characterId);

      if (charIndex === -1) {
        return { success: false, error: `Character ${characterId} not found in profile` };
      }

      const character = profile.characters[charIndex];

      // 업데이트 적용
      if (request.name !== undefined) character.name = request.name;
      if (request.description !== undefined) character.description = request.description;
      if (request.style !== undefined) character.style = request.style;
      if (request.distinguishingFeatures !== undefined) {
        character.distinguishingFeatures = request.distinguishingFeatures;
      }

      // 새 이미지가 제공된 경우
      if (request.referenceImageBase64) {
        const imageUrl = await this.saveImage(
          profileId,
          characterId,
          request.referenceImageBase64
        );
        character.referenceImageUrl = imageUrl;
        delete character.referenceImageBase64;
      }

      profile.updatedAt = new Date().toISOString();
      await this.saveProfile(profile);

      logger.info({ profileId, characterId }, 'Character updated');
      return { success: true, data: character };
    } catch (error) {
      logger.error({ error, profileId, characterId }, 'Failed to update character');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * 캐릭터 삭제
   */
  async deleteCharacter(profileId: string, characterId: string): Promise<StorageResponse<void>> {
    if (!this.initialized) {
      return { success: false, error: 'Character storage not initialized' };
    }

    try {
      const profileResult = await this.getProfile(profileId);
      if (!profileResult.success || !profileResult.data) {
        return { success: false, error: `Profile ${profileId} not found` };
      }

      const profile = profileResult.data;
      const charIndex = profile.characters.findIndex((c) => c.id === characterId);

      if (charIndex === -1) {
        return { success: false, error: `Character ${characterId} not found in profile` };
      }

      // 이미지 파일 삭제
      const imagePath = `${CHARACTERS_FOLDER}/${profileId}/${IMAGES_FOLDER}/${characterId}.png`;
      try {
        await this.bucket.file(imagePath).delete();
      } catch {
        // 이미지가 없을 수도 있음
      }

      // 캐릭터 제거
      profile.characters.splice(charIndex, 1);
      profile.updatedAt = new Date().toISOString();

      await this.saveProfile(profile);

      logger.info({ profileId, characterId }, 'Character deleted from profile');
      return { success: true };
    } catch (error) {
      logger.error({ error, profileId, characterId }, 'Failed to delete character');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * 캐릭터 레퍼런스 이미지 URL 생성 (Signed URL)
   */
  async getCharacterImageUrl(
    profileId: string,
    characterId: string,
    expiresInMinutes: number = 60
  ): Promise<StorageResponse<string>> {
    if (!this.initialized) {
      return { success: false, error: 'Character storage not initialized' };
    }

    try {
      const imagePath = `${CHARACTERS_FOLDER}/${profileId}/${IMAGES_FOLDER}/${characterId}.png`;
      const file = this.bucket.file(imagePath);

      const [exists] = await file.exists();
      if (!exists) {
        return { success: false, error: `Image not found for character ${characterId}` };
      }

      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresInMinutes * 60 * 1000,
      });

      return { success: true, data: signedUrl };
    } catch (error) {
      logger.error({ error, profileId, characterId }, 'Failed to get character image URL');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * 프로필의 모든 캐릭터 이미지를 Base64로 로드
   */
  async loadCharacterImages(profileId: string): Promise<StorageResponse<Map<string, string>>> {
    if (!this.initialized) {
      return { success: false, error: 'Character storage not initialized' };
    }

    try {
      const profileResult = await this.getProfile(profileId);
      if (!profileResult.success || !profileResult.data) {
        return { success: false, error: `Profile ${profileId} not found` };
      }

      const imageMap = new Map<string, string>();

      for (const character of profileResult.data.characters) {
        if (character.referenceImageUrl) {
          try {
            const imagePath = `${CHARACTERS_FOLDER}/${profileId}/${IMAGES_FOLDER}/${character.id}.png`;
            const file = this.bucket.file(imagePath);
            const [exists] = await file.exists();

            if (exists) {
              const [content] = await file.download();
              imageMap.set(character.id, content.toString('base64'));
            }
          } catch (err) {
            logger.warn({ characterId: character.id, error: err }, 'Failed to load character image');
          }
        }
      }

      return { success: true, data: imageMap };
    } catch (error) {
      logger.error({ error, profileId }, 'Failed to load character images');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ============ Private Methods ============

  /**
   * 캐릭터 처리 (이미지 저장 포함)
   */
  private async processCharacter(
    profileId: string,
    request: AddCharacterRequest
  ): Promise<Character> {
    const character: Character = {
      id: request.id,
      name: request.name,
      description: request.description,
      style: request.style,
      distinguishingFeatures: request.distinguishingFeatures,
    };

    // 이미지가 제공된 경우 저장
    if (request.referenceImageBase64) {
      const imageUrl = await this.saveImage(profileId, request.id, request.referenceImageBase64);
      character.referenceImageUrl = imageUrl;
    }

    return character;
  }

  /**
   * 프로필 JSON 저장
   */
  private async saveProfile(profile: CharacterProfile): Promise<void> {
    const filePath = `${CHARACTERS_FOLDER}/${profile.profileId}/${PROFILE_FILE}`;
    const file = this.bucket.file(filePath);

    await file.save(JSON.stringify(profile, null, 2), {
      contentType: 'application/json',
    });
  }

  /**
   * 이미지 저장
   */
  private async saveImage(
    profileId: string,
    characterId: string,
    base64Data: string
  ): Promise<string> {
    // Base64 헤더 제거
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    const imagePath = `${CHARACTERS_FOLDER}/${profileId}/${IMAGES_FOLDER}/${characterId}.png`;
    const file = this.bucket.file(imagePath);

    await file.save(buffer, {
      contentType: 'image/png',
    });

    // GCS 경로 반환
    return `gs://${this.config.gcsBucketName}/${imagePath}`;
  }
}
