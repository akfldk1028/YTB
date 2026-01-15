/**
 * FFmpeg Subtitle Filter Module
 *
 * Handles subtitle/caption related operations:
 * - TikTok/Shorts style word-by-word captions
 * - Dual language subtitles (Korean + English)
 * - Title text overlay
 */

import path from "path";
import fs from "fs-extra";
import { logger } from "../logger";
import { OrientationEnum, TitleTextConfig, SubtitleConfig } from "../types/shorts";
import { findAvailableFontPath, findTitleFontPath, findSubtitleFontPath, resolveFontPreset, FontPreset } from "./utils";

/**
 * 🔥 프로젝트별 폰트 설정 (n8n에서 전달)
 */
export interface ProjectFontConfig {
  title_font?: FontPreset;
  subtitle_font?: FontPreset;
  subtitle_size?: number;
  title_size?: number;
  title_color?: string;
  title_bg_color?: string;
  subtitle_color?: string;
}

/**
 * 경로를 FFmpeg drawtext 필터에서 사용 가능한 형식으로 변환
 *
 * 🔥 FFmpeg filter escaping rules (공식 문서 기반):
 * - complexFilter에서 콜론(:)은 파라미터 구분자이므로 \:로 이스케이프
 * - 싱글쿼트(')는 \'로 이스케이프
 * - 백슬래시(\)는 \\로 이스케이프
 *
 * @see https://ffmpeg.org/ffmpeg-filters.html#Filtering-Introduction
 */
function toFFmpegPath(filePath: string): string {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // Windows: 백슬래시 → 슬래시, 콜론 이스케이프, 싱글쿼트 감싸기
    const safePath = filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
    return `'${safePath}'`;
  } else {
    // Linux/Docker:
    // 🔥 핵심: drawtext filter에서 경로의 콜론은 이스케이프 불필요
    // 단, 경로에 특수문자가 있으면 이스케이프 필요
    // /app/font/GmarketSansTTFBold.ttf → 그대로 사용 (콜론 없음)
    return filePath.replace(/\\/g, '/');
  }
}

/**
 * 🔥 폰트 파일 존재 및 유효성 검증
 * FFmpeg drawtext에서 폰트 로드 실패시 디버깅용
 */
