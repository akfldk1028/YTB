/**
 * FFmpeg Audio Mixing Test Script
 *
 * Tests:
 * 1. Silent audio generation
 * 2. Sound effects mixing with base audio
 * 3. Multiple sound effects overlay
 *
 * Usage: npx ts-node scripts/test-audio-mixing.ts
 */

import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { FFMpeg } from '../src/short-creator/libraries/FFmpeg';
import { FreesoundSoundEffects } from '../src/short-creator/libraries/freesound';

async function main() {
  console.log('🎵 FFmpeg Audio Mixing Test\n');

  // Initialize FFmpeg
  const ffmpeg = await FFMpeg.init();
  console.log('✅ FFmpeg initialized\n');

  // Test output directory
  const outputDir = path.join(__dirname, '../temp/audio-mix-test');
  await fs.ensureDir(outputDir);
  console.log(`📁 Output directory: ${outputDir}\n`);

  // ===== Test 1: Silent Audio Generation =====
  console.log('--- Test 1: Silent Audio Generation ---');
  try {
    const silentPath = path.join(outputDir, '1-silent-5sec.mp3');
    await ffmpeg.generateSilentAudio(silentPath, 5);
    const stats = await fs.stat(silentPath);
    console.log(`✅ Silent audio generated: ${silentPath}`);
    console.log(`   File size: ${(stats.size / 1024).toFixed(1)} KB\n`);
  } catch (error) {
    console.error('❌ Silent audio failed:', error);
  }

  // ===== Test 2: Get Sound Effects from Freesound =====
  console.log('--- Test 2: Downloading Sound Effects ---');
  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) {
    console.error('❌ FREESOUND_API_KEY not set');
    return;
  }

  const soundEffects = new FreesoundSoundEffects({ apiKey });
  const sfxPaths: Array<{ path: string; startTime: number; volume: number }> = [];

  try {
    // Download cat meow
    const meow = await soundEffects.generateFromPreset('CAT_MEOW', 2);
    const meowPath = path.join(outputDir, 'sfx-meow.mp3');
    await ffmpeg.saveSoundEffectToFile(meow.audio, meowPath);
    sfxPaths.push({ path: meowPath, startTime: 1, volume: 0.8 });
    console.log(`✅ Meow: ${meowPath}`);

    // Download pop sound
    const pop = await soundEffects.generateFromPreset('POP', 1);
    const popPath = path.join(outputDir, 'sfx-pop.mp3');
    await ffmpeg.saveSoundEffectToFile(pop.audio, popPath);
    sfxPaths.push({ path: popPath, startTime: 3, volume: 1.0 });
    console.log(`✅ Pop: ${popPath}`);

    // Download ding sound
    const ding = await soundEffects.generateFromPreset('DING', 2);
    const dingPath = path.join(outputDir, 'sfx-ding.mp3');
    await ffmpeg.saveSoundEffectToFile(ding.audio, dingPath);
    sfxPaths.push({ path: dingPath, startTime: 5, volume: 0.7 });
    console.log(`✅ Ding: ${dingPath}\n`);
  } catch (error) {
    console.error('❌ Sound effect download failed:', error);
    return;
  }

  // ===== Test 3: Create Audio from Sound Effects Only =====
  console.log('--- Test 3: Create Audio from SFX Only (skipTTS mode) ---');
  try {
    const sfxOnlyPath = path.join(outputDir, '3-sfx-only-8sec.mp3');
    await ffmpeg.createAudioFromSoundEffects(sfxPaths, sfxOnlyPath, 8);
    const stats = await fs.stat(sfxOnlyPath);
    console.log(`✅ SFX-only audio: ${sfxOnlyPath}`);
    console.log(`   File size: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`   Contains: meow@1s, pop@3s, ding@5s\n`);
  } catch (error) {
    console.error('❌ SFX-only audio failed:', error);
  }

  // ===== Test 4: Mix with Base Audio =====
  console.log('--- Test 4: Mix SFX with Base Audio ---');
  try {
    // First create a base audio (silent as placeholder)
    const basePath = path.join(outputDir, 'base-audio.mp3');
    await ffmpeg.generateSilentAudio(basePath, 10);

    const mixedPath = path.join(outputDir, '4-mixed-10sec.mp3');
    await ffmpeg.mixAudioTracks(
      basePath,
      sfxPaths,
      mixedPath,
      10
    );
    const stats = await fs.stat(mixedPath);
    console.log(`✅ Mixed audio: ${mixedPath}`);
    console.log(`   File size: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`   Base: silent, Overlays: meow@1s, pop@3s, ding@5s\n`);
  } catch (error) {
    console.error('❌ Audio mixing failed:', error);
  }

  // ===== Test 5: Single SFX with Delay =====
  console.log('--- Test 5: Single SFX with Delay ---');
  try {
    const singleSfxPath = path.join(outputDir, '5-single-sfx-delayed.mp3');
    await ffmpeg.createAudioFromSoundEffects(
      [{ path: sfxPaths[0].path, startTime: 2, volume: 1.0 }],
      singleSfxPath,
      5
    );
    const stats = await fs.stat(singleSfxPath);
    console.log(`✅ Single SFX: ${singleSfxPath}`);
    console.log(`   File size: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`   Contains: meow starting at 2s\n`);
  } catch (error) {
    console.error('❌ Single SFX failed:', error);
  }

  console.log('🎉 Audio mixing test completed!');
  console.log(`📂 Check files in: ${outputDir}`);
  console.log('\n📋 Generated files:');
  const files = await fs.readdir(outputDir);
  files.forEach(f => console.log(`   - ${f}`));
}

main().catch(console.error);