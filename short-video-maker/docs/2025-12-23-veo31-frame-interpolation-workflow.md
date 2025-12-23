# VEO 3.1 First+Last Frame Interpolation 워크플로우 (2025-12-23)

## 개요

VEO 3.1의 First+Last Frame Interpolation을 사용하여 씬 간 부드러운 전환이 있는 영상을 생성하고 YouTube에 업로드하는 전체 워크플로우.

---

## Quick Reference (AI용)

### 핵심 설정

| 설정 | 값 | 설명 |
|------|-----|------|
| `useFrameInterpolation` | `true` | VEO 3.1 First+Last Frame 활성화 |
| `veoModel` | `veo-3.1-generate-preview` | VEO 3.1 모델 지정 (자동) |
| `generateVideos` | `true` | 비디오 생성 활성화 |
| `duration` | `8` (자동) | 인터폴레이션 시 자동 8초 |

### 워크플로우 순서

```
1. POST /api/video/consistent-shorts  → 영상 생성 시작
2. GET  /api/video/consistent-shorts/:videoId/status  → 상태 확인 (polling)
3. POST /api/youtube/upload  → YouTube 업로드
```

---

## 1단계: 영상 생성 요청

### 기본 요청 구조

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{
    "characterReference": {
      "profileId": "cat-couple"
    },
    "scenes": [
      {
        "text": "까미가 창가에 앉아 밖을 바라보고 있어요",
        "scenePrompt": "Black cat sitting by the window, looking outside",
        "characterIds": ["kami"]
      },
      {
        "text": "딸기가 다가와서 까미 옆에 앉아요",
        "scenePrompt": "White cat approaches and sits next to black cat",
        "characterIds": ["kami", "dalgi"]
      }
    ],
    "config": {
      "orientation": "portrait",
      "generateVideos": true,
      "useFrameInterpolation": true
    }
  }'
```

### 응답 예시

```json
{
  "videoId": "cmji049lu00000es62vi0a9jc",
  "veoMode": "VEO 3.1 (First+Last Frame)",
  "message": "Consistent character video generation started..."
}
```

---

## 2단계: 상태 확인 (Polling)

### 상태 확인 요청

```bash
curl -s ".../api/video/consistent-shorts/{videoId}/status"
```

### 상태 값

| status | 의미 |
|--------|------|
| `processing` | 생성 중 (2-3분 소요) |
| `ready` | 완료 |
| `error` | 오류 발생 |

### 완료 응답 예시

```json
{
  "status": "ready",
  "videoId": "cmji049lu00000es62vi0a9jc",
  "videoPath": "/app/data/videos/cmji049lu00000es62vi0a9jc.mp4",
  "fileSize": 1574648
}
```

---

## 3단계: YouTube 업로드

### 업로드 요청

```bash
curl -X POST ".../api/youtube/upload" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "cmji049lu00000es62vi0a9jc",
    "channelName": "why_cat",
    "metadata": {
      "title": "까미와 딸기의 창가 이야기",
      "description": "설명...\n\n#shorts #고양이",
      "tags": ["고양이", "shorts", "cat"],
      "categoryId": "22",
      "privacyStatus": "private"
    },
    "notifySubscribers": false
  }'
```

### 응답 예시

```json
{
  "success": true,
  "youtubeVideoId": "VFz74cgzfm4",
  "url": "https://www.youtube.com/watch?v=VFz74cgzfm4"
}
```

---

## VEO 3.1 First+Last Frame 동작 원리

### 인터폴레이션 프로세스

```
Scene 1 이미지 생성 → Scene 2 이미지 생성
        ↓                    ↓
   First Frame          Last Frame
        ↓                    ↓
        └──── VEO 3.1 ──────┘
                 ↓
         부드러운 전환 영상 (8초)
```

### 핵심 특징

1. **자동 duration=8**: 인터폴레이션 시 API 요구사항으로 자동 8초
2. **캐릭터 일관성**: First/Last Frame에 동일 캐릭터 스타일 유지
3. **부드러운 모션**: 두 프레임 간 자연스러운 전환 생성

---

## Scene별 캐릭터 지정

### 예시: 씬마다 다른 캐릭터

```json
{
  "scenes": [
    {
      "text": "까미 혼자 등장",
      "characterIds": ["kami"]           // Scene 1: 까미만
    },
    {
      "text": "딸기가 등장",
      "characterIds": ["dalgi"]          // Scene 2: 딸기만
    },
    {
      "text": "둘이 함께",
      "characterIds": ["kami", "dalgi"]  // Scene 3: 둘 다
    }
  ]
}
```

---

## 프로필/채널 매핑

| profileId | channelName | 캐릭터 |
|-----------|-------------|--------|
| `cat-couple` | `why_cat` | kami, dalgi |
| `otter-couple` | `수달TV` | husband, wife |

---

## 트러블슈팅

### 영상 생성 시간

- VEO 3.1 인터폴레이션: 씬당 약 1-2분
- 2개 씬 기준: 총 2-4분 소요

### 상태가 계속 processing인 경우

```bash
# 로그 확인
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=short-video-maker" --limit=20
```

---

## 실제 사용 예시 (2025-12-23 테스트)

### 생성 정보

- **videoId**: `cmji049lu00000es62vi0a9jc`
- **YouTube URL**: https://www.youtube.com/watch?v=VFz74cgzfm4
- **프로필**: cat-couple (까미, 딸기)
- **씬 구성**:
  - Scene 1: 까미가 창가에 앉아 밖을 바라봄
  - Scene 2: 딸기가 다가와 까미 옆에 앉음
- **파일 크기**: 약 1.5MB

---

## 관련 문서

- [[CHARACTER-MANAGEMENT-GUIDE]] - 캐릭터 관리 가이드
- [[2025-12-23-character-image-registration]] - 이미지 등록 방법
- [[CLAUDE]] - 프로젝트 AI 컨텍스트
