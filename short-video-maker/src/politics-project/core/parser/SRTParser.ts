/**
 * SRT Parser
 *
 * SRT 자막 파일을 파싱하여 구조화된 데이터로 변환합니다.
 */

import fs from 'fs-extra';
import { logger } from '../../../logger';
import { SubtitleEntry, ParsedSubtitle } from './types';

export class SRTParser {
  /**
   * SRT 파일 파싱
   */
  async parseFile(filePath: string): Promise<ParsedSubtitle> {
    logger.info({ filePath }, 'SRT 파일 파싱 시작');

    const content = await fs.readFile(filePath, 'utf-8');
    return this.parse(content);
  }

  /**
   * SRT 문자열 파싱
   */
  parse(content: string): ParsedSubtitle {
    const entries = this.parseEntries(content);
    const totalDuration = this.calculateDuration(entries);
    const language = this.detectLanguage(entries);

    logger.info({
      entryCount: entries.length,
      totalDuration,
      language
    }, 'SRT 파싱 완료');

    return {
      entries,
      totalDuration,
      language
    };
  }

  /**
   * SRT 엔트리 파싱
   */
  private parseEntries(content: string): SubtitleEntry[] {
    const entries: SubtitleEntry[] = [];

    // SRT 블록 분리 (빈 줄로 구분)
    const blocks = content.trim().split(/\n\s*\n/);

    for (const block of blocks) {
      const entry = this.parseBlock(block);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * 개별 SRT 블록 파싱
   *
   * 형식:
   * 1
   * 00:00:01,000 --> 00:00:04,000
   * 자막 텍스트
   */
  private parseBlock(block: string): SubtitleEntry | null {
    const lines = block.trim().split('\n');

    if (lines.length < 3) {
      return null;
    }

    // 첫 줄: 인덱스
    const index = parseInt(lines[0], 10);
    if (isNaN(index)) {
      return null;
    }

    // 두 번째 줄: 타임스탬프
    const timeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );

    if (!timeMatch) {
      return null;
    }

    const startSec = this.timeToSeconds(
      timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]
    );
    const endSec = this.timeToSeconds(
      timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]
    );

    // 나머지: 텍스트
    const text = lines.slice(2).join('\n').trim();

    return { index, startSec, endSec, text };
  }

  /**
   * 타임스탬프 → 초 변환
   */
  private timeToSeconds(h: string, m: string, s: string, ms: string): number {
    return (
      parseInt(h, 10) * 3600 +
      parseInt(m, 10) * 60 +
      parseInt(s, 10) +
      parseInt(ms, 10) / 1000
    );
  }

  /**
   * 전체 길이 계산
   */
  private calculateDuration(entries: SubtitleEntry[]): number {
    if (entries.length === 0) return 0;
    return entries[entries.length - 1].endSec;
  }

  /**
   * 언어 감지 (간단한 휴리스틱)
   */
  private detectLanguage(entries: SubtitleEntry[]): string {
    const sample = entries.slice(0, 10).map(e => e.text).join(' ');

    // 한글 포함 여부
    if (/[\uac00-\ud7af]/.test(sample)) {
      return 'ko';
    }

    return 'en';
  }

  /**
   * 시간 범위로 자막 필터링
   */
  filterByTimeRange(
    entries: SubtitleEntry[],
    startSec: number,
    endSec: number
  ): SubtitleEntry[] {
    return entries.filter(
      e => e.startSec >= startSec && e.endSec <= endSec
    );
  }

  /**
   * 자막을 텍스트로 합치기
   */
  toPlainText(entries: SubtitleEntry[]): string {
    return entries.map(e => e.text).join(' ');
  }
}
