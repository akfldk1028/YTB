/**
 * CharacterHelper - 캐릭터 관련 유틸리티 서비스
 *
 * ConsistentShortsWorkflow에서 분리된 캐릭터 관련 로직
 * - buildCharacterDescription: 캐릭터 설명 생성
 * - getSceneCharacterImages: 씬별 캐릭터 이미지 조회
 * - buildMultiCharacterPrompt: 다중 캐릭터 프롬프트 생성
 *
 * @author Refactored from ConsistentShortsWorkflow.ts
 * @date 2026-01-19
 */

import { logger } from "../../logger";
import type { CharacterProfile, Character } from "../../character-store/types";
import type { SceneCharacterImages, CharacterImageInfo } from "../../types/shorts";

/**
 * CharacterHelper 클래스
 * 캐릭터 설명, 이미지, 프롬프트 생성 담당
 */
export class CharacterHelper {
  /**
   * Build character description from stored profile
   */
  buildCharacterDescription(profile: CharacterProfile, characters: Character[]): string {
    const descriptions = characters.map(c => {
      let desc = c.description;
      if (c.distinguishingFeatures) {
        desc += `. Distinguishing features: ${c.distinguishingFeatures}`;
      }
      return `${c.name}: ${desc}`;
    });

    let fullDescription = descriptions.join('\n');
    if (profile.defaultStyle) {
      fullDescription += `\nStyle: ${profile.defaultStyle}`;
    }
    if (profile.defaultMood) {
      fullDescription += `\nMood: ${profile.defaultMood}`;
    }

    return fullDescription;
  }

  /**
   * ⭐ Get all character images for a scene (supports N characters)
   * @param characterIds - Array of character IDs for this scene
   * @param imageMap - Map of characterId → image data
   * @returns SceneCharacterImages with all available character images
   */
  getSceneCharacterImages(
    characterIds: string[],
    imageMap: Map<string, { data: Buffer; mimeType: string; description: string }>
  ): SceneCharacterImages {
    const images: CharacterImageInfo[] = [];

    for (const characterId of characterIds) {
      const imageData = imageMap.get(characterId);
      if (imageData) {
        images.push({
          characterId,
          data: imageData.data,
          mimeType: imageData.mimeType,
          description: imageData.description
        });
      } else {
        logger.warn({ characterId }, "⚠️ Character image not found in map");
      }
    }

    const result: SceneCharacterImages = {
      characterIds,
      images,
      isSingleCharacter: images.length === 1,
      isMultiCharacter: images.length > 1,
      characterCount: images.length
    };

    logger.debug({
      requestedCharacters: characterIds.length,
      foundCharacters: images.length,
      characterIds: images.map(img => img.characterId)
    }, "📸 Got scene character images");

    return result;
  }

  /**
   * ⭐ Build prompt for multi-character scene
   * Combines all character descriptions with the scene prompt
   * @param sceneCharacters - SceneCharacterImages with character info
   * @param scenePrompt - Original scene prompt/description
   * @param style - Image generation style
   * @param mood - Image generation mood
   * @returns Enhanced prompt for NANO BANANA
   */
  buildMultiCharacterPrompt(
    sceneCharacters: SceneCharacterImages,
    scenePrompt: string,
    style: string = "pixar",
    mood: string = "dynamic"
  ): string {
    // Build character descriptions
    const characterDescriptions = sceneCharacters.images
      .map(img => `[${img.characterId}]: ${img.description}`)
      .join('\n');

    // Combine into enhanced prompt
    const enhancedPrompt = `Scene with ${sceneCharacters.characterCount} characters together:
${characterDescriptions}

Scene: ${scenePrompt}
Style: ${style}
Mood: ${mood}

IMPORTANT: Show ALL ${sceneCharacters.characterCount} characters together in the same scene. Maintain each character's unique appearance and features.`;

    logger.debug({
      characterCount: sceneCharacters.characterCount,
      characterIds: sceneCharacters.characterIds,
      promptLength: enhancedPrompt.length
    }, "📝 Built multi-character prompt");

    return enhancedPrompt;
  }
}

// 싱글톤 인스턴스 export
export const characterHelper = new CharacterHelper();
