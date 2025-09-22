# Image Generation 시스템 문제 해결 보고서

**날짜**: 2025년 9월 19일  
**작업자**: Claude Code  
**프로젝트**: Short Video Maker - Image Generation Module

## 📋 해결된 문제 목록

### 1. 🔄 Sequential Image Generation 문제

**문제 상황**:
- 4개 이미지 요청 시 1개만 생성되는 문제
- API 응답은 성공이지만 실제로는 제대로 동작하지 않음
- Nano Banana 모델의 sequential generation 로직 오류

**원인 분석**:
```typescript
// 문제가 있던 코드 (NanoBananaService.ts)
for (let i = 0; i < numberOfImages; i++) {
  // Sequential generation 로직에서 각 이미지마다 별도 처리
  // 하지만 maxImages 제한을 제대로 고려하지 않음
}
```

**해결 방법**:
- NanoBananaService의 sequential generation 로직 디버깅
- Nano Banana API의 maxImages=2 제한 확인
- 각 이미지 생성 간 적절한 delay 추가 (1000ms → 1500ms)

**결과**: ✅ 2개 이미지 순차 생성 성공 (모델 제한에 따라)

---

### 2. 🎯 Model Selection 문제

**문제 상황**:
- API 요청에서 `"model": "nano-banana"` 지정해도 항상 Imagen 4.0 사용
- 사용자가 원하는 모델이 적용되지 않는 문제

**원인 분석**:
```typescript
// imageRoutes.ts에서 model 파라미터 처리 누락
const { prompt, numberOfImages = 1, aspectRatio = "1:1", size = "1K", allowPeople = false } = req.body;
// model 파라미터가 빠져있음!
```

**해결 방법**:
```typescript
// 수정된 코드
const { prompt, numberOfImages = 1, aspectRatio = "1:1", size = "1K", allowPeople = false, model } = req.body;

// Set model if specified
if (model) {
  if (model === "nano-banana") {
    this.imageService.setModel(ImageModelType.NANO_BANANA);
  } else if (model === "imagen-4") {
    this.imageService.setModel(ImageModelType.IMAGEN_4);
  } else {
    res.status(400).json({
      error: "Invalid model",
      message: `Unsupported model: ${model}. Use 'nano-banana' or 'imagen-4'`,
    });
    return;
  }
}
```

**결과**: ✅ 모델 선택 정상 작동

---

### 3. 📁 Folder Organization 문제 (가장 중요)

**문제 상황**:
- 한 번의 생성 요청으로 여러 이미지 생성 시 각 이미지마다 별도 폴더 생성
- 사용자 기대: `landscape-set-1758292702151` 하나의 폴더에 모든 이미지
- 실제 결과: 각 이미지마다 `landscape-set-1758292702151`, `landscape-set-1758292702147` 등 별도 폴더

**원인 분석**:
```typescript
// 문제가 있던 코드 (imageRoutes.ts)
for (const image of result.images) {
  const filePath = await saveImageToFile(
    image.data,
    image.filename,
    this.config.tempDirPath,
    {
      setName: result.images.length > 1 ? `landscape-set-${Date.now()}` : undefined,
      category: 'landscapes'
    }
  );
  // 각 이미지마다 Date.now() 호출로 다른 timestamp 생성!
}
```

**해결 방법**:
```typescript
// 수정된 코드
if (result.images.length > 1) {
  // Use saveImageSet for multiple images to ensure they go in the same folder
  const setName = `landscape-set-${Date.now()}`; // 한 번만 생성
  const imageSetResult = await saveImageSet(
    result.images.map(img => ({
      data: img.data,
      filename: img.filename,
      prompt: query.prompt
    })),
    this.config.tempDirPath,
    {
      setName,
      category: 'landscapes',
      description: `Generated ${result.images.length} landscape images`
    }
  );
  // 모든 이미지가 같은 폴더에 저장됨
}
```

**결과**: ✅ 모든 이미지가 하나의 폴더에 저장

---

