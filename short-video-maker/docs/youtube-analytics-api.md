# YouTube Analytics API Endpoints

Base URL: `https://short-video-maker-7qtnitbuvq-uc.a.run.app`

## 1. 채널 비디오 목록 조회

**Endpoint:** `GET /api/analytics/channel/:channelName/videos`

**설명:** 특정 채널의 업로드된 비디오 목록 조회

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| channelName | path | Yes | - | 채널 이름 (ATT, main_channel 등) |
| maxResults | query | No | 50 | 최대 결과 수 (최대 50) |

**Example:**
```
GET /api/analytics/channel/ATT/videos?maxResults=10
```

**Response:**
```json
{
  "success": true,
  "videos": [
    {
      "videoId": "KA0tBcO_5pc",
      "title": "YouTube Permanent Token Test",
      "publishedAt": "2025-11-25T07:01:29Z",
      "thumbnailUrl": "https://i.ytimg.com/vi/KA0tBcO_5pc/mqdefault.jpg",
      "description": "Testing YouTube auto-upload..."
    }
  ]
}
```

---

## 2. 비디오 Analytics 조회 (기본)

**Endpoint:** `GET /api/analytics/video/:videoId`

**설명:** 특정 비디오의 Analytics 메트릭 조회

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| videoId | path | Yes | - | YouTube 비디오 ID |
| channelName | query | Yes | - | 채널 이름 |
| startDate | query | No | 30일 전 | 시작일 (YYYY-MM-DD) |
| endDate | query | No | 오늘 | 종료일 (YYYY-MM-DD) |
| includeVideoInfo | query | No | true | 비디오 기본 정보 포함 |
| includeTrafficSources | query | No | false | 트래픽 소스 포함 |
| includeGeography | query | No | false | 지역 통계 포함 |
| includeDevices | query | No | false | 디바이스 통계 포함 |
| includeDemographics | query | No | false | 인구 통계 포함 |
| includeCards | query | No | true | 카드/엔드스크린 포함 |
| includePlaylists | query | No | true | 플레이리스트 포함 |
| all | query | No | false | 모든 추가 메트릭 포함 |

**Example:**
```
GET /api/analytics/video/PXXdKsHPYT8?channelName=ATT
```

---

## 3. 비디오 Analytics 전체 조회

**Endpoint:** `GET /api/analytics/video/:videoId/full`

**설명:** 특정 비디오의 모든 Analytics 메트릭 조회 (트래픽, 지역, 디바이스 등 전체)

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| videoId | path | Yes | - | YouTube 비디오 ID |
| channelName | query | Yes | - | 채널 이름 |
| startDate | query | No | 30일 전 | 시작일 (YYYY-MM-DD) |
| endDate | query | No | 오늘 | 종료일 (YYYY-MM-DD) |

**Example:**
```
GET /api/analytics/video/PXXdKsHPYT8/full?channelName=ATT
```

**Response:**
```json
{
  "success": true,
  "data": {
    "videoId": "PXXdKsHPYT8",
    "channelId": "UCaadthD1K_3rUodAkVSucPA",
    "views": 5,
    "likes": 0,
    "comments": 0,
    "estimatedMinutesWatched": 0,
    "averageViewDuration": 14,
    "averageViewPercentage": 361.83,
    "subscribersGained": 0,
    "subscribersLost": 0,
    "shares": 0,
    "videoInfo": {
      "title": "VEO3 Duration Fix Test #shorts",
      "publishedAt": "2025-10-25T12:51:22Z",
      "duration": "PT4S",
      "durationSeconds": 4
    },
    "trafficSources": [
      { "source": "NO_LINK_OTHER", "views": 5 }
    ],
    "deviceBreakdown": [
      { "deviceType": "DESKTOP", "views": 5 }
    ],
    "operatingSystemBreakdown": [
      { "operatingSystem": "WINDOWS", "views": 5 }
    ]
  },
  "reward": {
    "retentionScore": 1,
    "engagementScore": 0,
    "growthScore": 0,
    "viralScore": 0,
    "totalReward": 0.4
  }
}
```

---

## 4. 강화학습 보상값 조회

**Endpoint:** `GET /api/analytics/reward/:videoId`

**설명:** 특정 비디오의 강화학습 보상 값만 조회

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| videoId | path | Yes | - | YouTube 비디오 ID |
| channelName | query | Yes | - | 채널 이름 |

**Example:**
```
GET /api/analytics/reward/PXXdKsHPYT8?channelName=ATT
```

**Response:**
```json
{
  "success": true,
  "videoId": "PXXdKsHPYT8",
  "reward": {
    "retentionScore": 1,
    "engagementScore": 0,
    "growthScore": 0,
    "viralScore": 0,
    "playlistScore": 0,
    "totalReward": 0.4,
    "rawMetrics": {
      "views": 5,
      "likes": 0,
      "shares": 0,
      "subscribersNet": 0,
      "averageViewPercentage": 361.83
    }
  }
}
```

---

## 5. 일괄 Analytics 조회

**Endpoint:** `POST /api/analytics/batch`

**설명:** 여러 비디오의 Analytics 일괄 조회

**Body:**
```json
{
  "channelName": "ATT",
  "videoIds": ["PXXdKsHPYT8", "KA0tBcO_5pc"],
  "startDate": "2025-10-01",
  "endDate": "2025-11-26"
}
```

**Example:**
```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/analytics/batch" \
  -H "Content-Type: application/json" \
  -d '{"channelName":"ATT","videoIds":["PXXdKsHPYT8","KA0tBcO_5pc"]}'
```

---

## 6. 사용 가능한 채널 목록

**Endpoint:** `GET /api/analytics/channels`

**설명:** 설정된 YouTube 채널 목록 조회

**Example:**
```
GET /api/analytics/channels
```

**Response:**
```json
{
  "success": true,
  "channels": ["main_channel", "ATT"]
}
```

---

## 7. 메트릭 설명 문서

**Endpoint:** `GET /api/analytics/metrics`

**설명:** 사용 가능한 모든 메트릭과 설명 조회

**Example:**
```
GET /api/analytics/metrics
```

---

## 보상 계산 공식

| Score | Weight | Description |
|-------|--------|-------------|
| retentionScore | 0.4 | 시청 유지율 기반 (averageViewPercentage / 100, max 1.0) |
| engagementScore | 0.3 | 참여도 (likes / views, max 1.0) |
| growthScore | 0.15 | 구독자 증가 (subscribersGained - subscribersLost) |
| viralScore | 0.1 | 바이럴 (shares / views, max 1.0) |
| playlistScore | 0.05 | 플레이리스트 추가 (videosAddedToPlaylists / views) |

**totalReward = Σ (score × weight)**

---

## N8N 연동 예시

### HTTP Request Node 설정

1. **Method:** GET
2. **URL:** `https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/analytics/channel/ATT/videos`
3. **Response Format:** JSON

### Workflow 예시

```
[Manual Trigger] → [HTTP Request: Get Videos] → [Loop Over Items] → [HTTP Request: Get Analytics] → [Code: Calculate Reward] → [Output]
```
