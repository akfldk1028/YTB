# YouTube 다중 채널 백업 가이드

## 📁 토큰 저장 위치

### WSL 경로
```bash
~/.ai-agents-az-video-generator/
```

### Windows 탐색기 경로
```
\\wsl.localhost\Ubuntu\home\akfldk1028\.ai-agents-az-video-generator\
```

이 경로를 Windows 탐색기 주소창에 붙여넣으면 파일에 직접 접근할 수 있습니다.

---

## 📄 저장되는 파일들

### 1. youtube-channels.json
모든 인증된 채널의 정보를 담고 있는 중앙 파일

**구조:**
```json
{
  "channels": {
    "MainChannel": {
      "channelName": "MainChannel",           // 시스템 내부에서 사용하는 이름
      "channelId": "UC7Qhr0aTucaeQ9I-DhIbFpA", // 실제 YouTube 채널 ID
      "channelTitle": "ATT",                  // YouTube에 표시되는 채널명
      "email": "",
      "createdAt": "2025-11-14T06:00:23.501Z",
      "authenticated": true,
      "description": "",
      "customUrl": "@att-m6i",
      "thumbnailUrl": "https://yt3.ggpht.com/..."
    }
  }
}
```

### 2. youtube-tokens-{channelName}.json
각 채널별로 별도의 OAuth 토큰 파일

**파일명 예시:**
- `youtube-tokens-MainChannel.json`
- `youtube-tokens-SecondChannel.json`
- `youtube-tokens-ThirdChannel.json`

**구조:**
```json
{
  "access_token": "ya29.a0ATi6K2t...",      // 짧은 수명 (1시간)
  "refresh_token": "1//0eljDdzRSe...",      // 긴 수명 (7일)
  "scope": "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube",
  "token_type": "Bearer",
  "refresh_token_expires_in": 604799,       // 초 단위 (7일)
  "expiry_date": 1763103635202              // 밀리초 타임스탬프
}
```

---

## 🔄 현재 인증된 채널 목록

현재 시스템에 저장된 채널들:

| channelName | channelTitle | channelId | customUrl | 인증날짜 |
|-------------|--------------|-----------|-----------|---------|
| MainChannel | ATT | UC7Qhr0aTucaeQ9I-DhIbFpA | @att-m6i | 2025-11-14 |
| main_channel | CGXR | UCaadthD1K_3rUodAkVSucPA | @cgxr-h3x | 2025-10-12 |
| att_channel | ATT | UC7Qhr0aTucaeQ9I-DhIbFpA | @att-m6i | 2025-10-14 |

---

## 💾 백업 방법

### 방법 1: 전체 디렉토리 백업
```bash
# WSL에서 실행
cd ~
tar -czf youtube-backup-$(date +%Y%m%d).tar.gz .ai-agents-az-video-generator/
```

백업 파일은 `youtube-backup-20251114.tar.gz` 형식으로 생성됩니다.

### 방법 2: Windows에서 폴더 복사
1. Windows 탐색기를 엽니다
2. 주소창에 다음을 입력:
   ```
   \\wsl.localhost\Ubuntu\home\akfldk1028\.ai-agents-az-video-generator\
   ```
3. 폴더 전체를 원하는 위치로 복사 (예: D:\Backup\youtube-tokens\)

### 방법 3: 개별 파일 백업 (추천)
중요한 파일만 선택적으로 백업:

```bash
# 백업 디렉토리 생성
mkdir -p ~/backups/youtube-$(date +%Y%m%d)

# 중요 파일 복사
cp ~/.ai-agents-az-video-generator/youtube-channels.json ~/backups/youtube-$(date +%Y%m%d)/
cp ~/.ai-agents-az-video-generator/youtube-tokens-*.json ~/backups/youtube-$(date +%Y%m%d)/
```

---

## 🔐 보안 주의사항

### ⚠️ 절대 공유하면 안 되는 파일들

