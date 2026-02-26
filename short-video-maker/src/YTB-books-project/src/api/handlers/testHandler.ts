/**
 * Test 핸들러 (v12.0: 모듈별 독립 테스트)
 * - GET  /test/styles
 * - POST /test/image
 * - POST /test/voice
 * - POST /test/overlay
 * - POST /test/scene
 */

import * as fsExtra from 'fs-extra';
import type { Router, Request, Response } from 'express';
import { logger, Config } from '../../../../config';
import { SceneImageService } from '../../services/SceneImageService';
import { HookTextOverlayNode } from '../../services/HookTextOverlayNode';
import { getStyleProfile, getAvailableStyleIds } from '../../styles';
import type { RouterContext } from './types';

export function registerTestRoutes(router: Router, _ctx: RouterContext) {

  // GET /api/books/test/styles
  router.get('/test/styles', async (_req: Request, res: Response) => {
    try {
      const styleIds = getAvailableStyleIds();
      const styles = styleIds.map(id => {
        const p = getStyleProfile(id);
        return { id: p.id, name: p.displayName, voice: p.ttsVoice, gender: p.ttsGender, hookTextOverlay: !!p.hookTextOverlay?.enabled };
      });

      res.json({
        styles,
        voices: {
          male: ['Charon', 'Fenrir', 'Enceladus', 'Sadaltager', 'Puck', 'Rasalgethi'],
          female: ['Kore', 'Leda', 'Zephyr', 'Aoede', 'Gacrux', 'Erinome'],
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/test/image
  router.post('/test/image', async (req: Request, res: Response) => {
    try {
      const { prompt, style, sceneType } = req.body;
      if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt is required' });
      }

      const styleProfile = getStyleProfile(style);
      const appConfig = new Config();

      let prefix: string;
      switch (sceneType) {
        case 'educational': prefix = styleProfile.educationalStylePrefix; break;
        case 'formula':     prefix = styleProfile.formulaConceptPrefix; break;
        default:            prefix = styleProfile.narrativeStylePrefix; break;
      }

      const fullPrompt = `${prefix}\n\n${prompt}\n\n${styleProfile.imagePromptSuffix}`;

      const imageService = new SceneImageService(
        appConfig.googleGeminiApiKey || '',
        appConfig.openaiApiKey || '',
        appConfig.tempDirPath
      );

      const result = await imageService.generateSceneImage(fullPrompt, 0, '9:16', {
        imageMode: sceneType === 'formula' ? 'formula' : sceneType === 'educational' ? 'educational' : 'narrative',
        styleOverridePrefix: prefix,
        compositions: styleProfile.compositions,
      });

      if (result.success && result.imageBuffer) {
        const fs = await import('fs-extra');
        const outputDir = appConfig.tempDirPath || 'downloads/books';
        await fsExtra.ensureDir(outputDir);
        const imagePath = `${outputDir}/test_image_${styleProfile.id}_${Date.now()}.jpg`;
        await fsExtra.writeFile(imagePath, result.imageBuffer);
        res.json({ success: true, imagePath, styleUsed: styleProfile.id, promptUsed: fullPrompt.substring(0, 200) });
      } else {
        res.status(500).json({ success: false, error: result.error || 'Image generation failed' });
      }
    } catch (error) {
      logger.error({ error }, '[TestImage] Failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/test/voice
  router.post('/test/voice', async (req: Request, res: Response) => {
    try {
      const { text, voice, gender, stylePrompt } = req.body;
      if (!text) {
        return res.status(400).json({ success: false, error: 'text is required' });
      }

      const { GeminiTTS } = await import('../../../../YTB-tts/index.js');
      const appConfig = new Config();
      const ttsVoice = voice || 'Charon';
      const ttsGender = gender || 'male';

      const geminiTTS = new GeminiTTS({
        apiKey: appConfig.googleGeminiApiKey,
        model: 'gemini-2.5-pro-preview-tts',
        defaultGender: ttsGender,
      });

      const result = await geminiTTS.generate(text, ttsVoice, { useNewsVoice: false, stylePrompt });

      const { FFMpeg } = await import('../../../../YTB-ffmpeg/index.js');
      const ffmpeg = await FFMpeg.init();
      const outputDir = appConfig.tempDirPath || 'downloads/books';
      const fs = await import('fs-extra');
      await fsExtra.ensureDir(outputDir);
      const audioPath = `${outputDir}/test_voice_${ttsVoice}_${Date.now()}.mp3`;
      await ffmpeg.savePcmToMp3(result.audio, audioPath);
      const durationSec = await ffmpeg.getAudioDuration(audioPath);

      res.json({
        success: true, audioPath, voice: ttsVoice, gender: ttsGender,
        durationSec: Math.round(durationSec * 100) / 100, textLength: text.length,
      });
    } catch (error) {
      logger.error({ error }, '[TestVoice] Failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/test/overlay
  router.post('/test/overlay', async (req: Request, res: Response) => {
    try {
      const { inputPath, hookText, position, fontSize, fontColor, strokeColor, strokeWidth, backgroundColor } = req.body;
      if (!inputPath || !hookText) {
        return res.status(400).json({ success: false, error: 'inputPath and hookText are required' });
      }

      const fs = await import('fs-extra');
      if (!await fsExtra.pathExists(inputPath)) {
        return res.status(400).json({ success: false, error: `File not found: ${inputPath}` });
      }

      const ext = inputPath.toLowerCase().split('.').pop();
      const inputType: 'image' | 'video' = ['mp4', 'mov', 'avi', 'webm'].includes(ext || '') ? 'video' : 'image';

      const overlayNode = new HookTextOverlayNode();
      const result = await overlayNode.apply({
        inputPath, inputType, hookText,
        config: {
          position: position || 'top-center',
          fontSize: fontSize || 64,
          fontColor: fontColor || 'white',
          strokeColor: strokeColor || 'black',
          strokeWidth: strokeWidth || 3,
          backgroundColor: backgroundColor || 'black@0.3',
        },
      });

      res.json(result);
    } catch (error) {
      logger.error({ error }, '[TestOverlay] Failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/books/test/scene
  router.post('/test/scene', async (req: Request, res: Response) => {
    try {
      const {
        narration, visualPrompt, style = 'philosophy_mentor',
        voice, hookText, sceneType = 'narrative',
      } = req.body;

      if (!narration || !visualPrompt) {
        return res.status(400).json({ success: false, error: 'narration and visualPrompt are required' });
      }

      const styleProfile = getStyleProfile(style);
      const appConfig = new Config();

      // 1. Image
      let prefix: string;
      switch (sceneType) {
        case 'educational': prefix = styleProfile.educationalStylePrefix; break;
        case 'formula':     prefix = styleProfile.formulaConceptPrefix; break;
        default:            prefix = styleProfile.narrativeStylePrefix; break;
      }
      const fullPrompt = `${prefix}\n\n${visualPrompt}\n\n${styleProfile.imagePromptSuffix}`;

      const imageService = new SceneImageService(
        appConfig.googleGeminiApiKey || '',
        appConfig.openaiApiKey || '',
        appConfig.tempDirPath
      );

      const imgResult = await imageService.generateSceneImage(fullPrompt, 0, '9:16', {
        imageMode: sceneType === 'formula' ? 'formula' : sceneType === 'educational' ? 'educational' : 'narrative',
        styleOverridePrefix: prefix,
        compositions: styleProfile.compositions,
      });

      if (!imgResult.success || !imgResult.imageBuffer) {
        return res.status(500).json({ success: false, error: `Image generation failed: ${imgResult.error}` });
      }

      const outputDir = appConfig.tempDirPath || 'downloads/books';
      await fsExtra.ensureDir(outputDir);
      const savedImagePath = `${outputDir}/test_scene_img_${Date.now()}.jpg`;
      await fsExtra.writeFile(savedImagePath, imgResult.imageBuffer);

      // 2. TTS
      const { GeminiTTS } = await import('../../../../YTB-tts/index.js');
      const ttsVoice = voice || styleProfile.ttsVoice;
      const geminiTTS = new GeminiTTS({
        apiKey: appConfig.googleGeminiApiKey,
        model: 'gemini-2.5-pro-preview-tts',
        defaultGender: styleProfile.ttsGender,
      });
      const ttsResult = await geminiTTS.generate(narration, ttsVoice, { useNewsVoice: false, stylePrompt: styleProfile.ttsStylePrompt });

      // 3. PCM → MP3
      const { FFMpeg } = await import('../../../../YTB-ffmpeg/index.js');
      const ffmpeg = await FFMpeg.init();
      const audioPath = `${outputDir}/test_scene_audio_${Date.now()}.mp3`;
      await ffmpeg.savePcmToMp3(ttsResult.audio, audioPath);
      const durationSec = await ffmpeg.getAudioDuration(audioPath);

      // 4. Ken Burns video
      const videoPath = `${outputDir}/test_scene_video_${Date.now()}.mp4`;
      await ffmpeg.createKenBurnsVideoFromImage(savedImagePath, videoPath, durationSec + 0.5, '720x1280', 'zoom_in');

      // 5. Hook text overlay
      let finalVideoPath = videoPath;
      if (hookText) {
        const overlayNode = new HookTextOverlayNode();
        const overlayConfig = styleProfile.hookTextOverlay || {
          position: 'top-center' as const, fontSize: 64, fontColor: 'white',
          strokeColor: 'black', strokeWidth: 3, backgroundColor: 'black@0.3',
        };
        const overlayResult = await overlayNode.apply({ inputPath: videoPath, inputType: 'video', hookText, config: overlayConfig });
        if (overlayResult.success && overlayResult.outputPath) {
          finalVideoPath = overlayResult.outputPath;
        }
      }

      // 6. A/V merge
      const finalPath = `${outputDir}/test_scene_final_${Date.now()}.mp4`;
      await ffmpeg.replaceVideoAudio(finalVideoPath, audioPath, finalPath, durationSec);

      res.json({
        success: true, imagePath: savedImagePath, audioPath, videoPath: finalPath,
        durationSec: Math.round(durationSec * 100) / 100,
        styleUsed: styleProfile.id, voiceUsed: ttsVoice, hookTextApplied: !!hookText,
      });
    } catch (error) {
      logger.error({ error }, '[TestScene] Failed');
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