function validateFontFile(fontPath: string): { valid: boolean; error?: string; size?: number } {
  try {
    if (!fs.existsSync(fontPath)) {
      return { valid: false, error: `Font file not found: ${fontPath}` };
    }

    const stats = fs.statSync(fontPath);
    if (stats.size === 0) {
      return { valid: false, error: `Font file is empty: ${fontPath}`, size: 0 };
    }

    // TTF magic bytes 검증 (00 01 00 00 또는 "OTTO")
    const buffer = fs.readFileSync(fontPath, { encoding: null });
    const magicBytes = buffer.slice(0, 4);
    const isTTF = magicBytes[0] === 0x00 && magicBytes[1] === 0x01 && magicBytes[2] === 0x00 && magicBytes[3] === 0x00;
    const isOTF = magicBytes.toString('ascii') === 'OTTO';

    if (!isTTF && !isOTF) {
      return {
        valid: false,
        error: `Invalid font file (magic: ${magicBytes.toString('hex')}): ${fontPath}`,
        size: stats.size
      };
    }

    return { valid: true, size: stats.size };
  } catch (error) {
    return { valid: false, error: `Font validation error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export class SubtitleFilter {
  /**
   * TikTok/Shorts style subtitle filter
   * Highlights current word in yellow (or custom color from config)
   *
   * NOTE: Korean text uses textfile method for UTF-8 support
   *
   * @param captions - 자막 데이터 배열
   * @param orientation - 영상 방향 (portrait/landscape)
   * @param tempDir - 임시 파일 디렉토리 (한글 지원용)
   * @param config - 자막 스타일 설정 (색상, 폰트 등)
   */
  createSubtitleFilter(
    captions: any[],
    orientation: OrientationEnum,
    tempDir?: string,
    config?: SubtitleConfig
  ): { filter: string; textFilePaths: string[] } | null {
    try {
      if (!captions || captions.length === 0) return null;

      // 🔥 NewsProject 스타일 - 90px 크기 + 2줄 지원
      const fontSize = config?.fontSize || (orientation === OrientationEnum.portrait ? 90 : 72);
      const yPosition = config?.yPosition || (orientation === OrientationEnum.portrait ? 'h*0.50' : 'h*0.55');
      // 🔥 자막은 Gmarket Sans Bold 사용
      const fontPath = findSubtitleFontPath();
      const textFilePaths: string[] = [];

      // 🔥 폰트 파일 유효성 검증 (FFmpeg drawtext 디버깅용)
      const fontValidation = validateFontFile(fontPath);
      logger.info({
        fontPath,
        ...fontValidation,
        method: 'createSubtitleFilter'
      }, '[FONT VALIDATE] Subtitle font validation result');

      // 🔥 색상 설정 - 흰색 + 검은 테두리 (NewsProject 스타일)
      const normalColor = config?.normalColor?.replace('#', '') || 'FFFFFF';
      const highlightColor = config?.highlightColor?.replace('#', '') || 'FFEB3B';
      const borderColor = config?.borderColor || 'black';
      const borderWidth = config?.borderWidth || 4;

      // Group words for display (2-3 words together)
      const wordGroups = this.groupWordsForDisplay(captions, 3);
      const drawTextFilters: string[] = [];

      wordGroups.forEach((group, groupIndex) => {
        const groupStartTime = group[0].startMs / 1000;
        const groupEndTime = group[group.length - 1].endMs / 1000;

        group.forEach((word, wordIndex) => {
          const wordStartTime = word.startMs / 1000;
          const wordEndTime = word.endMs / 1000;

          // 🔥 FIX: fontcolor_expr가 complexFilter에서 제대로 동작하지 않음
          // 대신 정적 fontcolor 사용 (동적 하이라이트 대신 단일 색상)
          const fontColor = highlightColor; // 하이라이트 색상 사용

          if (tempDir) {
            // textfile method for Korean UTF-8 support
            const textFilePath = path.join(tempDir, `subtitle_word_${Date.now()}_${groupIndex}_${wordIndex}.txt`);
            fs.writeFileSync(textFilePath, word.text.toUpperCase() + ' ', 'utf-8');
            textFilePaths.push(textFilePath);

            // 🔥 toFFmpegPath 사용 (Windows/Linux 자동 처리)
            const safeFontPath = toFFmpegPath(fontPath);
            const safeTextPath = toFFmpegPath(textFilePath);

            drawTextFilters.push(
              `drawtext=fontfile=${safeFontPath}:` +
              `textfile=${safeTextPath}:` +
              `fontcolor=0x${fontColor}:` +
              `fontsize=${fontSize}:` +
              `x=(w-tw)/2:` +
              `y=${yPosition}:` +
              `borderw=${borderWidth}:` +
              `bordercolor=${borderColor}:` +
              `enable=between(t\\,${groupStartTime}\\,${groupEndTime})`
            );
          } else {
            // Fallback: inline text (Korean may show as boxes)
            const text = word.text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:').toUpperCase();
            const safeFontPath = toFFmpegPath(fontPath);
            drawTextFilters.push(
              `drawtext=fontfile=${safeFontPath}:` +
              `text='${text} ':` +
              `fontcolor=0x${fontColor}:` +
              `fontsize=${fontSize}:` +
              `x=(w-tw)/2:` +
              `y=${yPosition}:` +
              `borderw=${borderWidth}:` +
              `bordercolor=${borderColor}:` +
              `enable=between(t\\,${groupStartTime}\\,${groupEndTime})`
            );
          }
        });
      });

      // 🔥 Too many filters or already-grouped captions → use simplified filter
      // - 50+ filters cause performance issues
      // - Word groups from splitNarrationToCaptions don't need TikTok-style word highlighting
      if (drawTextFilters.length > 30) {
        logger.info({ filterCount: drawTextFilters.length }, "Using simplified filter (too many filters or word groups)");
        return this.createSimplifiedSubtitleFilter(captions, orientation, tempDir, config);
      }

      logger.info({
        captionCount: captions.length,
        filterCount: drawTextFilters.length,
        textFileCount: textFilePaths.length,
        usingTextFiles: !!tempDir,
        subtitleConfig: { normalColor, highlightColor, borderColor, borderWidth }
      }, "Created TikTok style subtitle filter");

      return { filter: drawTextFilters.join(','), textFilePaths };
    } catch (error) {
      logger.warn(error, "Could not create subtitle filter, falling back to simplified version");
      return this.createSimplifiedSubtitleFilter(captions, orientation, tempDir, config);
    }
  }

  /**
   * Group words for display (n words per group)
   */
  private groupWordsForDisplay(captions: any[], maxWordsPerGroup: number): any[][] {
    const groups: any[][] = [];
    let currentGroup: any[] = [];

    captions.forEach((caption, index) => {
      currentGroup.push(caption);

      const nextCaption = captions[index + 1];
      const timegap = nextCaption ? (nextCaption.startMs - caption.endMs) : 9999;

      if (currentGroup.length >= maxWordsPerGroup || timegap > 500) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }
    });

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Simplified TikTok style subtitle filter (single word, custom color)
   *
   * NOTE: Korean text uses textfile method for UTF-8 support
   * 🔥 90px 폰트 + 긴 텍스트는 2줄로 분리
   *
   * @param config - 자막 스타일 설정 (색상, 폰트 등)
   */
  private createSimplifiedSubtitleFilter(
    captions: any[],
    orientation: OrientationEnum,
    tempDir?: string,
    config?: SubtitleConfig
  ): { filter: string; textFilePaths: string[] } | null {
    try {
      if (!captions || captions.length === 0) return null;

      // 🔥 NewsProject 스타일 - 90px 큰 폰트 + 2줄 지원
      const fontSize = config?.fontSize || (orientation === OrientationEnum.portrait ? 90 : 72);
      // 🔥 2줄 자막을 위한 y 위치 (위쪽 줄, 아래쪽 줄)
      const lineHeight = fontSize * 1.15;  // 줄 간격
      const baseY = orientation === OrientationEnum.portrait ? 'h*0.48' : 'h*0.50';  // 1줄일 때 위치
      const twoLineY1 = orientation === OrientationEnum.portrait ? 'h*0.45' : 'h*0.47';  // 2줄일 때 첫째 줄
      const twoLineY2 = `(${twoLineY1})+${lineHeight}`;  // 2줄일 때 둘째 줄

      // 🔥 자막은 Gmarket Sans Bold 사용
      const fontPath = findSubtitleFontPath();
      const textFilePaths: string[] = [];

      // 🔥 폰트 파일 유효성 검증
      const fontValidation = validateFontFile(fontPath);
      logger.info({
        fontPath,
        ...fontValidation,
        method: 'createSimplifiedSubtitleFilter'
      }, '[FONT VALIDATE] Simplified subtitle font validation');

      // 🔥 색상 설정 - 흰색 + 검은 테두리 (NewsProject 스타일)
      const fontColor = config?.normalColor?.replace('#', '') || config?.highlightColor?.replace('#', '') || 'FFFFFF';
      const borderColor = config?.borderColor || 'black';
      const borderWidth = config?.borderWidth || 5;
      const shadowColor = config?.shadowColor || 'black@0.7';

      // 🔥 한 줄에 들어갈 최대 글자 수 (90px 기준)
      const maxCharsPerLine = orientation === OrientationEnum.portrait ? 10 : 14;

      const drawTextFilters: string[] = [];

      captions.forEach((caption, index) => {
        const startTime = caption.startMs / 1000;
        const endTime = caption.endMs / 1000;
        const text = caption.text.trim();

        // 🔥 2줄 분리 로직: maxCharsPerLine 초과시 분리
        const needsTwoLines = text.length > maxCharsPerLine;

        if (needsTwoLines && tempDir) {
          // 🔥 2줄로 분리
          const { line1, line2 } = this.splitTextIntoTwoLines(text, maxCharsPerLine);

          // 첫째 줄
          const textFilePath1 = path.join(tempDir, `subtitle_2line_${Date.now()}_${index}_1.txt`);
          fs.writeFileSync(textFilePath1, line1.toUpperCase(), 'utf-8');
          textFilePaths.push(textFilePath1);

          drawTextFilters.push(
            `drawtext=fontfile=${toFFmpegPath(fontPath)}:textfile=${toFFmpegPath(textFilePath1)}:fontcolor=0x${fontColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${twoLineY1}:borderw=${borderWidth}:bordercolor=${borderColor}:shadowcolor=${shadowColor}:shadowx=3:shadowy=3:enable=between(t\\,${startTime}\\,${endTime})`
          );

          // 둘째 줄
          const textFilePath2 = path.join(tempDir, `subtitle_2line_${Date.now()}_${index}_2.txt`);
          fs.writeFileSync(textFilePath2, line2.toUpperCase(), 'utf-8');
          textFilePaths.push(textFilePath2);

          drawTextFilters.push(
            `drawtext=fontfile=${toFFmpegPath(fontPath)}:textfile=${toFFmpegPath(textFilePath2)}:fontcolor=0x${fontColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${twoLineY2}:borderw=${borderWidth}:bordercolor=${borderColor}:shadowcolor=${shadowColor}:shadowx=3:shadowy=3:enable=between(t\\,${startTime}\\,${endTime})`
          );

          logger.debug({ line1, line2, index }, "Split caption into 2 lines");
        } else if (tempDir) {
          // 1줄 (기존 로직)
          const textFilePath = path.join(tempDir, `subtitle_simple_${Date.now()}_${index}.txt`);
          fs.writeFileSync(textFilePath, text.toUpperCase(), 'utf-8');
          textFilePaths.push(textFilePath);

          drawTextFilters.push(
            `drawtext=fontfile=${toFFmpegPath(fontPath)}:textfile=${toFFmpegPath(textFilePath)}:fontcolor=0x${fontColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${baseY}:borderw=${borderWidth}:bordercolor=${borderColor}:shadowcolor=${shadowColor}:shadowx=3:shadowy=3:enable=between(t\\,${startTime}\\,${endTime})`
          );
        } else {
          // Fallback: inline text (Korean may show as boxes)
          const escapedText = text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:').toUpperCase();
          const safeFontPath = toFFmpegPath(fontPath);
          drawTextFilters.push(
            `drawtext=fontfile=${safeFontPath}:text='${escapedText}':fontcolor=0x${fontColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${baseY}:borderw=${borderWidth}:bordercolor=${borderColor}:shadowcolor=${shadowColor}:shadowx=3:shadowy=3:enable=between(t\\,${startTime}\\,${endTime})`
          );
        }
      });

      logger.info({
        captionCount: captions.length,
        filterCount: drawTextFilters.length,
        textFileCount: textFilePaths.length,
        usingTextFiles: !!tempDir,
        fontSize,
        maxCharsPerLine
      }, "Created simplified subtitle filter with 2-line support (90px)");

      return { filter: drawTextFilters.join(','), textFilePaths };
    } catch (error) {
      logger.warn(error, "Could not create simplified subtitle filter");
      return null;
    }
  }

  /**
   * 🔥 텍스트를 2줄로 분리 (공백 기준, 균등 분배)
   */
  private splitTextIntoTwoLines(text: string, maxCharsPerLine: number): { line1: string; line2: string } {
    // 공백으로 분리
    const words = text.split(/\s+/);

    if (words.length === 1) {
      // 단어가 하나면 강제로 중간에서 분리
      const mid = Math.ceil(text.length / 2);
      return {
        line1: text.substring(0, mid),
        line2: text.substring(mid)
      };
    }

    // 균등하게 2줄로 분배
    let line1 = '';
    let line2 = '';
    const targetLength = Math.ceil(text.length / 2);

    for (const word of words) {
      if (line1.length + word.length + 1 <= targetLength || line2.length === 0 && line1.length === 0) {
        line1 += (line1 ? ' ' : '') + word;
      } else {
        line2 += (line2 ? ' ' : '') + word;
      }
    }

    // 두 번째 줄이 비어있으면 강제 분리
    if (!line2) {
      const mid = Math.ceil(line1.length / 2);
      line2 = line1.substring(mid).trim();
      line1 = line1.substring(0, mid).trim();
    }

    return { line1: line1.trim(), line2: line2.trim() };
  }

  /**
   * Dual language subtitle filter
   * Korean (primary) on top, English (secondary) below
   *
   * NOTE: Korean text uses textfile method for UTF-8 support
   *
   * @param config - 자막 스타일 설정 (색상, 폰트 등)
   */
  createDualLanguageSubtitleFilter(
    primaryCaptions: any[],
    secondaryCaptions: any[],
    orientation: OrientationEnum,
    tempDir?: string,
    config?: SubtitleConfig
  ): { filter: string; textFilePaths: string[] } | null {
    try {
      if (!primaryCaptions || primaryCaptions.length === 0) return null;

      // 🔥 자막은 Gmarket Sans Bold 사용
      const fontPath = findSubtitleFontPath();
      const textFilePaths: string[] = [];

      // 🔥 폰트 파일 유효성 검증
      const fontValidation = validateFontFile(fontPath);
      logger.info({
        fontPath,
        ...fontValidation,
        method: 'createDualLanguageSubtitleFilter'
      }, '[FONT VALIDATE] Dual language subtitle font validation');

      // 🔥 Korean settings (primary) - 자극적인 뉴스 쇼츠 스타일 (어마어마하게 크게!)
      const primaryFontSize = config?.fontSize || (orientation === OrientationEnum.portrait ? 85 : 68);
      const primaryYPosition = config?.yPosition || (orientation === OrientationEnum.portrait ? 'h*0.48' : 'h*0.50');
      const primaryColor = config?.normalColor?.replace('#', '') || 'FFFFFF';

      // English settings (secondary, below primary)
      const secondaryFontSize = orientation === OrientationEnum.portrait ? 50 : 45;
      const secondaryYPosition = orientation === OrientationEnum.portrait ? 'h*0.58' : 'h*0.62';
      const secondaryColor = config?.highlightColor?.replace('#', '') || 'FFFFFF';

      // 🔥 테두리/그림자 설정
      const borderColor = config?.borderColor || 'black';
      const borderWidth = config?.borderWidth || 4;
      const shadowColor = config?.shadowColor || 'black@0.7';

      const drawTextFilters: string[] = [];

      // Verify font file exists and log its size
      const fontExists = fs.existsSync(fontPath);
      const fontStats = fontExists ? fs.statSync(fontPath) : null;

      logger.info({
        tempDir: tempDir || 'UNDEFINED',
        captionCount: primaryCaptions.length,
        fontPath,
        fontExists,
        fontSizeBytes: fontStats?.size || 0,
        fontSizeMB: fontStats ? (fontStats.size / 1024 / 1024).toFixed(2) : 0
      }, "Creating dual language subtitle filter - font verification");

      // Korean subtitles (primary) - use textfile for UTF-8 support
      primaryCaptions.forEach((caption, index) => {
        const startTime = caption.startMs / 1000;
        const endTime = caption.endMs / 1000;

        if (tempDir) {
          // textfile method: write UTF-8 file and read from it
          const textFilePath = path.join(tempDir, `subtitle_primary_${Date.now()}_${index}.txt`);
          fs.writeFileSync(textFilePath, caption.text, 'utf-8');
          textFilePaths.push(textFilePath);

          if (index === 0) {
            // Debug: Log hex bytes to verify Korean encoding
            const textBuffer = Buffer.from(caption.text, 'utf-8');
            const hexBytes = textBuffer.toString('hex').substring(0, 60);

            // Verify what was actually written to file
            const writtenContent = fs.readFileSync(textFilePath, 'utf-8');
            const writtenBuffer = Buffer.from(writtenContent, 'utf-8');
            const writtenHex = writtenBuffer.toString('hex').substring(0, 60);

            logger.info({
              textFilePath,
              captionText: caption.text.substring(0, 30),
              captionHex: hexBytes,
              writtenText: writtenContent.substring(0, 30),
              writtenHex: writtenHex,
              encoding: 'utf-8',
              bytesMatch: hexBytes === writtenHex
            }, "First subtitle text file created - encoding verification");
          }

          // 🔥 toFFmpegPath 사용 (Windows/Linux 자동 처리)
          const safeFontPath = toFFmpegPath(fontPath);
          const safeTextPath = toFFmpegPath(textFilePath);

          drawTextFilters.push(
            `drawtext=fontfile=${safeFontPath}:textfile=${safeTextPath}:fontcolor=0x${primaryColor}:fontsize=${primaryFontSize}:x=(w-text_w)/2:y=${primaryYPosition}:borderw=${borderWidth}:bordercolor=${borderColor}:shadowcolor=${shadowColor}:shadowx=2:shadowy=2:enable=between(t\\,${startTime}\\,${endTime})`
          );
        } else {
          // Fallback: inline text (Korean may show as boxes)
          const text = caption.text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:');
          const safeFontPath = toFFmpegPath(fontPath);
          drawTextFilters.push(
            `drawtext=fontfile=${safeFontPath}:text='${text}':fontcolor=0x${primaryColor}:fontsize=${primaryFontSize}:x=(w-text_w)/2:y=${primaryYPosition}:borderw=${borderWidth}:bordercolor=${borderColor}:shadowcolor=${shadowColor}:shadowx=2:shadowy=2:enable=between(t\\,${startTime}\\,${endTime})`
          );
        }
      });

      // English subtitles (secondary) - inline works fine for English
      if (secondaryCaptions && secondaryCaptions.length > 0) {
        secondaryCaptions.forEach((caption) => {
          const startTime = caption.startMs / 1000;
          const endTime = caption.endMs / 1000;
          const text = caption.text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:');
          const safeFontPath = toFFmpegPath(fontPath);

          drawTextFilters.push(
            `drawtext=fontfile=${safeFontPath}:text='${text}':fontcolor=0x${secondaryColor}:fontsize=${secondaryFontSize}:x=(w-text_w)/2:y=${secondaryYPosition}:borderw=${borderWidth}:bordercolor=${borderColor}:shadowcolor=${shadowColor}:shadowx=2:shadowy=2:enable=between(t\\,${startTime}\\,${endTime})`
          );
        });
      }

      logger.info({
        primaryCount: primaryCaptions.length,
        secondaryCount: secondaryCaptions?.length || 0,
        textFileCount: textFilePaths.length,
        usingTextFiles: !!tempDir,
        subtitleConfig: { primaryColor, secondaryColor, borderColor, borderWidth }
      }, "Created dual language subtitle filter");

      return { filter: drawTextFilters.join(','), textFilePaths };
    } catch (error) {
      logger.warn(error, "Could not create dual language subtitle filter");
      return null;
    }
  }

  /**
   * Title text filter for top hook/title
   * Shorts-style attention grabber at top of screen
   *
   * 🔥 두 줄 제목 지원:
   * - 첫 번째 줄: 흰색
   * - 두 번째 줄: 노란색
   *
   * NOTE: Korean text uses textfile method for UTF-8 support
   */
  createTitleTextFilter(
    titleText: TitleTextConfig,
    orientation: OrientationEnum,
    videoDuration: number,
    tempDir?: string,
    language?: 'english' | 'korean'
  ): { filter: string; textFilePath?: string; textFilePaths?: string[] } | null {
    try {
      // Select text based on language (default: ko for backward compatibility)
      const rawText = language === 'english' && titleText?.en
        ? titleText.en
        : titleText?.ko;

      // 🔥 Remove emojis that FFmpeg can't render (causes ☒ boxes)
      const displayText = rawText?.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();

      if (!titleText || !displayText) return null;

      // 🔥 제목은 Black Han Sans 사용
      const fontPath = findTitleFontPath();

      // 🔥 폰트 파일 유효성 검증
      const fontValidation = validateFontFile(fontPath);
      logger.info({
        fontPath,
        ...fontValidation,
        method: 'createTitleTextFilter'
      }, '[FONT VALIDATE] Title font validation');

      // Settings
      const style = titleText.style || 'twoLine'; // 🔥 기본값을 twoLine으로 변경
      const position = titleText.position || 'top';
      // 🔥 어마어마하게 큰 폰트 - 자극적인 뉴스 쇼츠 스타일!
      const fontSize = titleText.fontSize || (orientation === OrientationEnum.portrait ? 130 : 100);

      // Display duration
      const duration = titleText.duration === 'full' || !titleText.duration
        ? videoDuration
        : titleText.duration;

      // 🔥 두 줄 제목 처리 (줄바꿈이 있거나 style이 twoLine인 경우)
      const lines = displayText.split('\n').filter(line => line.trim());
      const isTwoLine = lines.length >= 2 || style === 'twoLine';

      if (isTwoLine && lines.length >= 2 && tempDir) {
        // 🔥 두 줄 제목: 첫 줄 흰색, 둘째 줄 노란색
        return this.createTwoLineTitleFilter(
          lines[0].trim(),
          lines[1].trim(),
          fontPath,
          fontSize,
          orientation,
          duration,
          tempDir
        );
      }

      // 단일 줄 제목 (기존 로직)
      // Style-based colors
      let textColor: string;
      let backgroundColor: string;
      let useBox: boolean;

      if (style === 'highlight') {
        // Yellow background + black text (Shorts aggro style)
        textColor = titleText.textColor?.replace('#', '') || '000000';
        backgroundColor = titleText.backgroundColor?.replace('#', '') || 'FFEB3B';
        useBox = true;
      } else {
        // Default: white text + black border
        textColor = titleText.textColor?.replace('#', '') || 'FFFFFF';
        backgroundColor = '';
        useBox = false;
      }

      // Y position
      let yPosition: string;
      if (position === 'top') {
        yPosition = orientation === OrientationEnum.portrait ? 'h*0.08' : 'h*0.06';
      } else {
        yPosition = 'h*0.15';
      }

      // Build filter
      let filter: string;
      let textFilePath: string | undefined;

      if (tempDir) {
        // textfile method for UTF-8 support (both Korean and emoji)
        textFilePath = path.join(tempDir, `title_text_${Date.now()}.txt`);
        fs.writeFileSync(textFilePath, displayText, 'utf-8');
        logger.info({ textFilePath, text: displayText, language }, "Created UTF-8 title text file for FFmpeg");

        // 🔥 toFFmpegPath 사용 (Windows/Linux 자동 처리)
        const safeFontPath = toFFmpegPath(fontPath);
        const safeTextPath = toFFmpegPath(textFilePath);

        filter = `drawtext=fontfile=${safeFontPath}:textfile=${safeTextPath}:fontcolor=0x${textColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}`;
      } else {
        // Fallback: inline text (non-ASCII may not render correctly)
        const text = displayText.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:').replace(/\n/g, '\\n');
        const safeFontPath = toFFmpegPath(fontPath);
        filter = `drawtext=fontfile=${safeFontPath}:text='${text}':fontcolor=0x${textColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}`;
        logger.warn({ text: displayText }, "Using inline text for FFmpeg (non-ASCII may not render correctly)");
      }

      if (useBox) {
        // 🔥 HUGE box padding for Shorts-style (15 → 28)
        filter += `:box=1:boxcolor=0x${backgroundColor}@0.95:boxborderw=28`;
      } else {
        filter += ':borderw=4:bordercolor=black:shadowcolor=black@0.7:shadowx=2:shadowy=2';
      }

      // Add enable if not full duration
      if (titleText.duration !== 'full' && typeof titleText.duration === 'number') {
        filter += `:enable=between(t\\,0\\,${duration})`;
      }

      logger.debug({
        titleText: displayText,
        language,
        style,
        position,
        fontSize,
        duration,
        usingTextFile: !!tempDir
      }, "Created title text filter");

      return { filter, textFilePath };
    } catch (error) {
      logger.warn(error, "Could not create title text filter");
      return null;
    }
  }

  /**
   * 🔥 두 줄 제목 필터 생성
   * - 첫 번째 줄: 흰색 (FFFFFF)
   * - 두 번째 줄: 노란색 (FFEB3B)
   */
  private createTwoLineTitleFilter(
    line1: string,
    line2: string,
    fontPath: string,
    fontSize: number,
    orientation: OrientationEnum,
    duration: number,
    tempDir: string
  ): { filter: string; textFilePaths: string[] } {
    const textFilePaths: string[] = [];
    const filters: string[] = [];

    // Y 위치 계산 (두 줄이 화면 상단에 적절히 배치되도록)
    const lineHeight = fontSize * 1.2; // 줄 간격
    const y1 = orientation === OrientationEnum.portrait ? 'h*0.06' : 'h*0.05';
    const y2 = orientation === OrientationEnum.portrait ? `h*0.06+${lineHeight}` : `h*0.05+${lineHeight}`;

    // 첫 번째 줄 (흰색)
    const textFile1 = path.join(tempDir, `title_line1_${Date.now()}.txt`);
    fs.writeFileSync(textFile1, line1, 'utf-8');
    textFilePaths.push(textFile1);

    const safeFontPath = toFFmpegPath(fontPath);
    const safePath1 = toFFmpegPath(textFile1);

    filters.push(
      `drawtext=fontfile=${safeFontPath}:textfile=${safePath1}:fontcolor=0xFFFFFF:fontsize=${fontSize}:x=(w-text_w)/2:y=${y1}:borderw=5:bordercolor=black:shadowcolor=black@0.7:shadowx=2:shadowy=2`
    );

    // 두 번째 줄 (노란색)
    const textFile2 = path.join(tempDir, `title_line2_${Date.now()}.txt`);
    fs.writeFileSync(textFile2, line2, 'utf-8');
    textFilePaths.push(textFile2);

    const safePath2 = toFFmpegPath(textFile2);

    filters.push(
      `drawtext=fontfile=${safeFontPath}:textfile=${safePath2}:fontcolor=0xFFEB3B:fontsize=${fontSize}:x=(w-text_w)/2:y=${y2}:borderw=5:bordercolor=black:shadowcolor=black@0.7:shadowx=2:shadowy=2`
    );

    logger.info({
      line1,
      line2,
      fontSize,
      colors: ['FFFFFF (흰색)', 'FFEB3B (노란색)']
    }, "Created two-line title filter (흰색 + 노란색)");

    return {
      filter: filters.join(','),
      textFilePaths
    };
  }

  /**
   * 🔥 Scene overlay filter (씬별 제목 표시)
   * 각 씬마다 다른 제목을 표시 (text_overlay)
   * 상단에 노란 배경 + 검은 텍스트로 표시
   *
   * @param overlays - 씬별 오버레이 배열 [{text, startMs, endMs}, ...]
   * @param orientation - 영상 방향
   * @param tempDir - UTF-8 텍스트 파일 저장용
   * @param fontConfig - 🔥 프로젝트별 폰트 설정 (선택)
   */
  createSceneOverlayFilter(
    overlays: Array<{ text: string; startMs: number; endMs: number }>,
    orientation: OrientationEnum,
    tempDir?: string,
    fontConfig?: ProjectFontConfig
  ): { filter: string; textFilePaths: string[] } | null {
    try {
      if (!overlays || overlays.length === 0) return null;

      // 🔥 프로젝트별 폰트 설정 적용
      // fontConfig.title_font가 있으면 해당 프리셋 사용, 없으면 시스템 폰트
      const fontPath = fontConfig?.title_font
        ? resolveFontPreset(fontConfig.title_font)
        : findTitleFontPath();
      const textFilePaths: string[] = [];
      const filters: string[] = [];

      // 🔥 폰트 파일 검증 (런타임)
      const fontExists = fs.existsSync(fontPath);
      const fontStats = fontExists ? fs.statSync(fontPath) : null;
      logger.info({
        fontPath,
        fontExists,
        fontSizeBytes: fontStats?.size || 0,
        fontSizeMB: fontStats ? (fontStats.size / 1024 / 1024).toFixed(2) : 0,
        fontReadable: fontExists && fontStats && fontStats.size > 0
      }, '[FONT CHECK] Scene overlay font verification');

      if (!fontExists || !fontStats || fontStats.size === 0) {
        logger.error({ fontPath }, '[FONT ERROR] Font file does not exist or is empty!');
      }

      // 🔥 스타일: 프로젝트 설정 또는 기본값 (노란 배경 + 검은 텍스트)
      const defaultFontSize = orientation === OrientationEnum.portrait ? 52 : 42;
      const fontSize = fontConfig?.title_size || defaultFontSize;
      const textColor = fontConfig?.title_color?.replace('#', '') || '000000';  // 검은색
      const bgColor = fontConfig?.title_bg_color?.replace('#', '') || 'FFEB3B';    // 노란색
      const yPosition = orientation === OrientationEnum.portrait ? 'h*0.08' : 'h*0.06';

      logger.info({
        fontConfig: fontConfig || 'DEFAULT',
        fontSize,
        textColor,
        bgColor,
        fontPath
      }, '[FONT CONFIG] Scene overlay using project font config');

      overlays.forEach((overlay, index) => {
        const startTime = overlay.startMs / 1000;
        const endTime = overlay.endMs / 1000;
        const displayText = overlay.text?.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();

        if (!displayText) return;

        if (tempDir) {
          // UTF-8 텍스트 파일 방식 (한글 지원)
          const textFilePath = path.join(tempDir, `overlay_${Date.now()}_${index}.txt`);
          fs.writeFileSync(textFilePath, displayText, 'utf-8');
          textFilePaths.push(textFilePath);

          // 🔥 텍스트 파일 검증
          const writtenContent = fs.readFileSync(textFilePath, 'utf-8');
          const textFileExists = fs.existsSync(textFilePath);
          const textFileStats = textFileExists ? fs.statSync(textFilePath) : null;

          logger.info({
            textFilePath,
            textFileExists,
            textFileSizeBytes: textFileStats?.size || 0,
            originalText: overlay.text?.substring(0, 50),
            displayText: displayText.substring(0, 50),
            writtenContent: writtenContent.substring(0, 50),
            writtenLength: writtenContent.length,
            writtenBytes: Buffer.from(writtenContent, 'utf-8').length,
            fontPath,
            startTime,
            endTime
          }, '[DEBUG] Scene overlay textfile created and verified');

          const safeFontPath = toFFmpegPath(fontPath);
          const safeTextPath = toFFmpegPath(textFilePath);

          // 🔥 필터 문자열 생성 및 로깅
          const filterStr = `drawtext=fontfile=${safeFontPath}:textfile=${safeTextPath}:fontcolor=0x${textColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=0x${bgColor}@0.95:boxborderw=20:enable=between(t\\,${startTime}\\,${endTime})`;

          if (index === 0) {
            logger.info({
              filterStr: filterStr.substring(0, 300),
              safeFontPath,
              safeTextPath
            }, '[FILTER DEBUG] First scene overlay filter string');
          }

          filters.push(filterStr);
        } else {
          // 인라인 방식 (한글 깨질 수 있음)
          const escapedText = displayText.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:');
          const safeFontPathFallback = toFFmpegPath(fontPath);
          filters.push(
            `drawtext=fontfile=${safeFontPathFallback}:text='${escapedText}':fontcolor=0x${textColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=0x${bgColor}@0.95:boxborderw=20:enable=between(t\\,${startTime}\\,${endTime})`
          );
        }
      });

      if (filters.length === 0) return null;

      logger.info({
        overlayCount: overlays.length,
        filterCount: filters.length,
        textFileCount: textFilePaths.length,
        fontPath,
        tempDir: tempDir || 'UNDEFINED'
      }, "Created scene overlay filter (씬별 제목)");

      return { filter: filters.join(','), textFilePaths };
    } catch (error) {
      logger.warn(error, "Could not create scene overlay filter");
      return null;
    }
  }
}

export default SubtitleFilter;
