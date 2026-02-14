/**
 * HookTextOverlayNode
 * n8n 노드 패턴 — 이미지/비디오에 굵은 한국어 후크 텍스트 오버레이
 *
 * Input:  HookTextOverlayInput (경로 + 텍스트 + 설정)
 * Output: HookTextOverlayOutput (결과 경로)
 *
 * 멘탈훈련소(@mental_TC) 스타일: 굵은 흰색 텍스트 + 검정 테두리 + 반투명 배경
 * 한국어 텍스트는 textfile= 방식 사용 (Windows CP949 인코딩 문제 방지)
 *
 * @version 12.0.1
 */

import path from 'path';
import fs from 'fs-extra';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from '../../../config';
import { findTitleFontPath } from '../../../YTB-ffmpeg/utils';

// ============================================
// Types (n8n 노드 패턴)
// ============================================

export interface HookTextOverlayInput {
  inputPath: string;
  inputType: 'image' | 'video';
  hookText: string;
  config?: HookTextOverlayConfig;
}

export interface HookTextOverlayConfig {
  position?: 'top' | 'top-center' | 'center' | 'bottom';
  fontSize?: number;
  fontColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  startSec?: number;
  endSec?: number;
  paddingX?: number;
  paddingY?: number;
}

export interface HookTextOverlayOutput {
  success: boolean;
  outputPath?: string;
  error?: string;
}

// ============================================
// Position mapping
// ============================================

const POSITION_MAP: Record<string, string> = {
  'top':        'y=h*0.05',
  'top-center': 'y=h*0.12',
  'center':     'y=(h-text_h)/2',
  'bottom':     'y=h*0.75',
};

// ============================================
// Node implementation
// ============================================

export class HookTextOverlayNode {

  /**
   * 이미지/비디오에 후크 텍스트 오버레이 적용
   */
  async apply(input: HookTextOverlayInput): Promise<HookTextOverlayOutput> {
    const { inputPath, inputType, hookText, config } = input;

    if (!hookText || hookText.trim().length === 0) {
      return { success: false, error: 'hookText is empty' };
    }

    if (!await fs.pathExists(inputPath)) {
      return { success: false, error: `Input file not found: ${inputPath}` };
    }

    const ext = inputType === 'image' ? '.jpg' : '.mp4';
    const outputPath = inputPath.replace(/\.[^.]+$/, `_hook${ext}`);

    // 한국어 텍스트를 UTF-8 파일로 저장 (Windows CP949 인코딩 문제 방지)
    const textFilePath = inputPath.replace(/\.[^.]+$/, `_hooktext_${Date.now()}.txt`);

    try {
      const fontPath = findTitleFontPath();

      // NFC 정규화 + UTF-8 파일 저장 (SubtitleFilter 패턴)
      const normalizedText = hookText.normalize('NFC');
      await fs.writeFile(textFilePath, normalizedText, 'utf-8');

      const filter = this.buildDrawtextFilter(textFilePath, fontPath, config, inputType);

      await this.runFFmpeg(inputPath, outputPath, filter, inputType);

      logger.info({
        inputPath,
        outputPath,
        hookText: hookText.substring(0, 30),
        position: config?.position || 'top-center',
      }, '[HookTextOverlay] Overlay applied');

      return { success: true, outputPath };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, inputPath, hookText }, '[HookTextOverlay] Failed to apply overlay');
      return { success: false, error: msg };
    } finally {
      // 임시 텍스트 파일 정리
      await fs.remove(textFilePath).catch(() => {});
    }
  }

  /**
   * FFmpeg drawtext 필터 문자열 생성 (textfile= 방식 — 한국어 UTF-8 안전)
   */
  private buildDrawtextFilter(
    textFilePath: string,
    fontPath: string,
    config?: HookTextOverlayConfig,
    inputType: 'image' | 'video' = 'video',
  ): string {
    const fontSize = config?.fontSize ?? 64;
    const fontColor = config?.fontColor ?? 'white';
    const strokeColor = config?.strokeColor ?? 'black';
    const strokeWidth = config?.strokeWidth ?? 3;
    const bgColor = config?.backgroundColor ?? 'black@0.3';
    const position = config?.position ?? 'top-center';
    const paddingX = config?.paddingX ?? 24;

    const yExpr = POSITION_MAP[position] || POSITION_MAP['top-center'];

    // FFmpeg path escaping (Windows: backslash→slash, colon escape)
    const safeFontPath = this.toFFmpegPath(fontPath);
    const safeTextPath = this.toFFmpegPath(textFilePath);

    let filter = `drawtext=fontfile=${safeFontPath}` +
      `:textfile=${safeTextPath}` +
      `:fontsize=${fontSize}` +
      `:fontcolor=${fontColor}` +
      `:borderw=${strokeWidth}` +
      `:bordercolor=${strokeColor}` +
      `:x=(w-text_w)/2` +
      `:${yExpr}` +
      `:box=1` +
      `:boxcolor=${bgColor}` +
      `:boxborderw=${paddingX}`;

    // Video: time-based enable
    if (inputType === 'video' && (config?.startSec !== undefined || config?.endSec !== undefined)) {
      const start = config?.startSec ?? 0;
      const end = config?.endSec ?? 9999;
      filter += `:enable='between(t,${start},${end})'`;
    }

    return filter;
  }

  /**
   * FFmpeg 실행
   */
  private runFFmpeg(
    inputPath: string,
    outputPath: string,
    filter: string,
    inputType: 'image' | 'video',
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath);

      if (inputType === 'image') {
        // 이미지 → 이미지 (단일 프레임)
        command
          .outputOptions(['-vframes', '1'])
          .videoFilters(filter)
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      } else {
        // 비디오 → 비디오
        command
          .videoFilters(filter)
          .outputOptions(['-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p'])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      }
    });
  }

  /**
   * Windows/Linux 경로를 FFmpeg 안전 형식으로 변환
   */
  private toFFmpegPath(filePath: string): string {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      const safePath = filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
      return `'${safePath}'`;
    }
    return filePath.replace(/\\/g, '/');
  }
}
