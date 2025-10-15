# YouTube Multi-Channel Upload System Architecture

## 개요
이 시스템은 하나의 Google OAuth 계정으로 **여러 YouTube 채널**에 동영상을 업로드할 수 있도록 설계되었습니다.

## 핵심 개념

### 1. Account (OAuth 계정)
- Google 계정 하나당 OAuth 토큰 1개
- 하나의 계정으로 여러 YouTube 채널 관리 가능
- 토큰 저장 위치: `~/.ai-agents-az-video-generator/youtube-tokens-{accountName}.json`

### 2. Channel (YouTube 채널)
- YouTube 채널 ID로 구분 (UCxxxx...)
- 각 채널은 하나의 Account에 속함
- 채널 목록 저장: `~/.ai-agents-az-video-generator/youtube-channels.json`

## 데이터 구조

```typescript
// Account: OAuth 인증 정보
{
  "accountName": "main_account",
  "email": "user@gmail.com",
  "accessibleChannels": ["UCaadthD1K_3rUodAkVSucPA", "UC..."],
  "lastAuthenticated": "2025-10-14T12:00:00Z"
}

// Channel: YouTube 채널 정보
{
  "channelId": "UCaadthD1K_3rUodAkVSucPA",
  "channelTitle": "CGXR",
  "customUrl": "@cgxr-h3x",
  "accountName": "main_account"
}
```

## 워크플로우

### 1. OAuth 인증 플로우
```
1. GET /api/youtube/auth/:accountName
   → OAuth URL 생성

2. 사용자가 Google에서 인증 완료

3. GET /api/youtube/auth/callback?code=xxx&state=accountName
   → 토큰 저장
   → 접근 가능한 모든 채널 자동 탐색
   → 채널 목록 저장

4. 결과: Account 1개 + Channels N개 등록
```

### 2. 채널 탐색 플로우
```
1. OAuth 토큰으로 YouTube API 호출
2. channels.list(mine=true, maxResults=50)
3. 모든 채널 정보 저장
4. 각 채널에 accountName 연결
```

### 3. 업로드 플로우
```
1. POST /api/youtube/upload
   {
     "videoId": "xxx",
     "channelId": "UCxxx...",  // 특정 채널 지정
     "metadata": {...}
   }

2. channelId로 어느 Account의 토큰을 사용할지 결정
3. 해당 Account의 토큰으로 업로드
4. onBehalfOfContentOwner 파라미터는 사용 안 함 (일반 사용자용)
```

## API 엔드포인트

### Account 관리
- `POST /api/youtube/accounts` - 새 계정 추가
- `GET /api/youtube/accounts` - 모든 계정 조회
- `GET /api/youtube/accounts/:accountName` - 특정 계정 조회
- `POST /api/youtube/accounts/:accountName/refresh` - 토큰 갱신
- `POST /api/youtube/accounts/:accountName/discover-channels` - 채널 재탐색

### Channel 관리
- `GET /api/youtube/channels` - 모든 채널 조회
- `GET /api/youtube/channels/:channelId` - 특정 채널 조회
- `GET /api/youtube/channels?accountName=xxx` - 특정 계정의 채널들만 조회

### Upload
- `POST /api/youtube/upload` - 비디오 업로드
  - 필수: videoId, channelId, metadata
  - channelId로 자동으로 올바른 계정의 토큰 사용

## 폴더 구조

```
youtube-upload/
├── interfaces/
│   ├── IAccount.ts        # Account 인터페이스
│   ├── IChannel.ts        # Channel 인터페이스
│   └── ITokenManager.ts   # Token 관리 인터페이스
├── services/
│   ├── YouTubeAccountManager.ts   # Account CRUD, 토큰 관리
│   ├── YouTubeChannelDiscovery.ts # 채널 탐색 서비스
│   └── YouTubeUploader.ts         # 업로드 로직
├── types/
│   └── youtube.ts         # 공통 타입 정의
└── routes/
    ├── accountRoutes.ts   # Account API
    ├── channelRoutes.ts   # Channel API
    └── uploadRoutes.ts    # Upload API
```

## 파일 저장 위치

```
~/.ai-agents-az-video-generator/
├── youtube-accounts.json          # 모든 Account 정보
├── youtube-channels.json          # 모든 Channel 정보  
├── youtube-tokens-main_account.json
├── youtube-tokens-second_account.json
└── ...
```

## 주요 제약사항

1. **managedByMe는 사용 불가**: YouTube Content Partner 전용
2. **mine=true만 사용**: 일반 사용자용
3. **각 채널은 명시적 channelId로 구분**: onBehalfOfContentOwner 없이 작동
4. **토큰 자동 갱신**: OAuth2Client의 'tokens' 이벤트 사용

## 마이그레이션 계획

### Phase 1: 백워드 호환 유지
- 기존 channelName 방식 유지
- 새로운 Account/Channel 구조 추가

### Phase 2: 점진적 전환
- 업로드 API에 channelId 옵션 추가
- channelName 또는 channelId 둘 다 지원

### Phase 3: 완전 전환 (옵션)
- channelName 방식 deprecate
- channelId 방식으로 통일
