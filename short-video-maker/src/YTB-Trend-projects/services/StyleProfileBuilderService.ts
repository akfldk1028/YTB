/**
 * StyleProfileBuilderService (Node 3)
 * StyleDNA → TrendStyleProfile 변환 (순수 함수, 외부 API 없음)
 *
 * Input:  StyleDNA + 소스 메타데이터
 * Output: TrendStyleProfile
 *
 * 매핑:
 *   - audioProfile.narratorGender → GeminiTTS voice (male→Charon, female→Leda)
 *   - visualStyle → 이미지 생성 프롬프트 프리픽스
 *   - motionProfile → Ken Burns / Grok 모션 힌트
 *   - technicalSpecs → 씬 타이밍 규칙
 */

import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../config';
import type { StyleDNA, TrendStyleProfile } from '../types';

export class StyleProfileBuilderService {
  private profilesDir: string;

  constructor(profilesDir: string) {
    this.profilesDir = profilesDir;
  }

  build(
    styleDNA: StyleDNA,
    sourceUrl: string,
    sourceChannel: string,
  ): TrendStyleProfile {
    const id = `trend_${Date.now()}`;

    // TTS voice 선택
    const gender = styleDNA.audioProfile.narratorGender || 'male';
    const voice = gender === 'female' ? 'Leda' : 'Charon';

    // 이미지 생성 프롬프트 구성
    const colorHint = styleDNA.visualStyle.colorPalette.slice(0, 3).join(', ');
    const bgHint = styleDNA.visualStyle.backgroundType;
    const compHint = styleDNA.visualStyle.composition;

    const narrativePrefix = `${compHint}, ${bgHint} background, color palette: ${colorHint}. ` +
      `${styleDNA.visualStyle.characterPresence}. `;

    const educationalPrefix = `Clean educational illustration, ${bgHint} background, ` +
      `${compHint}, colors: ${colorHint}. No characters, focus on concept visualization. `;

    const globalSuffix = `${styleDNA.visualStyle.transitionStyle} transitions. High quality, detailed. ` +
      'No text, no watermarks, no logos.';

    // 모션 스타일
    const motionStyle = this.mapMotionStyle(styleDNA.motionProfile);
    const paceInstruction = this.mapPace(styleDNA.motionProfile.pace);

    // 씬 타이밍
    const avgDuration = styleDNA.technicalSpecs.typicalSceneDuration || 6;
    const sceneTimingRules = {
      hookDuration: Math.min(avgDuration + 1, 8),
      explanationDuration: avgDuration,
      conclusionDuration: Math.min(avgDuration + 1, 8),
    };

    // TTS 스타일 프롬프트
    const toneHint = styleDNA.audioProfile.narratorTone || '';
    const stylePrompt = `Speak in a ${toneHint} tone. Natural Korean pronunciation.`;

    const profile: TrendStyleProfile = {
      id,
      displayName: `Style from ${sourceChannel}`,
      sourceUrl,
      sourceChannel,
      createdAt: new Date().toISOString(),
      imageGeneration: {
        narrativePrefix,
        educationalPrefix,
        globalSuffix,
      },
      videoGeneration: {
        motionStyle,
        paceInstruction,
      },
      ttsConfig: {
        voice,
        gender,
        stylePrompt,
      },
      sceneTimingRules,
      styleDNA,
    };

    logger.info({
      id,
      voice,
      gender,
      motionStyle,
      hookDuration: sceneTimingRules.hookDuration,
    }, '[ProfileBuilder] Profile built');

    return profile;
  }

  /** 프로필을 JSON 파일로 저장 */
  async save(profile: TrendStyleProfile): Promise<string> {
    await fs.ensureDir(this.profilesDir);
    const filePath = path.join(this.profilesDir, `${profile.id}.json`);
    await fs.writeJSON(filePath, profile, { spaces: 2 });
    logger.info({ filePath }, '[ProfileBuilder] Profile saved');
    return filePath;
  }

  /** 저장된 프로필 로드 */
  async load(profileId: string): Promise<TrendStyleProfile | null> {
    const filePath = path.join(this.profilesDir, `${profileId}.json`);
    if (!await fs.pathExists(filePath)) {
      return null;
    }
    return fs.readJSON(filePath);
  }

  /** 저장된 모든 프로필 목록 */
  async listProfiles(): Promise<Array<{ id: string; displayName: string; sourceChannel: string; createdAt: string }>> {
    await fs.ensureDir(this.profilesDir);
    const files = await fs.readdir(this.profilesDir);
    const profiles: Array<{ id: string; displayName: string; sourceChannel: string; createdAt: string }> = [];

    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const data = await fs.readJSON(path.join(this.profilesDir, f));
        profiles.push({
          id: data.id,
          displayName: data.displayName,
          sourceChannel: data.sourceChannel,
          createdAt: data.createdAt,
        });
      } catch {
        // 파싱 실패 무시
      }
    }

    return profiles.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private mapMotionStyle(motion: StyleDNA['motionProfile']): string {
    const cam = motion.cameraMovement.toLowerCase();
    if (cam.includes('static') || cam.includes('still')) return 'zoom_in';
    if (cam.includes('zoom')) return 'zoom_in';
    if (cam.includes('pan')) return 'pan_right';
    if (cam.includes('track') || cam.includes('dynamic')) return 'zoom_out';
    return 'zoom_in'; // 기본
  }

  private mapPace(pace: string): string {
    const p = pace.toLowerCase();
    if (p.includes('fast')) return 'Quick cuts, energetic pacing';
    if (p.includes('slow')) return 'Slow, deliberate movements with lingering shots';
    return 'Medium pacing with natural rhythm';
  }
}
