/**
 * Subtitle Burner
 *
 * SRT 자막을 영상에 하드코딩합니다.
 * CatProject 스타일: 한글 폰트 + UTF-8 textfile 방식 + 큰 글씨
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../../logger';
import { BurnOptions, SubtitleStyle } from './types';

const execAsync = promisify(exec);

// 한글 폰트 경로 (CatProject와 동일)
const FONT_PATHS = [
  // Docker/Cloud Run paths (fonts-nanum package)
  '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
  '/usr/share/fonts/truetype/nanum/NanumGothic-Bold.ttf',
  // Local development paths
  '/home/akfldk1028/.fonts/NanumGothic-Bold.ttf',
  // Windows paths
  'C:/Windows/Fonts/malgun.ttf',
  'C:/Windows/Fonts/NanumGothic.ttf',
  // Fallback to DejaVu Sans
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
];

let cachedFontPath: string | null = null;

/**
 * 사용 가능한 한글 폰트 찾기
 */
function findAvailableFontPath(): string {
  if (cachedFontPath) return cachedFontPath;

  for (const fontPath of FONT_PATHS) {
    if (fs.existsSync(fontPath)) {
      logger.info({ fontPath }, '한글 폰트 발견');
      cachedFontPath = fontPath;
      return fontPath;
    }
  }

  logger.warn({ triedPaths: FONT_PATHS }, '한글 폰트를 찾을 수 없음');
  return FONT_PATHS[0];
}

export class SubtitleBurner {
  // Shorts 스타일: 큼직한 글씨 (74 → 90)
  private defaultStyle: SubtitleStyle = {
    titleColor: '#FFEB3B',  // 노란색 (Shorts 스타일)
    titleSize: 120,
    bodyColor: '#FFFFFF',
    bodySize: 90,           // 기존 74 → 90으로 증가
    position: 'bottom'
  };

