# 2025-11-14: YouTube 자동 업로드 기능 가이드

## 📋 목차
- [개요](#개요)
- [지원 엔드포인트](#지원-엔드포인트)
- [YouTube 설정 파라미터](#youtube-설정-파라미터)
- [실행 과정 (순차적)](#실행-과정-순차적)
- [엔드포인트별 사용법](#엔드포인트별-사용법)
- [테스트 결과](#테스트-결과)
- [구현 세부사항](#구현-세부사항)

---

## 개요

**모든 영상 생성 엔드포인트에서 YouTube 자동 업로드를 지원합니다.**

영상 생성 API 호출 시 `youtubeUpload` 파라미터를 포함하면, 영상 생성 완료 후 자동으로 YouTube에 업로드됩니다.

### 주요 특징
- ✅ 영상 생성 완료 즉시 자동 업로드
- ✅ 다중 채널 지원 (MainChannel, SecondChannel, TestChannel)
- ✅ Private/Unlisted/Public 공개 설정
- ✅ 제목, 설명, 태그 커스터마이징
- ✅ 모든 영상 생성 모드 지원 (Pexels, NANO BANANA, VEO3, Consistent Shorts)

---

## 지원 엔드포인트

### 1. Pexels 영상 생성
**엔드포인트:** `POST /api/video/pexels`

Pexels 스톡 영상을 사용한 영상 생성 + YouTube 자동 업로드

### 2. NANO BANANA 이미지 생성
**엔드포인트:** `POST /api/video/nano-banana`

NANO BANANA로 이미지 생성 후 정적 영상 제작 + YouTube 자동 업로드

### 3. NANO BANANA → VEO3 영상 변환
**엔드포인트:** `POST /api/video/nano-banana/nano-banana-to-veo3`

NANO BANANA 이미지 → VEO3 I2V 영상 변환 + YouTube 자동 업로드

### 4. VEO3 직접 영상 생성
**엔드포인트:** `POST /api/video/veo3`

NANO BANANA + VEO3 풀 워크플로우 + YouTube 자동 업로드

### 5. Consistent Shorts (캐릭터 일관성)
**엔드포인트:** `POST /api/video/consistent-shorts`

동일 캐릭터로 여러 씬 생성 + YouTube 자동 업로드

---

## YouTube 설정 파라미터

### youtubeUpload 객체 구조

```json
{
  "youtubeUpload": {
    "enabled": true,                    // [필수] true: 자동 업로드 활성화
    "channelName": "MainChannel",       // [필수] 채널 이름
    "title": "영상 제목",                // [선택] 기본값: "{{auto}}" (자동 생성)
    "description": "영상 설명",          // [선택] 기본값: ""
    "tags": ["shorts", "ai", "test"],   // [선택] 태그 배열
    "privacy": "private",               // [선택] "private" | "unlisted" | "public"
    "categoryId": "22"                  // [선택] YouTube 카테고리 ID (기본값: 22 = People & Blogs)
  }
}
```

### 파라미터 상세 설명

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| `enabled` | boolean | ✅ | - | 자동 업로드 활성화 여부 |
| `channelName` | string | ✅ | - | 업로드할 YouTube 채널 이름 (MainChannel, SecondChannel, TestChannel) |
| `title` | string | ❌ | `{{auto}}` | 영상 제목. `{{auto}}`면 자동 생성 |
| `description` | string | ❌ | `""` | 영상 설명 |
| `tags` | string[] | ❌ | `[]` | 검색 태그 |
| `privacy` | string | ❌ | `"private"` | 공개 설정: `"private"`, `"unlisted"`, `"public"` |
| `categoryId` | string | ❌ | `"22"` | YouTube 카테고리 ID ([전체 목록](https://developers.google.com/youtube/v3/docs/videoCategories/list)) |

### 채널 이름 (channelName)

사전에 인증된 채널만 사용 가능합니다:
- `MainChannel` - 메인 채널
- `SecondChannel` - 서브 채널
- `TestChannel` - 테스트 채널

새 채널을 추가하려면:
```bash
curl http://localhost:3000/api/youtube/auth/url/{channelName}
```

---

## 실행 과정 (순차적)

### 1단계: API 요청
사용자가 영상 생성 API를 호출하며 `youtubeUpload` 파라미터를 포함합니다.

```bash
curl -X POST http://localhost:3000/api/video/pexels \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [...],
    "config": {...},
    "youtubeUpload": {
      "enabled": true,
      "channelName": "MainChannel",
      "title": "테스트 영상",
      "privacy": "private"
    }
  }'
```

**응답:**
```json
{
  "videoId": "cmhyvnfmy00009tdl7ysf6dff"
}
```

---

### 2단계: API 엔드포인트 처리

**파일:** `src/server/api/pexels.ts` (또는 nano-banana.ts, veo3.ts, consistent-shorts.ts)

API 엔드포인트에서 `req.body.youtubeUpload`를 metadata에 추가:

```typescript
// Line 55-64: pexels.ts
const videoId = this.shortCreator.addToQueue(
  input.scenes,
  input.config,
  callbackUrl,
  {
    ...processedData.metadata,
    mode: "pexels",
    youtubeUpload: req.body.youtubeUpload || processedData.metadata?.youtubeUpload  // ← 핵심
  }
);
```

**핵심 포인트:**
- `req.body.youtubeUpload`를 metadata 객체에 포함
- `addToQueue()` 호출 시 metadata와 함께 전달
- 모든 엔드포인트에서 동일한 방식 적용

---

### 3단계: 영상 생성 큐 등록

**파일:** `src/short-creator/ShortCreatorRefactored.ts`

`addToQueue()` 메서드가 호출되어 영상 생성 작업이 큐에 등록됩니다:

```typescript
// Line 155-185
public addToQueue(
  scenes: SceneInput[],
  config: VideoConfig,
  callbackUrl?: string,
  metadata?: any
): string {
  const id = nanoid();

  this.queue.push({
    id,
    scenes,
    config,
    callbackUrl,
    metadata,  // ← youtubeUpload가 여기 포함됨
    status: "pending",
    createdAt: new Date()
  });

  return id;
}
```

---

### 4단계: 영상 생성 처리

**파일:** `src/short-creator/ShortCreatorRefactored.ts`

큐에서 작업을 꺼내 `processVideo()` 메서드가 실행됩니다:

```typescript
// Line 245-280
private async processVideo(item: VideoQueueItem): Promise<void> {
  // 1. 영상 생성 (Pexels, NANO BANANA, VEO3 등)
  const videoPath = await this.createVideo(item);

  // 2. GCS 업로드 (선택)
  if (this.gcsService) {
    await this.gcsService.uploadVideo(item.id, videoPath);
  }

  // 3. YouTube 자동 업로드 ← 핵심!
  const youtubeUpload = item.metadata?.youtubeUpload as N8NYouTubeUploadConfig | undefined;
  if (youtubeUpload?.enabled && this.youtubeUploader) {
    await this.handleYouTubeUpload(item.id, youtubeUpload, item.metadata);
  }

  // 4. 상태 업데이트
  this.updateStatus(item.id, "ready", videoPath);

  // 5. Webhook 콜백 (선택)
  if (item.callbackUrl) {
    await this.sendCallback(item.callbackUrl, item.id, "ready");
  }
}
```

**핵심 로직:**
```typescript
const youtubeUpload = item.metadata?.youtubeUpload;
if (youtubeUpload?.enabled && this.youtubeUploader) {
  await this.handleYouTubeUpload(item.id, youtubeUpload, item.metadata);
}
```

- `metadata.youtubeUpload.enabled === true` 확인
- `youtubeUploader` 서비스 존재 여부 확인
- 조건 만족 시 `handleYouTubeUpload()` 실행

---

### 5단계: YouTube 업로드 실행

**파일:** `src/short-creator/ShortCreatorRefactored.ts`

```typescript
// Line 774-853
private async handleYouTubeUpload(
  videoId: string,
  youtubeUpload: N8NYouTubeUploadConfig,
  metadata?: any
): Promise<void> {
  try {
    // 1. YouTubeUploader 서비스 존재 확인
    if (!this.youtubeUploader) {
      logger.warn({ videoId }, 'YouTube uploader not available, skipping auto-upload');
      return;
    }

    // 2. 채널 인증 확인
    if (!this.youtubeUploader.isChannelAuthenticated(youtubeUpload.channelName)) {
      logger.warn(
        { videoId, channelName: youtubeUpload.channelName },
        'Channel not authenticated, skipping auto-upload'
      );
      return;
    }

    logger.info(
      { videoId, channelName: youtubeUpload.channelName },
      '📤 Starting YouTube auto-upload'
    );

    // 3. 제목 생성 ({{auto}}면 자동 생성)
    let title = youtubeUpload.title || '{{auto}}';
    if (title === '{{auto}}') {
      title = metadata?.title || `Video ${videoId}`;
    }

    // 4. 업로드 메타데이터 준비
    const uploadMetadata = {
      title,
      description: youtubeUpload.description || '',
      tags: youtubeUpload.tags || [],
      privacyStatus: (youtubeUpload.privacy || 'private') as 'private' | 'unlisted' | 'public',
      categoryId: youtubeUpload.categoryId || '22'
    };

    // 5. YouTube 업로드 실행
    const youtubeVideoId = await this.youtubeUploader.uploadVideo(
      videoId,
      youtubeUpload.channelName,
      uploadMetadata,
      false // notifySubscribers
    );

    const videoUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

    logger.info(
      { videoId, youtubeVideoId, videoUrl },
      '✅ YouTube upload completed successfully'
    );

    // 6. 메타데이터 업데이트 (선택)
    if (metadata) {
      metadata.youtubeVideoId = youtubeVideoId;
      metadata.youtubeUrl = videoUrl;
    }

  } catch (error) {
    logger.error({ error, videoId }, '❌ YouTube upload failed');
    // 에러가 발생해도 영상 생성은 계속 진행 (실패해도 괜찮음)
  }
}
```

**업로드 프로세스:**
1. YouTubeUploader 서비스 확인
2. 채널 인증 확인 (`isChannelAuthenticated()`)
3. 제목 자동 생성 (필요 시)
4. 메타데이터 준비
5. `uploadVideo()` 호출하여 YouTube API 실행
6. 성공 시 YouTube Video ID 및 URL 반환

---

### 6단계: YouTube API 업로드

**파일:** `src/youtube-upload/services/YouTubeUploader.ts`

```typescript
public async uploadVideo(
  localVideoId: string,
  channelName: string,
  metadata: VideoMetadata,
  notifySubscribers: boolean = false
): Promise<string> {
  // 1. 영상 파일 경로 확인
  const videoPath = this.config.getVideoPath(localVideoId);

  // 2. OAuth2 클라이언트 가져오기
  const oauth2Client = this.getAuthenticatedClient(channelName);

  // 3. YouTube Data API v3 호출
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  // 4. 영상 업로드
  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    notifySubscribers,
    requestBody: {
      snippet: {
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        categoryId: metadata.categoryId
      },
      status: {
        privacyStatus: metadata.privacyStatus
      }
    },
    media: {
      body: fs.createReadStream(videoPath)
    }
  });

  // 5. YouTube Video ID 반환
  return response.data.id!;
}
```

---

### 7단계: 완료 및 상태 업데이트

업로드 완료 후:
1. 영상 상태를 `"ready"`로 업데이트
2. Webhook 콜백 전송 (설정된 경우)
3. 로그 기록

**로그 예시:**
```json
{
  "level": "info",
  "videoId": "cmhyvnfmy00009tdl7ysf6dff",
  "channelName": "MainChannel",
  "youtubeVideoId": "TnagGaqZMHE",
  "videoUrl": "https://www.youtube.com/watch?v=TnagGaqZMHE",
  "msg": "✅ YouTube upload completed successfully"
}
```

---

## 엔드포인트별 사용법

### 1. Pexels 영상 생성 + YouTube 업로드

```bash
curl -X POST http://localhost:3000/api/video/pexels \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [
      {
        "text": "멋진 기술 영상",
        "searchTerms": ["technology", "innovation"]
      }
    ],
    "config": {
      "orientation": "portrait",
      "voice": "af_heart"
    },
    "youtubeUpload": {
      "enabled": true,
      "channelName": "MainChannel",
      "title": "Pexels 기술 쇼츠",
      "description": "AI가 생성한 기술 쇼츠",
      "tags": ["shorts", "technology", "ai"],
      "privacy": "unlisted"
    }
  }'
```

**응답:**
```json
{
  "videoId": "abc123xyz"
}
```

---

### 2. NANO BANANA 이미지 생성 + YouTube 업로드

```bash
curl -X POST http://localhost:3000/api/video/nano-banana \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [
      {
        "text": "우주 탐험 이야기",
        "imageData": {
          "prompt": "Astronaut exploring alien planet, cinematic",
          "style": "cinematic",
          "mood": "adventurous",
          "numberOfImages": 1
        }
      }
    ],
    "config": {
      "orientation": "landscape",
      "voice": "am_adam"
    },
    "youtubeUpload": {
      "enabled": true,
      "channelName": "MainChannel",
      "title": "우주 탐험 AI 쇼츠",
      "tags": ["space", "ai", "shorts"],
      "privacy": "private"
    }
  }'
```

---

### 3. NANO BANANA → VEO3 영상 변환 + YouTube 업로드

```bash
curl -X POST http://localhost:3000/api/video/nano-banana/nano-banana-to-veo3 \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [
      {
        "text": "도시의 밤 풍경",
        "imageData": {
          "prompt": "Cyberpunk city at night with neon lights",
          "style": "cinematic",
          "mood": "dramatic"
        },
        "videoPrompt": "Camera slowly panning across neon-lit cityscape"
      }
    ],
    "config": {
      "orientation": "portrait",
      "voice": "af_heart"
    },
    "youtubeUpload": {
      "enabled": true,
      "channelName": "SecondChannel",
      "title": "사이버펑크 도시",
      "description": "AI가 생성한 사이버펑크 영상",
      "tags": ["cyberpunk", "ai", "veo3"],
      "privacy": "public"
    }
  }'
```

---

### 4. VEO3 직접 생성 + YouTube 업로드

```bash
curl -X POST http://localhost:3000/api/video/veo3 \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [
      {
        "text": "바다 위의 일출",
        "videoPrompt": "Sunrise over calm ocean, golden hour lighting"
      }
    ],
    "config": {
      "orientation": "landscape",
      "voice": "am_adam",
      "videoSource": "veo"
    },
    "youtubeUpload": {
      "enabled": true,
      "channelName": "MainChannel",
      "title": "VEO3 일출 영상",
      "privacy": "private"
    }
  }'
```

---

### 5. Consistent Shorts (캐릭터 일관성) + YouTube 업로드

```bash
curl -X POST http://localhost:3000/api/video/consistent-shorts \
  -H "Content-Type: application/json" \
  -d '{
    "character": {
      "description": "A young female astronaut with blonde hair, blue eyes, white spacesuit",
      "style": "cinematic",
      "mood": "adventurous"
    },
    "scenes": [
      {
        "text": "우주 탐험 시작",
        "scenePrompt": "Standing on spacecraft, looking at Earth",
        "duration": 3
      },
      {
        "text": "외계 행성 발견",
        "scenePrompt": "Landing on alien planet surface",
        "duration": 3
      }
    ],
    "config": {
      "orientation": "portrait",
      "voice": "af_heart",
      "generateVideos": true
    },
    "youtubeUpload": {
      "enabled": true,
      "channelName": "MainChannel",
      "title": "AI 우주 탐험 이야기",
      "description": "일관된 캐릭터로 만든 우주 탐험 스토리",
      "tags": ["ai", "space", "storytelling", "shorts"],
      "privacy": "unlisted"
    }
  }'
```

---

## 테스트 결과

### 실제 테스트: 2025-11-14 13:12

**요청:**
```json
{
  "scenes": [
    {
      "text": "YouTube 자동 업로드 테스트!",
      "searchTerms": ["technology", "ai"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "voice": "af_heart"
  },
  "youtubeUpload": {
    "enabled": true,
    "channelName": "MainChannel",
    "title": "Pexels 자동 업로드 테스트",
    "description": "자동 업로드 기능 테스트",
    "tags": ["shorts", "ai", "test"],
    "privacy": "private"
  }
}
```

**결과:**
```
✅ Video ID: cmhyvnfmy00009tdl7ysf6dff
✅ YouTube Video ID: TnagGaqZMHE
✅ URL: https://www.youtube.com/watch?v=TnagGaqZMHE
✅ 채널: MainChannel
✅ 공개 설정: Private
✅ 업로드 시간: 약 4초
```

**타임라인:**
```
13:12:01 - API 요청 수신
13:12:01 - TTS 음성 생성 시작
13:12:22 - 영상 생성 완료
13:12:22 - YouTube 업로드 시작
13:12:26 - YouTube 업로드 완료
```

**로그 출력:**
```
📤 Starting YouTube auto-upload
   videoId: cmhyvnfmy00009tdl7ysf6dff
   channelName: MainChannel

✅ YouTube upload completed successfully
   videoId: cmhyvnfmy00009tdl7ysf6dff
   youtubeVideoId: TnagGaqZMHE
   videoUrl: https://www.youtube.com/watch?v=TnagGaqZMHE
```

---

## 구현 세부사항

### 변경된 파일 목록

#### 1. `src/server/api/pexels.ts`
**위치:** Line 62
**변경 내용:** metadata에 `youtubeUpload` 추가

```typescript
const videoId = this.shortCreator.addToQueue(
  input.scenes,
  input.config,
  callbackUrl,
  {
    ...processedData.metadata,
    mode: "pexels",
    youtubeUpload: req.body.youtubeUpload || processedData.metadata?.youtubeUpload
  }
);
```

---

#### 2. `src/server/api/nano-banana.ts`
**위치:** Line 62, Line 148
**변경 내용:** 2곳에 `youtubeUpload` 추가

**첫 번째 위치 (NANO BANANA 정적 모드):**
```typescript
const videoId = this.shortCreator.addToQueue(
  input.scenes,
  input.config,
  callbackUrl,
  {
    ...processedData.metadata,
    mode: "nano-banana",
    youtubeUpload: req.body.youtubeUpload || processedData.metadata?.youtubeUpload
  }
);
```

**두 번째 위치 (NANO BANANA → VEO3 모드):**
```typescript
const videoId = this.shortCreator.addToQueue(
  input.scenes,
  input.config,
  callbackUrl,
  {
    ...processedData.metadata,
    mode: "nano-banana-to-veo3",
    youtubeUpload: req.body.youtubeUpload || processedData.metadata?.youtubeUpload
  }
);
```

---

#### 3. `src/server/api/veo3.ts`
**위치:** Line 60
**변경 내용:** metadata 객체에 `youtubeUpload` 추가

```typescript
const metadata = {
  ...processedData.metadata,
  mode: "veo3",
  youtubeUpload: req.body.youtubeUpload || processedData.metadata?.youtubeUpload,
  channel_config: {
    ...processedData.metadata?.channel_config,
    veo3_priority: true
  }
};
```

---

#### 4. `src/server/api/consistent-shorts.ts`
**위치:** Line 149
**변경 내용:** metadata에 `youtubeUpload` 추가

```typescript
const videoId = this.shortCreator.addToQueue(
  input.scenes,
  input.config,
  callbackUrl,
  {
    mode: "consistent-shorts",
    characterDescription: character.description,
    characterStyle: character.style,
    useReferenceSet: config?.useReferenceSet || false,
    generateVideos: config?.generateVideos || false,
    youtubeUpload: req.body.youtubeUpload
  }
);
```

---

### 핵심 구현 패턴

모든 엔드포인트에서 동일한 패턴을 따릅니다:

```typescript
// 1. Request body에서 youtubeUpload 추출
const { scenes, config, youtubeUpload } = req.body;

// 2. addToQueue() 호출 시 metadata에 포함
const videoId = this.shortCreator.addToQueue(
  scenes,
  config,
  callbackUrl,
  {
    ...otherMetadata,
    youtubeUpload: youtubeUpload || metadata?.youtubeUpload  // ← 핵심
  }
);
```

---

### YouTube 업로드 흐름도

```
┌─────────────────────┐
│  API Request        │
│  (with youtubeUpload)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  API Endpoint       │
│  (pexels.ts 등)     │
│  → metadata에 포함   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  ShortCreator       │
│  addToQueue()       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Video Generation   │
│  (Pexels/NANO/VEO3) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Check:             │
│  metadata.youtubeUpload│
│  .enabled === true? │
└──────────┬──────────┘
           │ YES
           ▼
┌─────────────────────┐
│  handleYouTubeUpload│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  YouTubeUploader    │
│  uploadVideo()      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  YouTube API        │
│  videos.insert()    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  ✅ Upload Complete │
│  Return Video ID    │
└─────────────────────┘
```

---

## 에러 처리

### 1. YouTube Uploader 없음
```typescript
if (!this.youtubeUploader) {
  logger.warn('YouTube uploader not available, skipping auto-upload');
  return; // 영상 생성은 계속 진행
}
```

### 2. 채널 인증 안 됨
```typescript
if (!this.youtubeUploader.isChannelAuthenticated(channelName)) {
  logger.warn({ channelName }, 'Channel not authenticated, skipping');
  return; // 영상 생성은 계속 진행
}
```

### 3. 업로드 실패
```typescript
catch (error) {
  logger.error({ error, videoId }, '❌ YouTube upload failed');
  // 영상은 생성되었으므로 에러를 throw하지 않음
  // 사용자는 수동으로 업로드 가능
}
```

**중요:** YouTube 업로드 실패 시에도 영상 생성은 정상적으로 완료됩니다.

---

## PowerShell에서 테스트하기

### 방법 1: 인라인 JSON

```powershell
$body = @{
  scenes = @(
    @{
      text = "테스트 영상"
      searchTerms = @("technology", "ai")
    }
  )
  config = @{
    orientation = "portrait"
    voice = "af_heart"
  }
  youtubeUpload = @{
    enabled = $true
    channelName = "MainChannel"
    title = "PowerShell 테스트"
    description = "PowerShell에서 업로드한 영상"
    tags = @("shorts", "test")
    privacy = "private"
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri http://localhost:3000/api/video/pexels `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

### 방법 2: JSON 파일 사용

```powershell
# test.json 파일 생성
$json = @{
  scenes = @(...)
  config = @{...}
  youtubeUpload = @{...}
} | ConvertTo-Json -Depth 10

$json | Out-File -FilePath "test.json" -Encoding utf8

# API 호출
Invoke-RestMethod -Uri http://localhost:3000/api/video/pexels `
  -Method Post `
  -ContentType "application/json" `
  -InFile "test.json"
```

---

## 상태 확인

### 영상 생성 상태 확인

```bash
curl http://localhost:3000/api/video/pexels/{videoId}/status
```

**응답 예시:**
```json
{
  "status": "ready",
  "videoId": "cmhyvnfmy00009tdl7ysf6dff",
  "videoPath": "/path/to/video.mp4",
  "fileSize": 677275,
  "metadata": {
    "youtubeVideoId": "TnagGaqZMHE",
    "youtubeUrl": "https://www.youtube.com/watch?v=TnagGaqZMHE"
  }
}
```

### YouTube 업로드 상태 확인

```bash
curl http://localhost:3000/api/youtube/upload/status/{videoId}
```

---

## 문제 해결

### Q1: YouTube 업로드가 실행되지 않아요
**확인 사항:**
1. `youtubeUpload.enabled`가 `true`인지 확인
2. 채널이 인증되었는지 확인:
   ```bash
   curl http://localhost:3000/api/youtube/channels
   ```
3. 서버 로그에서 에러 확인

### Q2: "Channel not authenticated" 에러
**해결:**
```bash
# 인증 URL 받기
curl http://localhost:3000/api/youtube/auth/url/MainChannel

# 브라우저에서 인증 완료 후 코드 입력
curl -X POST http://localhost:3000/api/youtube/auth/callback \
  -H "Content-Type: application/json" \
  -d '{"channelName": "MainChannel", "code": "인증코드"}'
```

### Q3: 영상은 생성되었는데 YouTube에 없어요
**확인:**
1. 서버 로그에서 업로드 성공 메시지 확인
2. YouTube Studio에서 "비공개" 또는 "일부 공개" 영상 확인
3. 올바른 채널에 로그인되어 있는지 확인

---

## 다음 AI를 위한 체크리스트

이 문서를 읽는 다음 AI가 YouTube 자동 업로드 기능을 이해하고 활용하기 위한 체크리스트:

### ✅ 기본 이해
- [ ] YouTube 자동 업로드는 모든 영상 생성 엔드포인트에서 작동
- [ ] `youtubeUpload` 파라미터를 request body에 포함하면 자동 업로드
- [ ] 영상 생성 완료 후 즉시 업로드 (별도 API 호출 불필요)

### ✅ 파라미터 이해
- [ ] `enabled: true` - 자동 업로드 활성화
- [ ] `channelName` - 인증된 채널 이름 (MainChannel, SecondChannel, TestChannel)
- [ ] `title` - 영상 제목 (선택, 기본값: 자동 생성)
- [ ] `privacy` - private, unlisted, public 중 선택

### ✅ 구현 위치
- [ ] API 엔드포인트: `src/server/api/*.ts` - metadata에 youtubeUpload 추가
- [ ] 영상 생성: `ShortCreatorRefactored.ts:272` - metadata 확인 및 업로드 트리거
- [ ] 업로드 로직: `ShortCreatorRefactored.ts:774` - handleYouTubeUpload()
- [ ] YouTube API: `YouTubeUploader.ts` - 실제 업로드 실행

### ✅ 지원 엔드포인트
- [ ] `/api/video/pexels` - Pexels 영상
- [ ] `/api/video/nano-banana` - NANO BANANA 정적 이미지
- [ ] `/api/video/nano-banana/nano-banana-to-veo3` - NANO → VEO3 변환
- [ ] `/api/video/veo3` - VEO3 직접 생성
- [ ] `/api/video/consistent-shorts` - 캐릭터 일관성 쇼츠

### ✅ 테스트 방법
- [ ] 서버 시작: `npm start` (기본 포트 3000)
- [ ] API 호출 시 `youtubeUpload` 파라미터 포함
- [ ] 상태 확인: `GET /api/video/{endpoint}/{videoId}/status`
- [ ] YouTube Studio에서 업로드 확인

---

## 참고 자료

### 관련 파일
- `src/server/api/pexels.ts` - Pexels 엔드포인트
- `src/server/api/nano-banana.ts` - NANO BANANA 엔드포인트
- `src/server/api/veo3.ts` - VEO3 엔드포인트
- `src/server/api/consistent-shorts.ts` - Consistent Shorts 엔드포인트
- `src/short-creator/ShortCreatorRefactored.ts` - 영상 생성 및 업로드 로직
- `src/youtube-upload/services/YouTubeUploader.ts` - YouTube API 인터페이스

### YouTube API 문서
- [YouTube Data API v3](https://developers.google.com/youtube/v3)
- [Videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)
- [Video Categories](https://developers.google.com/youtube/v3/docs/videoCategories/list)

---

## 업데이트 기록

| 날짜 | 내용 |
|------|------|
| 2025-11-14 | YouTube 자동 업로드 기능 완성 및 테스트 성공 |
| 2025-11-14 | 모든 엔드포인트에 youtubeUpload metadata 추가 완료 |
| 2025-11-14 | 문서 작성 완료 |

---

## 문의 및 지원

문제가 발생하거나 질문이 있으면:
1. 서버 로그 확인: `tail -f logs/server.log`
2. YouTube 채널 인증 상태 확인: `GET /api/youtube/channels`
3. 영상 생성 상태 확인: `GET /api/video/{endpoint}/{videoId}/status`

**성공 사례:**
- videoId: `cmhyvnfmy00009tdl7ysf6dff`
- YouTube Video ID: `TnagGaqZMHE`
- URL: https://www.youtube.com/watch?v=TnagGaqZMHE
- 생성 → 업로드 완료 시간: 약 25초
