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
import { logger } from "../../../logger";
import { OrientationEnum, TitleTextConfig } from "../../../types/shorts";
import { findAvailableFontPath } from "./utils";

export class SubtitleFilter {
  /**
   * TikTok/Shorts style subtitle filter
   * Highlights current word in yellow
   */
  createSubtitleFilter(captions: any[], orientation: OrientationEnum): string | null {
    try {
      if (!captions || captions.length === 0) return null;

      const fontSize = orientation === OrientationEnum.portrait ? 52 : 60;
      const yPosition = orientation === OrientationEnum.portrait ? 'h*0.72' : 'h*0.78';
      const fontPath = findAvailableFontPath();

      const normalColor = 'FFFFFF';
      const highlightColor = 'FFEB3B';
      const borderColor = 'black';
      const borderWidth = 4;

      // Group words for display (2-3 words together)
      const wordGroups = this.groupWordsForDisplay(captions, 3);
      const drawTextFilters: string[] = [];

      wordGroups.forEach((group) => {
        const groupStartTime = group[0].startMs / 1000;
        const groupEndTime = group[group.length - 1].endMs / 1000;

        group.forEach((word) => {
          const wordStartTime = word.startMs / 1000;
          const wordEndTime = word.endMs / 1000;

          const text = word.text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:').toUpperCase();

          // fontcolor_expr for time-based color change
          const fontcolorExpr = `if(between(t\\,${wordStartTime}\\,${wordEndTime})\\,0x${highlightColor}\\,0x${normalColor})`;

          drawTextFilters.push(
            `drawtext=fontfile=${fontPath}:` +
            `text='${text} ':` +
            `fontcolor_expr=${fontcolorExpr}:` +
            `fontsize=${fontSize}:` +
            `x=(w-tw)/2:` +
            `y=${yPosition}:` +
            `borderw=${borderWidth}:` +
            `bordercolor=${borderColor}:` +
            `enable=between(t\\,${groupStartTime}\\,${groupEndTime})`
          );
        });
      });

      // Too many filters can cause performance issues
      if (drawTextFilters.length > 50) {
        return this.createSimplifiedSubtitleFilter(captions, orientation);
      }

      return drawTextFilters.join(',');
    } catch (error) {
      logger.warn(error, "Could not create subtitle filter, falling back to simplified version");
      return this.createSimplifiedSubtitleFilter(captions, orientation);
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
   * Simplified TikTok style subtitle filter (single word, yellow)
   */
  private createSimplifiedSubtitleFilter(captions: any[], orientation: OrientationEnum): string | null {
    try {
      if (!captions || captions.length === 0) return null;

      const fontSize = orientation === OrientationEnum.portrait ? 56 : 64;
      const yPosition = orientation === OrientationEnum.portrait ? 'h*0.72' : 'h*0.78';
      const fontPath = findAvailableFontPath();

      const fontColor = 'FFEB3B'; // Yellow
      const borderColor = 'black';
      const borderWidth = 5;
      const shadowColor = 'black@0.7';

      const drawTextFilters = captions.map((caption) => {
        const startTime = caption.startMs / 1000;
        const endTime = caption.endMs / 1000;
        const text = caption.text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:').toUpperCase();

        return `drawtext=fontfile=${fontPath}:text='${text}':fontcolor=0x${fontColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}:borderw=${borderWidth}:bordercolor=${borderColor}:shadowcolor=${shadowColor}:shadowx=3:shadowy=3:enable=between(t\\,${startTime}\\,${endTime})`;
      });

      return drawTextFilters.join(',');
    } catch (error) {
      logger.warn(error, "Could not create simplified subtitle filter");
      return null;
    }
  }

  /**
   * Dual language subtitle filter
   * Korean (primary) on top, English (secondary) below
   *
   * NOTE: Korean text uses textfile method for UTF-8 support
   */
  createDualLanguageSubtitleFilter(
    primaryCaptions: any[],
    secondaryCaptions: any[],
    orientation: OrientationEnum,
    tempDir?: string
  ): { filter: string; textFilePaths: string[] } | null {
    try {
      if (!primaryCaptions || primaryCaptions.length === 0) return null;

      const fontPath = findAvailableFontPath();
      const textFilePaths: string[] = [];

      // Korean settings (top)
      const primaryFontSize = orientation === OrientationEnum.portrait ? 48 : 56;
      const primaryYPosition = orientation === OrientationEnum.portrait ? 'h*0.68' : 'h*0.72';
      const primaryColor = 'FFFFFF';

      // English settings (bottom, smaller)
      const secondaryFontSize = orientation === OrientationEnum.portrait ? 36 : 44;
      const secondaryYPosition = orientation === OrientationEnum.portrait ? 'h*0.76' : 'h*0.82';
      const secondaryColor = 'B3E5FC';

      const borderColor = 'black';
      const borderWidth = 4;
      const shadowColor = 'black@0.7';

      const drawTextFilters: string[] = [];

      logger.info({
        tempDir: tempDir || 'UNDEFINED',
        captionCount: primaryCaptions.length,
        fontPath
      }, "Creating dual language subtitle filter");

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
            logger.info({
              textFilePath,
              captionText: caption.text.substring(0, 30),
              encoding: 'utf-8'
            }, "First subtitle text file created");
          }

          drawTextFilters.push(
            `drawtext=fontfile=${fontPath}:textfile='${textFilePath}':fontcolor=0x${primaryColor}:fontsize=${primaryFontSize}:x=(w-text_w)/2:y=${primaryYPosition}:borderw=${borderWidth}:bordercolor=${borderColor}:shadowcolor=${shadowColor}:shadowx=2:shadowy=2:enable=between(t\\,${startTime}\\,${endTime})`
          );
        } else {
          // Fallback: inline text (Korean may show as boxes)
          const text = caption.text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:');
          drawTextFilters.push(
            `drawtext=fontfile=${fontPath}:text='${text}':fontcolor=0x${primaryColor}:fontsize=${primaryFontSize}:x=(w-text_w)/2:y=${primaryYPosition}:borderw=${borderWidth}:bordercolor=${borderColor}:shadowcolor=${shadowColor}:shadowx=2:shadowy=2:enable=between(t\\,${startTime}\\,${endTime})`
          );
        }
      });

