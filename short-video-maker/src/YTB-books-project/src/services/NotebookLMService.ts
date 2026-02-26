/**
 * NotebookLMService — n8n 노드 패턴
 *
 * NotebookLM 연동의 모든 로직을 단일 노드로 캡슐화:
 * - exportSources(): Neo4j 청크 → MD 파일 (NotebookLM "Copied Text")
 * - exportPrompts(): LM_Prompt → prompts/ 복사 (NotebookLM "Describe")
 * - exportPackage(): sources + prompts 통합 패키지
 * - exportEpisodes(): 에피소드 → MD 파일
 * - importSlides(): NotebookLM 슬라이드 PNG → slides/ 저장
 * - getChaptersAsJson(): API용 JSON 반환 (파일 저장 안 함)
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { logger } from '../../../config';
import type { BookChunk, EpisodeWithScenes } from '../types';

// ============================================
// Input / Output 인터페이스
// ============================================

export interface ExportPackageInput {
  bookId: string;
  chunks: BookChunk[];
  lmPromptDir?: string; // docs/LM_Prompt 경로 (없으면 prompts/ 건너뜀)
}

export interface ExportPackageOutput {
  baseDir: string;
  sources: { dir: string; fileCount: number; files: string[] };
  prompts: { dir: string; fileCount: number; files: string[] };
}

export interface ExportEpisodesInput {
  bookId: string;
  episodes: EpisodeWithScenes[];
}

export interface ExportEpisodesOutput {
  outputDir: string;
  episodes: Array<{ episodeNumber: number; title: string; fileName: string; markdown: string }>;
}

export interface ImportSlidesInput {
  bookId: string;
  slidePaths?: string[];   // 개별 파일 경로
  slideDir?: string;       // 또는 디렉토리 경로
  episodeId?: string;
  style?: string;
}

export interface ImportSlidesOutput {
  slidesDir: string;
  importedCount: number;
  slides: Array<{ index: number; file: string }>;
}

export interface ChapterJson {
  chapterNumber: number;
  title: string;
  summary: string;
  keywords: string[];
  markdown: string;
  estimatedShorts: number;
  textLength: number;
}

// ============================================
// Service
// ============================================

export class NotebookLMService {
  private downloadsBase: string;

  constructor(downloadsBase?: string) {
    this.downloadsBase = downloadsBase || path.join(process.cwd(), 'downloads', 'books', 'notebookLM');
  }

  private getBookSlug(bookId: string): string {
    return bookId.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
  }

  /**
   * 청크 → JSON 챕터 배열 (파일 저장 없이 API 반환용)
   */
  getChaptersAsJson(bookId: string, chunks: BookChunk[]): { chapters: ChapterJson[]; fullMarkdown: string } {
    const chapters: ChapterJson[] = chunks.map((chunk, idx) => {
      const title = chunk.sectionTitle || `섹션 ${idx + 1}`;
      const summary = chunk.summary || '';
      const keywords = chunk.keywords || [];
      const cleanedText = this.cleanGarbledText(chunk.text || '');
      const estimatedShorts = Math.max(1, Math.ceil(cleanedText.length / 1500));

      let markdown = `# ${title}\n\n`;
      if (summary) markdown += `> ${summary}\n\n`;
      if (keywords.length > 0) markdown += `**키워드**: ${keywords.join(', ')}\n\n`;
      markdown += `---\n\n${cleanedText}`;

      return { chapterNumber: idx + 1, title, summary, keywords, markdown, estimatedShorts, textLength: cleanedText.length };
    });

    const bookTitle = bookId.replace(/\.pdf$/i, '');
    const fullMarkdown = `# ${bookTitle}\n\n` +
      chapters.map(ch => `## ${ch.title}\n\n${ch.summary ? `> ${ch.summary}\n\n` : ''}${this.cleanGarbledText(chunks[ch.chapterNumber - 1].text)}`).join('\n\n---\n\n');

    return { chapters, fullMarkdown };
  }

  /**
   * 통합 패키지: sources/ + prompts/ 생성
   */
  exportPackage(input: ExportPackageInput): ExportPackageOutput {
    const bookSlug = this.getBookSlug(input.bookId);
    const baseDir = path.join(this.downloadsBase, bookSlug);
    const sourcesDir = path.join(baseDir, 'sources');
    const promptsDir = path.join(baseDir, 'prompts');
    fs.mkdirSync(sourcesDir, { recursive: true });
    fs.mkdirSync(promptsDir, { recursive: true });

    // 1. Sources (챕터 MD)
    const sourceFiles = this.writeChunkMds(sourcesDir, input.chunks);

    // 2. Prompts (LM_Prompt 복사)
    const promptFiles = input.lmPromptDir ? this.copyPrompts(input.lmPromptDir, promptsDir) : [];

    logger.info({ bookId: input.bookId, sources: sourceFiles.length, prompts: promptFiles.length, baseDir }, 'NotebookLM package exported');

    return {
      baseDir,
      sources: { dir: sourcesDir, fileCount: sourceFiles.length, files: sourceFiles },
      prompts: { dir: promptsDir, fileCount: promptFiles.length, files: promptFiles },
    };
  }

  /**
   * 에피소드 MD 내보내기
   */
  exportEpisodes(input: ExportEpisodesInput): ExportEpisodesOutput {
    const bookSlug = this.getBookSlug(input.bookId);
    const outputDir = path.join(this.downloadsBase, bookSlug, 'episodes');
    fs.mkdirSync(outputDir, { recursive: true });

    const results: ExportEpisodesOutput['episodes'] = [];

    for (const ep of input.episodes) {
      let md = `# EP${String(ep.episodeNumber).padStart(2, '0')}: ${ep.title}\n\n`;
      md += `**Hook**: ${ep.hook}\n`;
      md += `**CTA**: ${ep.cta}\n`;
      if (ep.keywords.length > 0) md += `**Keywords**: ${ep.keywords.join(', ')}\n`;
      if (ep.description) md += `**Description**: ${ep.description}\n`;
      md += `\n---\n\n## Scenes\n\n`;
      md += `| # | Type | Duration | Narration | Visual |\n`;
      md += `|---|------|----------|-----------|--------|\n`;

      for (const sc of ep.scenes) {
        const narr = sc.narration.replace(/\|/g, '\\|').substring(0, 80);
        const vis = sc.visualDesc.replace(/\|/g, '\\|').substring(0, 60);
        md += `| ${sc.sceneNumber} | ${sc.type} | ${sc.durationSec}s | ${narr} | ${vis} |\n`;
      }
      md += `\n---\n\n`;

      // VEO 키프레임
      const veoScenes = ep.scenes.filter(s => s.firstFramePrompt || s.lastFramePrompt);
      if (veoScenes.length > 0) {
        md += `## VEO Keyframes\n\n`;
        for (const sc of veoScenes) {
          md += `### Scene ${sc.sceneNumber} (${sc.type})\n`;
          if (sc.firstFramePrompt) md += `- **First Frame**: ${sc.firstFramePrompt}\n`;
          if (sc.lastFramePrompt) md += `- **Last Frame**: ${sc.lastFramePrompt}\n`;
          md += `\n`;
        }
      }

      // 수식
      const formulaScenes = ep.scenes.filter(s => s.assignedFormula);
      if (formulaScenes.length > 0) {
        md += `## Formulas\n\n`;
        for (const sc of formulaScenes) {
          md += `- Scene ${sc.sceneNumber}: \`${sc.assignedFormula}\` — ${sc.formulaName || ''} (${sc.formulaMetaphor || ''})\n`;
        }
      }

      const fileName = `EP${String(ep.episodeNumber).padStart(2, '0')}_${ep.title.replace(/[^a-zA-Z0-9가-힣_-]/g, '_').substring(0, 40)}.md`;
      fs.writeFileSync(path.join(outputDir, fileName), md, 'utf-8');
      results.push({ episodeNumber: ep.episodeNumber, title: ep.title, fileName, markdown: md });
    }

    logger.info({ bookId: input.bookId, count: results.length, outputDir }, 'Episodes exported');
    return { outputDir, episodes: results };
  }

  /**
   * NotebookLM 슬라이드 임포트 (PNG/JPG/PDF 지원)
   * PDF → pymupdf/pdftoppm/magick 자동 변환 → PNG
   */
  async importSlides(input: ImportSlidesInput): Promise<ImportSlidesOutput> {
    let imageFiles: string[] = [];
    let tempConvertedDir: string | null = null;

    if (input.slideDir) {
      if (!fs.existsSync(input.slideDir)) {
        throw new Error(`Directory not found: ${input.slideDir}`);
      }
      const allFiles = fs.readdirSync(input.slideDir);

      // 1. PDF 파일 → PNG 변환
      const pdfFiles = allFiles.filter(f => /\.pdf$/i.test(f)).sort();
      if (pdfFiles.length > 0) {
        tempConvertedDir = path.join(input.slideDir, '_pdf_converted');
        for (const pdf of pdfFiles) {
          const pdfPath = path.join(input.slideDir, pdf);
          const converted = await this.convertPdfToImages(pdfPath, tempConvertedDir);
          imageFiles.push(...converted);
        }
      }

      // 2. PPTX 경고 (미지원 — PowerPoint/Google Slides에서 PDF로 재내보내기 필요)
      const pptxFiles = allFiles.filter(f => /\.pptx?$/i.test(f));
      if (pptxFiles.length > 0) {
        logger.warn({ files: pptxFiles }, 'PPTX not supported. Export as PDF from PowerPoint/Google Slides first.');
      }

      // 3. 기존 이미지 파일 수집 (slide_NNN.png 같은 이전 결과물은 제외)
      const existingImages = allFiles
        .filter(f => /\.(png|jpg|jpeg)$/i.test(f) && !f.startsWith('slide_'))
        .sort()
        .map(f => path.join(input.slideDir!, f));
      imageFiles.push(...existingImages);

    } else if (input.slidePaths) {
      // slidePaths에서도 PDF 감지
      const pdfPaths = input.slidePaths.filter(f => /\.pdf$/i.test(f));
      const imagePaths = input.slidePaths.filter(f => /\.(png|jpg|jpeg)$/i.test(f));

      if (pdfPaths.length > 0) {
        tempConvertedDir = path.join(path.dirname(pdfPaths[0]), '_pdf_converted');
        for (const pdfPath of pdfPaths) {
          const converted = await this.convertPdfToImages(pdfPath, tempConvertedDir);
          imageFiles.push(...converted);
        }
      }
      imageFiles.push(...imagePaths);
    }

    if (imageFiles.length === 0) {
      throw new Error('No image files found (PNG/JPG/PDF supported)');
    }

    // slides/ 디렉토리에 정규화된 이름으로 복사
    const bookSlug = this.getBookSlug(input.bookId);
    const slidesDir = path.join(this.downloadsBase, bookSlug, 'slides');
    fs.mkdirSync(slidesDir, { recursive: true });

    const slides: ImportSlidesOutput['slides'] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const srcPath = imageFiles[i];
      if (!fs.existsSync(srcPath)) {
        logger.warn({ srcPath }, 'Slide file not found, skipping');
        continue;
      }
      const ext = path.extname(srcPath);
      const destName = `slide_${String(i + 1).padStart(3, '0')}${ext}`;
      const destPath = path.join(slidesDir, destName);
      fs.copyFileSync(srcPath, destPath);
      slides.push({ index: i, file: destPath });
    }

    // temp 디렉토리 정리
    if (tempConvertedDir && fs.existsSync(tempConvertedDir)) {
      try { fs.rmSync(tempConvertedDir, { recursive: true }); } catch {}
    }

    logger.info({ bookId: input.bookId, slideCount: slides.length, slidesDir }, 'NotebookLM slides imported');
    return { slidesDir, importedCount: slides.length, slides };
  }

  // ============================================
  // Private helpers
  // ============================================

  /**
   * PDF OCR 깨짐 텍스트 정리
   *
   * 문제: PDF 한문(漢文) 원문이 OCR 과정에서 `軍zC b 同軍z¿` 같이 깨짐
   * 한국어 번역/해설은 정상이므로, 깨진 줄 제거 + 인라인 가비지 정리
   */
  private cleanGarbledText(text: string): string {
    const lines = text.split('\n');
    const cleaned: string[] = [];
    let removedCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // 빈 줄 유지 (단락 구분)
      if (!trimmed) { cleaned.push(''); continue; }

      // URL 줄 제거
      if (/^https?:\/\//.test(trimmed)) { removedCount++; continue; }

      // fullwidth 구두점만 있는 줄 제거 (，．：；▣ etc.)
      if (/^[，．：；！？▣\s\d,.;:!?()\-"'"']+$/.test(trimmed)) { removedCount++; continue; }

      // 한글 비율 계산
      const koreanChars = trimmed.match(/[\uAC00-\uD7AF]/g) || [];
      const nonSpace = trimmed.replace(/\s/g, '');
      if (nonSpace.length === 0) continue;

      const koreanRatio = koreanChars.length / nonSpace.length;

      // 한글 비율 15% 미만 → 깨진 한문 원문, 제거
      if (koreanRatio < 0.15) { removedCount++; continue; }

      // trailing garbage 정리 (한문/Latin-Extended 잔해)
      let cleanLine = this.trimTrailingGarbage(trimmed);

      // 빈 괄호 ( ) 제거 (한문 글자가 빠진 자리)
      cleanLine = cleanLine.replace(/\(\s*\)/g, '');

      // 빈 서명 마커 《 》 제거
      cleanLine = cleanLine.replace(/《\s*》/g, '');

      // 연속 공백 정리
      cleanLine = cleanLine.replace(/\s{2,}/g, ' ').trim();

      if (cleanLine) cleaned.push(cleanLine);
    }

    if (removedCount > 0) {
      logger.debug({ removedLines: removedCount }, 'Cleaned garbled OCR text');
    }

    return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * 줄 끝의 가비지 문자 제거
   * 마지막 한글 뒤에 Latin-Extended, CJK, 특수문자가 있으면 잘라냄
   */
  private trimTrailingGarbage(line: string): string {
    // 마지막 한글 위치 찾기
    let lastKoreanIdx = -1;
    for (let i = line.length - 1; i >= 0; i--) {
      const code = line.charCodeAt(i);
      if (code >= 0xAC00 && code <= 0xD7AF) {
        lastKoreanIdx = i;
        break;
      }
    }

    if (lastKoreanIdx < 0) return line;

    const trailing = line.substring(lastKoreanIdx + 1);

    // trailing에 가비지 지표 문자가 있는지 확인
    const garbagePattern = /[\u00C0-\u024F\u4E00-\u9FFF\uFF00-\uFFEF《》ﬁﬂ˙˛˚ˆ†‰ŁłßÞÒÛ§æâ¿¨]/;

    if (garbagePattern.test(trailing)) {
      // 마지막 한글 + 뒤따르는 표준 구두점만 유지
      let end = lastKoreanIdx + 1;
      while (end < line.length && /[\s.,!?"'"')\]:;\-]/.test(line[end])) {
        end++;
      }
      return line.substring(0, end).trim();
    }

    return line;
  }

  // ============================================
  // PDF → PNG 변환
  // ============================================

  /**
   * PDF → PNG 변환 (3단계 fallback: pdftoppm → pymupdf → magick)
   */
  private async convertPdfToImages(pdfPath: string, outputDir: string): Promise<string[]> {
    fs.mkdirSync(outputDir, { recursive: true });
    const baseName = path.basename(pdfPath, path.extname(pdfPath));

    // Tool 1: pdftoppm (poppler-utils) — Linux/Docker 최적
    try {
      const prefix = path.join(outputDir, baseName).replace(/\\/g, '/');
      await this.execAsync(`pdftoppm -png -r 300 "${pdfPath.replace(/\\/g, '/')}" "${prefix}"`);
      const files = this.collectConvertedFiles(outputDir, baseName);
      if (files.length > 0) {
        logger.info({ tool: 'pdftoppm', pages: files.length }, 'PDF → PNG');
        return files;
      }
    } catch {
      logger.debug('pdftoppm not available');
    }

    // Tool 2: Python pymupdf — cross-platform, best quality
    try {
      const scriptPath = path.join(outputDir, '_convert.py');
      const script = [
        'import sys, os, fitz',
        'pdf_path, out_dir, base = sys.argv[1], sys.argv[2], sys.argv[3]',
        'doc = fitz.open(pdf_path)',
        'for i, page in enumerate(doc):',
        '    pix = page.get_pixmap(dpi=300)',
        '    pix.save(os.path.join(out_dir, f"{base}_{i+1:03d}.png"))',
        'print(f"converted {doc.page_count} pages")',
      ].join('\n');
      fs.writeFileSync(scriptPath, script, 'utf-8');

      await this.execAsync(
        `python3 "${scriptPath}" "${pdfPath.replace(/\\/g, '/')}" "${outputDir.replace(/\\/g, '/')}" "${baseName}"`,
        120000,
      );
      try { fs.unlinkSync(scriptPath); } catch {}

      const files = this.collectConvertedFiles(outputDir, baseName);
      if (files.length > 0) {
        logger.info({ tool: 'pymupdf', pages: files.length }, 'PDF → PNG');
        return files;
      }
    } catch (e) {
      logger.debug({ error: e }, 'pymupdf not available');
    }

    // Tool 3: ImageMagick
    try {
      const outPattern = path.join(outputDir, `${baseName}_%03d.png`).replace(/\\/g, '/');
      await this.execAsync(`magick -density 300 "${pdfPath.replace(/\\/g, '/')}" "${outPattern}"`);
      const files = this.collectConvertedFiles(outputDir, baseName);
      if (files.length > 0) {
        logger.info({ tool: 'magick', pages: files.length }, 'PDF → PNG');
        return files;
      }
    } catch {
      logger.debug('ImageMagick not available');
    }

    throw new Error(
      `PDF→PNG conversion failed for "${path.basename(pdfPath)}". Install one of:\n` +
      '  - poppler-utils: apt install poppler-utils\n' +
      '  - pymupdf: pip install pymupdf\n' +
      '  - ImageMagick: apt install imagemagick',
    );
  }

  private collectConvertedFiles(dir: string, baseName: string): string[] {
    return fs.readdirSync(dir)
      .filter(f => f.startsWith(baseName) && /\.(png|jpg|jpeg)$/i.test(f))
      .sort()
      .map(f => path.join(dir, f));
  }

  private execAsync(command: string, timeoutMs = 60000): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      });
    });
  }

  // ============================================
  // Chunk / Prompt helpers
  // ============================================

  private writeChunkMds(dir: string, chunks: BookChunk[]): string[] {
    const files: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const title = chunk.sectionTitle || `섹션 ${i + 1}`;
      const titleSlug = title.replace(/[^a-zA-Z0-9가-힣_-]/g, '_').substring(0, 40);
      const fileName = `CH${String(i + 1).padStart(2, '0')}_${titleSlug}.md`;

      let content = `# ${title}\n\n`;
      if (chunk.summary) content += `> ${chunk.summary}\n\n`;
      if (chunk.keywords && chunk.keywords.length > 0) {
        content += `**키워드**: ${chunk.keywords.join(', ')}\n\n`;
      }
      content += `---\n\n${this.cleanGarbledText(chunk.text)}`;

      fs.writeFileSync(path.join(dir, fileName), content, 'utf-8');
      files.push(`sources/${fileName}`);
    }
    return files;
  }

  private copyPrompts(srcDir: string, destDir: string): string[] {
    if (!fs.existsSync(srcDir)) return [];
    const copied: string[] = [];

    const recurse = (src: string, dest: string, prefix: string) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          recurse(srcPath, destPath, `${prefix}${entry.name}/`);
        } else if (entry.name.endsWith('.md')) {
          fs.copyFileSync(srcPath, destPath);
          copied.push(`prompts/${prefix}${entry.name}`);
        }
      }
    };

    recurse(srcDir, destDir, '');
    return copied;
  }
}

// Singleton factory
let _instance: NotebookLMService | null = null;
export function getNotebookLMService(): NotebookLMService {
  if (!_instance) _instance = new NotebookLMService();
  return _instance;
}
