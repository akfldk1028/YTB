/**
 * Text Overlay Processor
 *
 * 정적 텍스트와 동적 자막을 영상에 오버레이하는 프로세서
 * FFmpeg를 사용하여 처리
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { logger } from '../../../logger';
import {
  OverlayOptions,
  OverlayMode,
  StaticTextOptions,
  DynamicSubtitleOptions,
  DEFAULT_STATIC_OPTIONS,
  DEFAULT_DYNAMIC_OPTIONS
} from './types';

const execAsync = promisify(exec);

// 한글 폰트 경로 (Docker/Local/Windows 지원)
const FONT_PATHS = [
  // Docker/Cloud Run paths (fonts-nanum package)
  '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
  '/usr/share/fonts/truetype/nanum/NanumGothic-Bold.ttf',
  '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
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

  logger.warn({ triedPaths: FONT_PATHS }, '한글 폰트를 찾을 수 없음, 기본 폰트 사용');
  return FONT_PATHS[0];
}

export class TextOverlayProcessor {
  /**
   * 오버레이 적용 (모드에 따라 자동 분기)
   */
  async apply(
    inputPath: string,
    outputPath: string,
    options: OverlayOptions,
    startSec?: number,
    endSec?: number
  ): Promise<void> {
    const { mode } = options;

    logger.info({ mode, inputPath }, '오버레이 처리 시작');

    switch (mode) {
      case 'static':
        await this.applyStaticText(
          inputPath,
          outputPath,
          options.static || {},
          startSec,
          endSec
        );
        break;

      case 'dynamic':
        if (!options.dynamic?.subtitlePath) {
          throw new Error('동적 자막 모드에는 subtitlePath가 필요합니다');
        }
        await this.applyDynamicSubtitle(
          inputPath,
          outputPath,
          { ...options.dynamic, subtitlePath: options.dynamic.subtitlePath },
          startSec,
          endSec
        );
        break;

      case 'none':
        await this.cropOnly(inputPath, outputPath, startSec, endSec);
        break;

      default:
        throw new Error(`알 수 없는 오버레이 모드: ${mode}`);
    }

    logger.info({ mode, outputPath }, '오버레이 처리 완료');
  }

  /**
   * 정적 텍스트 오버레이
   *
   * 영상 전체에 고정된 텍스트를 표시
   * 예: 영상 제목, 채널명 등
   */
  async applyStaticText(
    inputPath: string,
    outputPath: string,
    options: Partial<StaticTextOptions>,
    startSec?: number,
    endSec?: number
  ): Promise<void> {
    const opts: StaticTextOptions = { ...DEFAULT_STATIC_OPTIONS, ...options };

    // 텍스트가 없으면 크롭만 수행
    if (!opts.text || opts.text.trim() === '') {
      logger.info('정적 텍스트가 비어있음, 크롭만 수행');
      return this.cropOnly(inputPath, outputPath, startSec, endSec);
    }

    // 폰트 경로 탐지
    const fontPath = findAvailableFontPath();

    logger.info({
      text: opts.text,
      position: opts.position,
      fontSize: opts.fontSize,
      fontPath
    }, '정적 텍스트 오버레이 적용');

    // Y 좌표 계산
    const yPosition = this.calculateYPosition(opts.position, opts.marginY);

    // 텍스트 이스케이프 (FFmpeg용)
    const escapedText = this.escapeText(opts.text);

    // 배경 높이 계산 (폰트 크기 + 패딩)
    const boxHeight = opts.fontSize + (opts.backgroundPadding || 20) * 2;
    const boxY = opts.position === 'top' ? opts.marginY : `h-${boxHeight}-${opts.marginY}`;

    // 필터 구성: 배경색이 있으면 전체 너비 배너 스타일
    let textFilter: string;

    if (opts.backgroundColor) {
      // 🎯 가로 100% 배너 스타일: drawbox + drawtext
      const drawBox = `drawbox=x=0:y=${boxY}:w=iw:h=${boxHeight}:color=${opts.backgroundColor}:t=fill`;
      const drawText = [
        `drawtext=fontfile=${fontPath}`,
        `text='${escapedText}'`,
        `fontsize=${opts.fontSize}`,
        `fontcolor=${opts.fontColor}`,
        `x=(w-text_w)/2`,  // 가로 중앙
        `y=${boxY}+(${boxHeight}-text_h)/2`  // 박스 내 세로 중앙
      ].join(':');
      textFilter = `${drawBox},${drawText}`;
    } else {
      // 배경 없음: 텍스트만 + 외곽선
      textFilter = [
        `drawtext=fontfile=${fontPath}`,
        `text='${escapedText}'`,
        `fontsize=${opts.fontSize}`,
        `fontcolor=${opts.fontColor}`,
        `borderw=${opts.outlineWidth}`,
        `bordercolor=${opts.outlineColor}`,
        `x=(w-text_w)/2`,
        `y=${yPosition}`
      ].join(':');
    }

    // 세로 크롭 + 스케일 필터 (16:9 → 9:16, 720x1280 - 숏츠 최적화)
    const cropFilter = 'crop=ih*9/16:ih,scale=720:1280';

    // 시간 범위 옵션
    const timeArgs = this.buildTimeArgs(startSec, endSec);

    // FFmpeg 명령어 구성
    const cmd = [
      'ffmpeg -y',
      `-i "${inputPath}"`,
      timeArgs,
      `-vf "${cropFilter},${textFilter}"`,
      '-c:v libx264 -preset fast -crf 23',
      '-c:a aac -b:a 128k',
      `"${outputPath}"`
    ].filter(Boolean).join(' ');

    logger.debug({ cmd }, 'FFmpeg 정적 텍스트 명령');

    try {
      await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
    } catch (error) {
      logger.error({ error, cmd }, '정적 텍스트 오버레이 실패');
      throw error;
    }
  }

  /**
   * 동적 자막 오버레이
   *
   * SRT 파일을 사용하여 시간에 맞춰 자막 표시
   */
  async applyDynamicSubtitle(
    inputPath: string,
    outputPath: string,
    options: Partial<DynamicSubtitleOptions> & { subtitlePath: string },
    startSec?: number,
    endSec?: number
  ): Promise<void> {
    const opts = { ...DEFAULT_DYNAMIC_OPTIONS, ...options };

    // 폰트 이름 (한글 지원)
    const fontName = process.platform === 'win32' ? 'Malgun Gothic' : 'NanumGothicBold';

    logger.info({
      subtitlePath: opts.subtitlePath,
      fontSize: opts.fontSize,
      fontName
    }, '동적 자막 오버레이 적용');

    // 자막 스타일 (한글 폰트 포함)
    const subtitleStyle = [
      `FontName=${fontName}`,
      `FontSize=${opts.fontSize}`,
      `PrimaryColour=&H00FFFFFF`,  // white
      `OutlineColour=&H00000000`,  // black
      `Outline=${opts.outlineWidth}`,
      `Shadow=${opts.shadow}`,
      `Alignment=2`,  // 하단 중앙
      `MarginV=50`
    ].join(',');

    // 세로 크롭 + 스케일 + 자막 필터 (720x1280 - 숏츠 최적화)
    const cropFilter = 'crop=ih*9/16:ih,scale=720:1280';
    const subtitleFilter = `subtitles='${opts.subtitlePath.replace(/'/g, "\\'")}':force_style='${subtitleStyle}'`;

    // 시간 범위 옵션
    const timeArgs = this.buildTimeArgs(startSec, endSec);

    const cmd = [
      'ffmpeg -y',
      `-i "${inputPath}"`,
      timeArgs,
      `-vf "${cropFilter},${subtitleFilter}"`,
      '-c:v libx264 -preset fast -crf 23',
      '-c:a aac -b:a 128k',
      `"${outputPath}"`
    ].filter(Boolean).join(' ');

    logger.debug({ cmd }, 'FFmpeg 동적 자막 명령');

    try {
      await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
    } catch (error) {
      logger.error({ error, cmd }, '동적 자막 오버레이 실패');
      throw error;
    }
  }

  /**
   * 크롭만 수행 (오버레이 없음)
   */
  async cropOnly(
    inputPath: string,
    outputPath: string,
    startSec?: number,
    endSec?: number
  ): Promise<void> {
    logger.info({ inputPath, startSec, endSec }, '크롭만 수행 (오버레이 없음)');

    // 세로 크롭 + 스케일 (720x1280 - 숏츠 최적화)
    const cropFilter = 'crop=ih*9/16:ih,scale=720:1280';
    const timeArgs = this.buildTimeArgs(startSec, endSec);

    const cmd = [
      'ffmpeg -y',
      `-i "${inputPath}"`,
      timeArgs,
      `-vf "${cropFilter}"`,
      '-c:v libx264 -preset fast -crf 23',
      '-c:a aac -b:a 128k',
      `"${outputPath}"`
    ].filter(Boolean).join(' ');

    logger.debug({ cmd }, 'FFmpeg 크롭 명령');

    try {
      await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
    } catch (error) {
      logger.error({ error, cmd }, '크롭 실패');
      throw error;
    }
  }

  /**
   * Y 좌표 계산
   */
  private calculateYPosition(position: string, marginY: number): string {
    switch (position) {
      case 'top':
        return String(marginY);
      case 'bottom':
        return `h-text_h-${marginY}`;
      case 'center':
        return '(h-text_h)/2';
      default:
        return String(marginY);
    }
  }

  /**
   * FFmpeg용 텍스트 이스케이프
   */
  private escapeText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
  }

  /**
   * 시간 범위 인자 생성
   */
  private buildTimeArgs(startSec?: number, endSec?: number): string {
    const args: string[] = [];

    if (startSec !== undefined && startSec > 0) {
      args.push(`-ss ${startSec}`);
    }

    if (endSec !== undefined && startSec !== undefined) {
      const duration = endSec - startSec;
      if (duration > 0) {
        args.push(`-t ${duration}`);
      }
    }

    return args.join(' ');
  }
}
