# 🚀 소셜 미디어 자동화 워크플로우 설정 가이드

## 📋 개요
이 워크플로우는 **완전 자동화된 소셜 미디어 컨텐츠 파이프라인**입니다:

```
컨텐츠 생성 → 비디오 제작 → 인스타그램 업로드 → 유튜브 숏츠 업로드 → 알림
```

## 🔧 필수 설정

### 1. Instagram API 설정

#### Meta for Developers 계정 설정
1. [Meta for Developers](https://developers.facebook.com/) 접속
2. 앱 생성 → "Consumer" 선택
3. Instagram Basic Display API 추가

#### n8n Instagram 크리덴셜 설정
```
Credentials Type: Instagram OAuth2 API
Client ID: [Meta 앱의 Instagram App ID]
Client Secret: [Instagram App Secret]
```

#### 권한 설정
- `instagram_graph_user_profile`
- `instagram_graph_user_media`

### 2. YouTube API 설정

#### Google Cloud Console 설정
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성
3. YouTube Data API v3 활성화
4. OAuth 2.0 클라이언트 ID 생성

#### n8n YouTube 크리덴셜 설정
```
Credentials Type: YouTube OAuth2 API
Client ID: [Google OAuth Client ID]
Client Secret: [Google OAuth Client Secret]
Scope: https://www.googleapis.com/auth/youtube.upload
```

### 3. Telegram 알림 설정 (선택사항)

#### 봇 생성
1. Telegram에서 @BotFather 검색
2. `/newbot` 명령어로 봇 생성
3. Bot Token 저장

#### 환경 변수 설정
```bash
# .env 파일 또는 n8n 환경 변수
TELEGRAM_CHAT_ID=your_chat_id
```

#### Chat ID 찾기
```bash
# 텔레그램 봇에게 메시지 보낸 후
curl https://api.telegram.org/bot[BOT_TOKEN]/getUpdates
```

## 📱 워크플로우 기능

### 🎯 컨텐츠 생성
- **트렌딩 토픽**: Tech, Lifestyle, Business, Health
- **자동 해시태그**: 카테고리별 최적화된 태그
- **다양한 음성**: 5가지 음성 중 랜덤 선택
- **배경 음악**: 분위기에 맞는 음악 자동 선택

### ⏰ 스케줄링
- **자동 실행**: 매일 오전 9시, 오후 3시, 오후 9시
- **수동 실행**: 언제든지 Manual Trigger로 실행 가능

### 📤 업로드 자동화
- **Instagram**: 세로 비디오 + 캡션 + 해시태그
- **YouTube Shorts**: 제목 + 설명 + 태그 자동 설정
- **동시 업로드**: 병렬 처리로 빠른 업로드

### 📊 모니터링
- **실시간 알림**: 성공/실패 텔레그램 알림
- **분석 데이터**: 업로드 성공률, 카테고리별 통계
- **에러 처리**: 실패 시 자동 재시도

## 🛠️ 설치 방법

### 1. 워크플로우 임포트
```bash
# n8n 웹 인터페이스 (http://localhost:5678)
1. Workflows → Import from File
2. social-media-automation.json 선택
3. Import 클릭
```

### 2. 크리덴셜 설정
```bash
# n8n 설정에서 각 서비스 인증 추가
1. Settings → Credentials
2. Instagram OAuth2 API 추가
3. YouTube OAuth2 API 추가
4. Telegram 봇 토큰 추가
```

### 3. 환경 변수 설정
```bash
# Docker 환경에서
docker run -e TELEGRAM_CHAT_ID=your_chat_id n8nio/n8n

# 또는 .env 파일
echo \"TELEGRAM_CHAT_ID=your_chat_id\" >> .env
```

## 🔄 워크플로우 실행

### 수동 실행
1. n8n에서 워크플로우 열기
2. "🖱️ Manual Trigger" 클릭
3. "Execute Workflow" 클릭

### 자동 실행
1. 워크플로우 "Active" 토글 ON
2. 스케줄에 따라 자동 실행 (9AM, 3PM, 9PM)

## 📈 커스터마이징

### 컨텐츠 수정
`🎯 Content Generator` 노드에서 토픽 추가/수정:
```javascript
const topics = [
  {
    category: \"Gaming\",
    scenes: [
      { text: \"2025년 핫한 게임 TOP 5\", search: [\"gaming\", \"2025\", \"trending\"] }
    ],
    tags: [\"#게임\", \"#Gaming\", \"#2025\"],
    title: \"🎮 2025년 꼭 해야 할 게임들!\"
  }
];
```

### 업로드 스케줄 변경
`📅 Daily Schedule` 노드에서 시간 수정:
```json
{
  \"triggerAtHour\": 6,  // 오전 6시
  \"triggerAtMinute\": 30  // 30분
}
```

### 캡션 템플릿 수정
각 업로드 노드에서 캡션 포맷 변경 가능

## 🚨 문제 해결

### Instagram 업로드 실패
```
- Meta Developer 계정 상태 확인
- Instagram 비즈니스 계정 연결 확인
- API 사용량 제한 확인
```

### YouTube 업로드 실패
```
- Google Cloud Console에서 API 할당량 확인
- OAuth 토큰 만료 여부 확인
- 비디오 길이 제한 (Shorts는 60초 이하)
```

### 비디오 생성 실패
```
- Short Video Maker 서버 상태 확인: curl http://localhost:3123/health
- Pexels API 키 설정 확인
- 디스크 용량 확인
```

## 📊 분석 및 모니터링

### 성공률 추적
```bash
# 워크플로우 실행 이력에서 확인
- Total Executions: 전체 실행 횟수
- Success Rate: 성공률
- Average Duration: 평균 실행 시간
```

### 텔레그램 알림 예시
```
🎉 비디오 업로드 완료!

📹 제목: 🤖 2025 AI 트렌드 - 놓치면 후회하는 기술!
📱 카테고리: Tech

📸 Instagram: https://instagram.com/p/abc123
🎥 YouTube: https://youtube.com/shorts/xyz789

⏰ 업로드 시간: 2025-01-15 15:30:45
```

## 🔮 고급 기능

### A/B 테스팅
- 다른 시간대별 성과 비교
- 카테고리별 참여율 분석
- 해시태그 효과 측정

### 콘텐츠 최적화
- 트렌딩 키워드 자동 반영
- 시즌별 컨텐츠 조정
- 사용자 피드백 반영

### 확장 가능성
- TikTok 업로드 추가
- Twitter 동영상 업로드
- Facebook 페이지 연동
- 분석 대시보드 구축

## 📞 지원

문제가 있으시면:
1. n8n 로그 확인
2. API 서비스 상태 확인  
3. 크리덴셜 재설정
4. 워크플로우 단계별 테스트

**완전 자동화된 소셜 미디어 컨텐츠 파이프라인으로 더 많은 팔로워와 수익을 만들어보세요! 🚀**