  /**
   * 자막을 영상에 번인
   */
  async burn(options: BurnOptions): Promise<string> {
    const { videoPath, subtitlePath, outputPath, style } = options;
    const mergedStyle = { ...this.defaultStyle, ...style };

    logger.info({
      videoPath,
      subtitlePath,
      style: mergedStyle
    }, '자막 번인 시작');

    await fs.ensureDir(path.dirname(outputPath));

    const subtitleFilter = this.buildSubtitleFilter(subtitlePath, mergedStyle);

    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-vf "${subtitleFilter}"`,
      '-c:v libx264 -preset fast -crf 23',
      '-c:a copy',
      `"${outputPath}"`
    ].join(' ');

    logger.debug({ cmd }, 'FFmpeg 자막 번인 명령');

    await execAsync(cmd);

    logger.info({ outputPath }, '자막 번인 완료');
    return outputPath;
  }

  /**
   * 자막 필터 생성 (한글/영어 지원)
   *
   * CatProject 스타일: 언어별 폰트 + 큰 글씨 + 테두리
   *
   * @param subtitlePath SRT 파일 경로
   * @param style 자막 스타일 (language로 폰트 선택)
   */
  private buildSubtitleFilter(subtitlePath: string, style: SubtitleStyle): string {
    // Windows 경로 escape
    const escapedPath = subtitlePath
      .replace(/\\/g, '/')
      .replace(/:/g, '\\:');

    const fontColor = this.hexToASS(style.bodyColor);
    const outlineColor = '&H000000&';  // 검은색 테두리
    const fontSize = style.bodySize;
    const alignment = style.position === 'bottom' ? 2 : 6;
    const outline = style.outline ?? 4;
    const shadow = style.shadow ?? 2;

    // 언어별 폰트 선택
    const fontName = this.selectFontByLanguage(style.language || 'auto');

    logger.debug({
      language: style.language,
      fontName,
      fontSize,
      outline,
      shadow
    }, '자막 필터 생성');

    // Shorts 스타일: 큰 글씨 + 두꺼운 테두리 + 그림자
    return `subtitles='${escapedPath}':force_style='FontName=${fontName},FontSize=${fontSize},PrimaryColour=${fontColor},OutlineColour=${outlineColor},Outline=${outline},Shadow=${shadow},Alignment=${alignment},MarginV=80,Bold=1'`;
  }

  /**
   * 언어별 폰트 선택
   *
   * ko: 나눔고딕 (한글 지원)
   * en: Arial/Liberation Sans (영어)
   * auto: 플랫폼에 맞는 한글 폰트
   */
  private selectFontByLanguage(language: 'ko' | 'en' | 'auto'): string {
    const isWindows = process.platform === 'win32';

    switch (language) {
      case 'ko':
        // 한글 폰트
        return isWindows ? 'Malgun Gothic' : 'NanumGothicBold';

      case 'en':
        // 영어 폰트
        return isWindows ? 'Arial' : 'Liberation Sans';

      case 'auto':
      default:
        // 자동: 한글 폰트 사용 (한글+영어 모두 지원)
        return isWindows ? 'Malgun Gothic' : 'NanumGothicBold';
    }
  }

  /**
   * HEX 색상을 ASS 형식으로 변환
   */
  private hexToASS(hex: string): string {
    // #RRGGBB → &HBBGGRR&
    const clean = hex.replace('#', '');
    const r = clean.substring(0, 2);
    const g = clean.substring(2, 4);
    const b = clean.substring(4, 6);

    return `&H${b}${g}${r}&`;
  }

  /**
   * 자막 + 크롭 동시 처리
   *
   * -ss를 입력 후에 배치하여 타임스탬프를 보존 (자막 싱크 정확도 향상)
   */
  async burnWithCrop(
    videoPath: string,
    subtitlePath: string,
    outputPath: string,
    startSec: number,
    endSec: number,
    style?: Partial<SubtitleStyle>
  ): Promise<string> {
    const mergedStyle = { ...this.defaultStyle, ...style };
    const duration = endSec - startSec;

    logger.info({
      videoPath,
      subtitlePath,
      startSec,
      endSec,
      duration
    }, '크롭 + 자막 번인 동시 처리');

    await fs.ensureDir(path.dirname(outputPath));

    const cropFilter = 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=720:1280';
    const subtitleFilter = this.buildSubtitleFilter(subtitlePath, mergedStyle);

    // -ss를 입력 후에 배치하여 타임스탬프 보존 (자막 매칭 정확도)
    // -copyts로 원본 타임스탬프 유지, -start_at_zero로 출력 0부터 시작
    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      '-copyts',
      `-ss ${startSec}`,
      `-t ${duration}`,
      `-vf "${cropFilter},${subtitleFilter}"`,
      '-start_at_zero',
      '-c:v libx264 -preset fast -crf 23',
      '-c:a aac -b:a 128k',
      `"${outputPath}"`
    ].join(' ');

    logger.debug({ cmd }, 'FFmpeg 크롭+자막 명령');

    await execAsync(cmd);

    logger.info({ outputPath }, '크롭 + 자막 번인 완료');
    return outputPath;
  }

  /**
   * 크롭 전용 (자막 없이)
   */
  async cropOnly(
    videoPath: string,
    outputPath: string,
    startSec: number,
    endSec: number
  ): Promise<string> {
    const duration = endSec - startSec;

    logger.info({ videoPath, startSec, endSec }, '크롭 처리');

    await fs.ensureDir(path.dirname(outputPath));

    const cropFilter = 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=720:1280';

    const cmd = [
      'ffmpeg -y',
      `-ss ${startSec}`,
      `-i "${videoPath}"`,
      `-t ${duration}`,
      `-vf "${cropFilter}"`,
      '-c:v libx264 -preset fast -crf 23',
      '-c:a aac -b:a 128k',
      `"${outputPath}"`
    ].join(' ');

    await execAsync(cmd);

    logger.info({ outputPath }, '크롭 완료');
    return outputPath;
  }

  /**
   * 여러 클립을 하나의 영상으로 결합
   *
   * concat demuxer 사용 (재인코딩 없이 빠르게 결합)
   */
  async combineClips(
    clipPaths: string[],
    outputPath: string
  ): Promise<string> {
    if (clipPaths.length === 0) {
      throw new Error('결합할 클립이 없습니다');
    }

    if (clipPaths.length === 1) {
      // 클립이 하나면 복사만
      await fs.copy(clipPaths[0], outputPath);
      return outputPath;
    }

    logger.info({
      clipCount: clipPaths.length,
      outputPath
    }, '클립 결합 시작');

    await fs.ensureDir(path.dirname(outputPath));

    // filter_complex 방식 사용 (가장 안정적)
    return this.combineClipsWithReencode(clipPaths, outputPath);
  }

  /**
   * 클립 결합 (재인코딩 방식 - 안전하지만 느림)
   */
  private async combineClipsWithReencode(
    clipPaths: string[],
    outputPath: string
  ): Promise<string> {
    // 여러 입력 파일과 filter_complex 사용
    const inputs = clipPaths.map(p => `-i "${p}"`).join(' ');
    const filterParts = clipPaths.map((_, i) => `[${i}:v:0][${i}:a:0]`).join('');
    const filterComplex = `${filterParts}concat=n=${clipPaths.length}:v=1:a=1[outv][outa]`;

    // preset ultrafast + fps 30으로 프레임 레이트 통일 (싱크 문제 해결)
    const cmd = [
      'ffmpeg -y',
      inputs,
      `-filter_complex "${filterComplex}"`,
      '-map "[outv]" -map "[outa]"',
      '-c:v libx264 -preset ultrafast -crf 23 -r 30',
      '-c:a aac -b:a 128k',
      '-threads 0',
      `"${outputPath}"`
    ].join(' ');

    logger.debug({ cmd }, 'FFmpeg 재인코딩 결합 명령 (ultrafast)');

    await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

    logger.info({ outputPath }, '클립 결합 완료 (재인코딩)');
    return outputPath;
  }
}
