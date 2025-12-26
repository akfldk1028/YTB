/**
 * Freesound Sound Effects Test Script
 *
 * Usage: npx ts-node scripts/test-freesound.ts
 */

import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { FreesoundSoundEffects, FreesoundPresets } from '../src/short-creator/libraries/freesound';

async function main() {
  console.log('🎵 Freesound Sound Effects Test\n');

  // Check API key
  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) {
    console.error('❌ FREESOUND_API_KEY not set in .env');
    process.exit(1);
  }
  console.log('✅ API Key found\n');

  // Initialize
  const soundEffects = new FreesoundSoundEffects({ apiKey });

  // Test output directory
  const outputDir = path.join(__dirname, '../temp/sound-test');
  await fs.ensureDir(outputDir);
  console.log(`📁 Output directory: ${outputDir}\n`);

  // Test 1: Search for cat meow
  console.log('--- Test 1: Search ---');
  try {
    const results = await soundEffects.search('cat meow cute', 5);
    console.log(`Found ${results.length} results:`);
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.id}] ${r.name} (${r.duration.toFixed(1)}s) - ${r.license}`);
    });
    console.log('');
  } catch (error) {
    console.error('❌ Search failed:', error);
  }

  // Test 2: Generate from preset
  console.log('--- Test 2: Generate from Preset (CAT_MEOW) ---');
  try {
    const result = await soundEffects.generateFromPreset('CAT_MEOW', 3);
    const filePath = path.join(outputDir, 'cat-meow.mp3');
    await fs.writeFile(filePath, Buffer.from(result.audio));
    console.log(`✅ Saved: ${filePath}`);
    console.log(`   Sound: ${result.soundName} (ID: ${result.soundId})`);
    console.log(`   Duration: ${result.duration.toFixed(1)}s`);
    console.log(`   License: ${result.license}\n`);
  } catch (error) {
    console.error('❌ Generate failed:', error);
  }

  // Test 3: Generate transition sound
  console.log('--- Test 3: Generate Transition (WHOOSH) ---');
  try {
    const result = await soundEffects.generateTransition('whoosh');
    const filePath = path.join(outputDir, 'whoosh.mp3');
    await fs.writeFile(filePath, Buffer.from(result.audio));
    console.log(`✅ Saved: ${filePath}`);
    console.log(`   Sound: ${result.soundName} (ID: ${result.soundId})`);
    console.log(`   Duration: ${result.duration.toFixed(1)}s\n`);
  } catch (error) {
    console.error('❌ Transition failed:', error);
  }

  // Test 4: Custom description
  console.log('--- Test 4: Custom Description ---');
  try {
    const result = await soundEffects.generate({
      text: 'happy notification chime short',
      duration_seconds: 2
    });
    const filePath = path.join(outputDir, 'notification.mp3');
    await fs.writeFile(filePath, Buffer.from(result.audio));
    console.log(`✅ Saved: ${filePath}`);
    console.log(`   Sound: ${result.soundName}\n`);
  } catch (error) {
    console.error('❌ Custom generate failed:', error);
  }

  // Test 5: Multiple sounds in parallel
  console.log('--- Test 5: Multiple Sounds (Parallel) ---');
  try {
    const requests = [
      { text: FreesoundPresets.POP, duration_seconds: 2 },
      { text: FreesoundPresets.DING, duration_seconds: 2 },
      { text: FreesoundPresets.CAT_PURR, duration_seconds: 5 }
    ];
    const results = await soundEffects.generateMultiple(requests);
    console.log(`✅ Generated ${results.length}/${requests.length} sounds`);
    for (const result of results) {
      const filename = result.prompt.replace(/\s+/g, '-').slice(0, 20) + '.mp3';
      const filePath = path.join(outputDir, filename);
      await fs.writeFile(filePath, Buffer.from(result.audio));
      console.log(`   - ${filename}: ${result.soundName}`);
    }
    console.log('');
  } catch (error) {
    console.error('❌ Multiple generate failed:', error);
  }

  console.log('🎉 Test completed! Check the files in:', outputDir);
  console.log('\n📋 Available Presets:');
  Object.keys(FreesoundPresets).forEach(key => {
    console.log(`   ${key}: "${FreesoundPresets[key]}"`);
  });
}

main().catch(console.error);
