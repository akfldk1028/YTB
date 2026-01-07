/**
 * Vertical Cropper
 *
 * 16:9 영상을 9:16 세로 영상으로 크롭합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../../logger';
import { CropOptions, TimeRange } from './types';

const execAsync = promisify(exec);

export class VerticalCropper {
  /**
   * 영상을 9:16 세로 비율로 크롭
   */
  async crop(options: CropOptions): Promise<string> {
    const { inputPath, outputPath, timeRange, targetAspect } = options;

    logger.info({
      inputPath,
      timeRange,
      targetAspect
    }, '영상 크롭 시작');

    await fs.ensureDir(path.dirname(outputPath));

    const filter = this.buildCropFilter(targetAspect);
    const timeArgs = this.buildTimeArgs(timeRange);

    const cmd = [
      'ffmpeg -y',
      `-i "${inputPath}"`,
      timeArgs,
      `-vf "${filter}"`,
      '-c:v libx264 -preset fast -crf 23',
      '-c:a aac -b:a 128k',
      `"${outputPath}"`
    ].join(' ');

    logger.debug({ cmd }, 'FFmpeg 크롭 명령');

    await execAsync(cmd);

    logger.info({ outputPath }, '영상 크롭 완료');
    return outputPath;
  }

  /**
   * 크롭 필터 생성
   */
  private buildCropFilter(targetAspect: '9:16' | '16:9'): string {
    if (targetAspect === '9:16') {
      // 16:9 → 9:16: 중앙 부분만 잘라냄
      // 원본 높이 기준으로 9:16 비율 계산
      return 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=720:1280';
    }

    // 그대로 유지
    return 'scale=1920:1080';
  }

  /**
   * 시간 범위 인자 생성
   */
  private buildTimeArgs(timeRange: TimeRange): string {
    const duration = timeRange.endSec - timeRange.startSec;

    return `-ss ${timeRange.startSec} -t ${duration}`;
  }

  /**
   * 영상 정보 조회
   */
  async getVideoInfo(inputPath: string): Promise<{ width: number; height: number; duration: number }> {
    const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -of json "${inputPath}"`;

    const { stdout } = await execAsync(cmd);
    const info = JSON.parse(stdout);
    const stream = info.streams?.[0] || {};

    return {
      width: stream.width || 0,
      height: stream.height || 0,
      duration: parseFloat(stream.duration) || 0
    };
  }
}
