# NANO BANANA 정적 영상 수정 가이드

## 문제점
현재 NANO BANANA 모드에서 정적 영상을 생성할 때:
1. 각 scene마다 이미지를 생성하지만
2. VEO3로 동적 비디오를 만들려고 시도 (line 1046)
3. 이로 인해 정적이 아닌 동적 영상이 생성됨

## 수정이 필요한 파일
`src/short-creator/ShortCreator.ts`

## 수정 내용

### 1. processMultiSceneWithFFmpeg 함수 수정 (line 1033-1055)

**현재 코드:**
```typescript
// Check if scene needs image generation (NANO BANANA → VEO3 workflow)
if (scene.needsImageGeneration && scene.imageData && !scene.video) {
  logger.debug({ sceneIndex: i }, "Scene needs image generation, using NANO BANANA → VEO3 workflow");

  // Step 1: Generate image using NANO BANANA
  const imageGenData = {
    prompt: scene.imageData.prompt || scene.text,
    style: scene.imageData.style || "cinematic",
    mood: scene.imageData.mood || "dynamic"
  };
  const generatedImage = await this.generateImageWithNanoBanana(imageGenData, orientation);

  // Step 2: Generate video from generated image using VEO3
  const veoVideo = await this.generateVideoFromImage(
    generatedImage,
    scene.videoPrompt || scene.text,
    orientation
  );

  // Update scene with generated video
  scene.video = veoVideo.url;
  logger.debug({ sceneIndex: i, videoUrl: veoVideo.url }, "Video generated via NANO BANANA → VEO3 workflow");
}
```

**수정된 코드:**
```typescript
// Check if scene needs image generation
if (scene.needsImageGeneration && scene.imageData && !scene.video) {
  const isNanoBananaStatic = config.videoSource === "ffmpeg" || metadata?.mode === "nano-banana";

  if (isNanoBananaStatic) {
    logger.debug({ sceneIndex: i }, "NANO BANANA static mode: generating static image video");

    // Step 1: Generate image using NANO BANANA
    const imageGenData = {
      prompt: scene.imageData.prompt || scene.text,
      style: scene.imageData.style || "cinematic",
      mood: scene.imageData.mood || "dynamic"
    };
    const generatedImage = await this.generateImageWithNanoBanana(imageGenData, orientation);

    // Step 2: Create STATIC video from image (no VEO3!)
    const tempImageId = cuid();
    const tempImagePath = path.join(this.config.tempDirPath, `${tempImageId}.png`);
    const tempStaticVideoPath = path.join(this.config.tempDirPath, `${tempImageId}_static.mp4`);

    // Save image to file
    const imageBuffer = Buffer.from(generatedImage.data, 'base64');
    fs.writeFileSync(tempImagePath, imageBuffer);

    // Create static video from image with scene duration
    const sceneDuration = scene.audio?.duration || 3;
    const dimensions = orientation === OrientationEnum.portrait ? "1080:1920" : "1920:1080";

    await this.ffmpeg.createStaticVideoFromImage(
      tempImagePath,
      tempStaticVideoPath,
      sceneDuration,
      dimensions
    );

    // Clean up temp image
    if (fs.existsSync(tempImagePath)) {
      fs.unlinkSync(tempImagePath);
    }

    // Update scene with static video
    scene.video = tempStaticVideoPath;
    logger.debug({ sceneIndex: i, videoPath: tempStaticVideoPath }, "Static video created from NANO BANANA image");

  } else {
    // VEO3 mode: use dynamic video generation
    logger.debug({ sceneIndex: i }, "VEO3 mode: using NANO BANANA → VEO3 workflow");

    const imageGenData = {
      prompt: scene.imageData.prompt || scene.text,
      style: scene.imageData.style || "cinematic",
      mood: scene.imageData.mood || "dynamic"
    };
    const generatedImage = await this.generateImageWithNanoBanana(imageGenData, orientation);

    const veoVideo = await this.generateVideoFromImage(
      generatedImage,
      scene.videoPrompt || scene.text,
      orientation
    );

    scene.video = veoVideo.url;
    logger.debug({ sceneIndex: i, videoUrl: veoVideo.url }, "Video generated via NANO BANANA → VEO3 workflow");
  }
}
```

### 2. 필요한 import 추가 (파일 상단)
```typescript
import cuid from "cuid";
import fs from "fs-extra";
import path from "path";
```

## 핵심 변경사항
1. `config.videoSource === "ffmpeg"` 또는 `metadata?.mode === "nano-banana"` 체크 추가
2. NANO BANANA 정적 모드일 때는 VEO3를 사용하지 않고 `createStaticVideoFromImage` 사용
3. 각 scene의 duration에 맞춰 정적 비디오 생성

## 테스트 방법
1. 서버 재시작: `npm run dev`
2. NANO BANANA API 테스트:
```bash
curl -X POST http://172.27.86.48:3124/api/video/nano-banana/ \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [
      {"text": "Scene 1", "imageData": {"prompt": "Red circle"}},
      {"text": "Scene 2", "imageData": {"prompt": "Blue square"}}
    ],
    "config": {"orientation": "portrait"}
  }'
```

## 예상 결과
- 각 scene마다 NANO BANANA로 이미지 생성
- 이미지들이 정적으로 표시 (움직이지 않음)
- 모든 scene이 하나의 비디오로 병합