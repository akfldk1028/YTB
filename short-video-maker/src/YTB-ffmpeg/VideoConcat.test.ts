/**
 * VideoConcat Module Tests
 *
 * Tests for video concatenation with stream copy optimization
 */

process.env.LOG_LEVEL = "error";

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "fs-extra";
import path from "path";
import { VideoConcat } from "./VideoConcat";
import { initFFmpeg } from "./utils";

// 테스트용 임시 디렉토리
const TEST_DIR = path.resolve("__test_temp__/video-concat");

// 테스트용 비디오 생성 (FFmpeg로 색상 비디오 생성)
async function createTestVideo(outputPath: string, duration: number, color: string): Promise<void> {
  const { runFFmpegSpawn } = await import("./utils");
  await runFFmpegSpawn([
    '-f', 'lavfi',
    '-i', `color=c=${color}:s=320x240:d=${duration}`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-y',
    outputPath
  ], 30000);
}

// FFprobe 없이 파일 크기로 대략적인 검증
async function getFileSize(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath);
  return stats.size;
}

describe("VideoConcat", () => {
  let videoConcat: VideoConcat;

  beforeAll(async () => {
    await initFFmpeg();
    videoConcat = new VideoConcat();
    await fs.ensureDir(TEST_DIR);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
  });

  describe("concatVideos", () => {
    test("should handle single video (copy only)", async () => {
      const input = path.join(TEST_DIR, "single_input.mp4");
      const output = path.join(TEST_DIR, "single_output.mp4");

      await createTestVideo(input, 2, "red");
      const inputSize = await getFileSize(input);

      const result = await videoConcat.concatVideos([input], output);

      expect(result).toBe(output);
      expect(await fs.pathExists(output)).toBe(true);

      // 단일 파일 복사이므로 크기가 같아야 함
      const outputSize = await getFileSize(output);
      expect(outputSize).toBe(inputSize);
    });

    test("should concat two videos with stream copy", async () => {
      const input1 = path.join(TEST_DIR, "concat_input1.mp4");
      const input2 = path.join(TEST_DIR, "concat_input2.mp4");
      const output = path.join(TEST_DIR, "concat_output.mp4");

      // 동일 형식의 비디오 2개 생성
      await createTestVideo(input1, 2, "blue");
      await createTestVideo(input2, 2, "green");

      const size1 = await getFileSize(input1);
      const size2 = await getFileSize(input2);

      const result = await videoConcat.concatVideos([input1, input2], output);

      expect(result).toBe(output);
      expect(await fs.pathExists(output)).toBe(true);

      // 합쳐진 파일은 두 파일의 합과 비슷해야 함 (헤더 오버헤드 허용)
      const outputSize = await getFileSize(output);
      expect(outputSize).toBeGreaterThan(size1);
      expect(outputSize).toBeLessThan(size1 + size2 + 10000); // 10KB 오버헤드 허용
    });

    test("should concat three videos", async () => {
      const inputs = [
        path.join(TEST_DIR, "three_input1.mp4"),
        path.join(TEST_DIR, "three_input2.mp4"),
        path.join(TEST_DIR, "three_input3.mp4"),
      ];
      const output = path.join(TEST_DIR, "three_output.mp4");

      await Promise.all([
        createTestVideo(inputs[0], 1, "red"),
        createTestVideo(inputs[1], 1, "green"),
        createTestVideo(inputs[2], 1, "blue"),
      ]);

      const result = await videoConcat.concatVideos(inputs, output);

      expect(result).toBe(output);
      expect(await fs.pathExists(output)).toBe(true);

      const outputSize = await getFileSize(output);
      expect(outputSize).toBeGreaterThan(1000); // 최소 1KB
    });

    test("should throw error for empty input", async () => {
      await expect(videoConcat.concatVideos([], "output.mp4"))
        .rejects.toThrow("No input paths provided");
    });
  });

  describe("concatVideosWithXfade", () => {
    test("should handle single video (copy only)", async () => {
      const input = path.join(TEST_DIR, "xfade_single.mp4");
      const output = path.join(TEST_DIR, "xfade_single_out.mp4");

      await createTestVideo(input, 2, "cyan");

      const result = await videoConcat.concatVideosWithXfade([input], output);

      expect(result).toBe(output);
      expect(await fs.pathExists(output)).toBe(true);
    });

    test("should throw error for empty input", async () => {
      await expect(videoConcat.concatVideosWithXfade([], "output.mp4"))
        .rejects.toThrow("No input paths provided");
    });
  });
});