### 4. 🔧 TypeScript Build 오류

**문제 상황**:
- 코드 수정 후 빌드 시 TypeScript 컴파일 오류
- PromptCard interface의 variations 속성에서 누락된 optional properties

**원인 분석**:
```typescript
// 누락된 속성들
variations: {
  // expressions?: string[]; // 누락
  // intensities?: string[]; // 누락
  // palettes?: string[]; // 누락
  // scales?: string[]; // 누락
  // perspectives?: string[]; // 누락
}
```

**해결 방법**:
```typescript
// 완성된 interface
variations: {
  angles?: string[];
  styles?: string[];
  moods?: string[];
  compositions?: string[];
  lighting?: string[];
  seasons?: string[];
  times?: string[];
  weather?: string[];
  expressions?: string[];      // 추가
  intensities?: string[];      // 추가
  palettes?: string[];         // 추가
  scales?: string[];           // 추가
  perspectives?: string[];     // 추가
};
```

**결과**: ✅ 빌드 성공

---

## 🧪 최종 테스트 결과

### 테스트 요청:
```bash
curl -X POST http://localhost:3125/api/images/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Serene mountain landscape at sunset with a crystal clear lake reflecting the golden sky, surrounded by pine trees",
    "numberOfImages": 4,
    "model": "nano-banana",
    "aspectRatio": "1:1"
  }'
```

### 결과:
```
📁 /home/akfldk1028/.ai-agents-az-video-generator/temp/2025-09-19_14-46-05/landscapes/landscape-set-1758293165316/
├── 📄 metadata.json (676 bytes)
├── 🖼️ nano-banana-1758293155995-1.png (1.4MB)
└── 🖼️ nano-banana-1758293165316-2.png (1.5MB)
```

### metadata.json 내용:
```json
{
  "setName": "landscape-set-1758293165316",
  "category": "landscapes", 
  "description": "Generated 2 landscape images",
  "timestamp": "2025-09-19_14-46-05",
  "imageCount": 2,
  "images": [
    {
      "filename": "nano-banana-1758293155995-1.png",
      "prompt": "Serene mountain landscape at sunset with a crystal clear lake reflecting the golden sky, surrounded by pine trees",
      "index": 0,
      "size": 1405955
    },
    {
      "filename": "nano-banana-1758293165316-2.png", 
      "prompt": "Serene mountain landscape at sunset with a crystal clear lake reflecting the golden sky, surrounded by pine trees",
      "index": 1,
      "size": 1476643
    }
  ]
}
```

## 📈 성능 개선사항

1. **Sequential Generation**: Nano Banana API의 특성에 맞게 순차 생성 로직 최적화
2. **Folder Organization**: `saveImageSet()` 함수 활용으로 체계적인 파일 관리
3. **Model Selection**: 사용자 요청에 따른 정확한 모델 라우팅
4. **Error Handling**: 더 명확한 에러 메시지와 validation

## 🔍 주요 학습사항

1. **API 제한사항 이해**: Nano Banana (maxImages=2) vs Imagen 4.0 (maxImages=4)
2. **File Organization**: 단일 요청의 모든 결과물은 하나의 폴더에 저장해야 함
3. **Sequential vs Batch**: 모델별 API 특성에 맞는 요청 방식 적용
4. **TypeScript Interface**: 새로운 속성 추가 시 interface 완성도 중요

## 🎯 다음 개선 계획

1. **UI 개선**: 사용자가 모델별 제한사항을 쉽게 확인할 수 있도록
2. **Progress Tracking**: 순차 생성 시 진행상황 표시
3. **Image Preview**: 생성된 이미지의 미리보기 기능
4. **Batch Processing**: 대량 이미지 생성 시 효율적인 처리 방안

---

**✅ 모든 문제 해결 완료!** 

이제 사용자는 원하는 모델을 선택하여 여러 이미지를 생성할 때, 모든 이미지가 하나의 체계적으로 정리된 폴더에 저장되는 것을 확인할 수 있습니다.