1. **youtube-tokens-*.json** - OAuth 토큰이 들어있음
   - 이 파일이 유출되면 다른 사람이 당신의 YouTube 채널에 영상을 업로드할 수 있습니다
   - **Git에 커밋하지 마세요!**
   - 공개 저장소에 업로드하지 마세요!

2. **youtube-channels.json** - 채널 정보 포함
   - 채널 ID 등 민감한 정보가 포함되어 있습니다

### ✅ 안전하게 백업하는 방법

1. **암호화된 저장소에 보관**
   - OneDrive, Google Drive (비공개 폴더)
   - 암호로 보호된 USB 드라이브
   - 암호화된 압축 파일

2. **암호화 압축 만들기**
   ```bash
   # 7zip으로 암호 설정
   7z a -p -mhe=on youtube-backup.7z ~/.ai-agents-az-video-generator/
   ```

3. **권한 확인**
   ```bash
   # 파일 권한이 600 (소유자만 읽기/쓰기)인지 확인
   ls -l ~/.ai-agents-az-video-generator/youtube-tokens-*.json
   ```

---

## 🔄 복원 방법

### 새로운 시스템에서 복원

1. **디렉토리 생성**
   ```bash
   mkdir -p ~/.ai-agents-az-video-generator
   ```

2. **파일 복사**
   ```bash
   # 백업에서 복원
   cp /path/to/backup/youtube-*.json ~/.ai-agents-az-video-generator/
   ```

3. **권한 설정**
   ```bash
   chmod 600 ~/.ai-agents-az-video-generator/youtube-tokens-*.json
   chmod 644 ~/.ai-agents-az-video-generator/youtube-channels.json
   ```

4. **서버 재시작**
   ```bash
   cd /mnt/d/Data/00_Personal/YTB/short-video-maker
   npm start
   ```

5. **채널 확인**
   ```bash
   curl http://localhost:3124/api/youtube/channels
   ```

---

## 🆕 새 채널 추가하기

### 1단계: 채널 추가 요청
```bash
curl -X POST http://localhost:3124/api/youtube/channels \
  -H "Content-Type: application/json" \
  -d '{"channelName": "SecondChannel"}'
```

### 2단계: 브라우저에서 인증
응답으로 받은 authUrl을 브라우저에 입력하여 Google 계정으로 로그인

### 3단계: 자동 생성되는 파일 확인
```bash
ls -lah ~/.ai-agents-az-video-generator/youtube-tokens-SecondChannel.json
```

새로운 채널이 추가될 때마다:
- `youtube-channels.json`에 채널 정보 추가됨
- `youtube-tokens-{channelName}.json` 파일 자동 생성됨

---

## 📊 채널 관리 명령어

### 모든 채널 조회
```bash
curl http://localhost:3124/api/youtube/channels
```

### 특정 채널 정보 확인
```bash
curl http://localhost:3124/api/youtube/channels/MainChannel
```

### 채널 인증 상태 확인
```bash
curl http://localhost:3124/api/youtube/channels/MainChannel/videos
```

### 채널 삭제
```bash
curl -X DELETE http://localhost:3124/api/youtube/channels/MainChannel
```

삭제하면:
- `youtube-channels.json`에서 해당 채널 정보 제거
- `youtube-tokens-MainChannel.json` 파일 삭제

---

## 🎬 채널별 영상 업로드 예시

### 기본 채널로 업로드 (.env 설정 사용)
```bash
# .env에 YOUTUBE_DEFAULT_CHANNEL=MainChannel 설정되어 있으면
curl -X POST http://localhost:3124/api/video/pexels/generate \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "title": "테스트 영상",
      "videoLength": 30
    }
  }'
```

### 특정 채널 지정해서 업로드
```bash
curl -X POST http://localhost:3124/api/video/pexels/generate \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "title": "테스트 영상",
      "videoLength": 30,
      "youtubeUpload": {
        "enabled": true,
        "channelName": "SecondChannel",
        "title": "두 번째 채널 영상",
        "description": "두 번째 채널에 업로드되는 영상입니다",
        "tags": ["test", "secondchannel"],
        "privacy": "private"
      }
    }
  }'
```