      // English subtitles (secondary) - inline works fine for English
      if (secondaryCaptions && secondaryCaptions.length > 0) {
        secondaryCaptions.forEach((caption) => {
          const startTime = caption.startMs / 1000;
          const endTime = caption.endMs / 1000;
          const text = caption.text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:');

          drawTextFilters.push(
            `drawtext=fontfile=${fontPath}:text='${text}':fontcolor=0x${secondaryColor}:fontsize=${secondaryFontSize}:x=(w-text_w)/2:y=${secondaryYPosition}:borderw=${borderWidth}:bordercolor=${borderColor}:shadowcolor=${shadowColor}:shadowx=2:shadowy=2:enable=between(t\\,${startTime}\\,${endTime})`
          );
        });
      }

      logger.info({
        primaryCount: primaryCaptions.length,
        secondaryCount: secondaryCaptions?.length || 0,
        textFileCount: textFilePaths.length,
        usingTextFiles: !!tempDir
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
   * NOTE: Korean text uses textfile method for UTF-8 support
   */
  createTitleTextFilter(
    titleText: TitleTextConfig,
    orientation: OrientationEnum,
    videoDuration: number,
    tempDir?: string
  ): { filter: string; textFilePath?: string } | null {
    try {
      if (!titleText || !titleText.ko) return null;

      const fontPath = findAvailableFontPath();

      // Settings
      const style = titleText.style || 'highlight';
      const position = titleText.position || 'top';
      const fontSize = titleText.fontSize || (orientation === OrientationEnum.portrait ? 42 : 48);

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

      // Display duration
      const duration = titleText.duration === 'full' || !titleText.duration
        ? videoDuration
        : titleText.duration;

      // Build filter
      let filter: string;
      let textFilePath: string | undefined;

      if (tempDir) {
        // textfile method for Korean support
        textFilePath = path.join(tempDir, `title_text_${Date.now()}.txt`);
        fs.writeFileSync(textFilePath, titleText.ko, 'utf-8');
        logger.info({ textFilePath, text: titleText.ko }, "Created UTF-8 title text file for FFmpeg");

        filter = `drawtext=fontfile=${fontPath}:textfile='${textFilePath}':fontcolor=0x${textColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}`;
      } else {
        // Fallback: inline text (Korean may not render correctly)
        const text = titleText.ko.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:').replace(/\n/g, '\\n');
        filter = `drawtext=fontfile=${fontPath}:text='${text}':fontcolor=0x${textColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}`;
        logger.warn({ text: titleText.ko }, "Using inline text for FFmpeg (Korean may not render correctly)");
      }

      if (useBox) {
        filter += `:box=1:boxcolor=0x${backgroundColor}@0.95:boxborderw=15`;
      } else {
        filter += ':borderw=4:bordercolor=black:shadowcolor=black@0.7:shadowx=2:shadowy=2';
      }

      // Add enable if not full duration
      if (titleText.duration !== 'full' && typeof titleText.duration === 'number') {
        filter += `:enable=between(t\\,0\\,${duration})`;
      }

      logger.debug({
        titleText: titleText.ko,
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
}

export default SubtitleFilter;