---

## 🔧 토큰 갱신 정보

### 자동 갱신
- `access_token`은 1시간마다 자동으로 갱신됩니다
- `refresh_token`을 사용하여 새로운 `access_token`을 받아옵니다
- 시스템이 자동으로 처리하므로 수동 작업 불필요

### 토큰 만료 시
- `refresh_token`도 7일 후 만료됩니다
- 만료되면 다시 OAuth 인증 필요:
  ```bash
  # 채널 삭제
  curl -X DELETE http://localhost:3124/api/youtube/channels/MainChannel

  # 채널 재등록
  curl -X POST http://localhost:3124/api/youtube/channels \
    -H "Content-Type: application/json" \
    -d '{"channelName": "MainChannel"}'
  ```

---

## 📝 체크리스트

### 백업 체크리스트
- [ ] `youtube-channels.json` 백업됨
- [ ] 모든 `youtube-tokens-*.json` 파일 백업됨
- [ ] 백업 파일이 안전한 곳에 보관됨
- [ ] 백업 파일이 암호화되었거나 비공개 저장소에 있음
- [ ] Git에 토큰 파일이 커밋되지 않았는지 확인 (.gitignore 확인)

### 복원 체크리스트
- [ ] 디렉토리 생성됨 (`~/.ai-agents-az-video-generator/`)
- [ ] 파일 복사 완료
- [ ] 파일 권한 설정 완료 (600 for tokens, 644 for channels)
- [ ] 서버 재시작 완료
- [ ] 채널 목록 확인 완료 (curl로 테스트)
- [ ] 각 채널 인증 상태 확인 완료

---

## 💡 팁

### 다중 채널 운영 전략

1. **채널별 명명 규칙**
   - 명확한 이름 사용: `MainChannel`, `TechChannel`, `EntertainmentChannel`
   - 영어로 작성 (특수문자 없이)
   - 채널 용도를 알 수 있게

2. **.env 설정**
   ```bash
   # 가장 자주 사용하는 채널을 기본값으로
   YOUTUBE_DEFAULT_CHANNEL=MainChannel
   ```

3. **정기 백업 스케줄**
   - 매주 일요일: 전체 백업
   - 새 채널 추가 직후: 즉시 백업
   - 중요한 설정 변경 후: 즉시 백업

4. **채널별 용도 문서화**
   | channelName | 용도 | 업로드 빈도 |
   |-------------|------|-----------|
   | MainChannel | 메인 콘텐츠 | 매일 |
   | TestChannel | 테스트 | 필요시 |
   | SecondChannel | 서브 콘텐츠 | 주 3회 |

---

## 🚨 문제 해결

### "Token expired" 오류
```bash
# 해당 채널 재인증
curl -X DELETE http://localhost:3124/api/youtube/channels/MainChannel
curl -X POST http://localhost:3124/api/youtube/channels \
  -H "Content-Type: application/json" \
  -d '{"channelName": "MainChannel"}'
```

### 파일을 찾을 수 없음
```bash
# 파일 존재 확인
ls -lah ~/.ai-agents-az-video-generator/

# 디렉토리가 없으면 생성
mkdir -p ~/.ai-agents-az-video-generator/
```

### 권한 오류
```bash
# 올바른 권한 설정
chmod 600 ~/.ai-agents-az-video-generator/youtube-tokens-*.json
chmod 644 ~/.ai-agents-az-video-generator/youtube-channels.json
```

---

## 📚 관련 문서

- [YouTube Multi-Channel Upload Guide](./README_YOUTUBE_MULTI_CHANNEL.md)
- [YouTube Upload API Reference](./README_YOUTUBE_UPLOAD.md)
- [Video Creation Workflow](./VIDEO_CREATION_WORKFLOW.md)

---

**마지막 업데이트:** 2025-11-14
**버전:** 1.0
