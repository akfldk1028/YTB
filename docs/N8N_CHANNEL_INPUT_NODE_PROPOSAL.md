# N8N 채널 입력 노드 추가 제안

## 🎯 **현재 문제점**

Random 노드에서 언어를 랜덤 선택하면:
- 채널별 일관성 없음
- 운영자가 컨트롤 불가
- 브랜딩 혼재

## ✅ **제안 솔루션: 채널 설정 노드 추가**

### **새로운 워크플로우 구조**:
```
[Channel Config] → [Random] → [AI Generation] → [Google Sheets] → [Code3] → [API]
```

### **1️⃣ Channel Config 노드 (새로 추가)**

**노드 타입**: Manual Trigger 또는 Set Node
**설정값**:
```json
{
  "channel_name": "비즈니스 성공 한국어",
  "channel_language": "korean", 
  "channel_target": "business_korean",
  "voice_preference": "pNInz6obpgDQGcFmaJgB",
  "content_style": "professional"
}
```

### **2️⃣ Random 노드 수정**

**기존**:
```javascript
const targetLanguage = channelLanguages[Math.floor(Math.random() * channelLanguages.length)];
```

**수정 후**:
```javascript
// 채널 설정에서 언어 가져오기
const channelConfig = $('Channel Config').first().json;
const targetLanguage = channelConfig.channel_language || "korean";
const voiceId = channelConfig.voice_preference;
const contentStyle = channelConfig.content_style || "casual";
```

## 🏗️ **채널별 설정 예시**

### **한국어 비즈니스 채널**:
```json
{
  "channel_name": "성공마인드 코리아",
  "channel_language": "korean",
  "voice_preference": "pNInz6obpgDQGcFmaJgB",
  "content_categories": ["Business Success", "Productivity Tips", "Wellness"],
  "upload_schedule": "morning_evening"
}
```

### **영어 글로벌 채널**:
```json
{
  "channel_name": "Global Success Hub", 
  "channel_language": "english",
  "voice_preference": "21m00Tcm4TlvDq8ikWAM",
  "content_categories": ["Science Facts", "Learning Methods", "Tech Tips"],
  "upload_schedule": "afternoon_night"
}
```

### **일본어 프리미엄 채널**:
```json
{
  "channel_name": "成功への道",
  "channel_language": "japanese", 
  "voice_preference": "japanese_voice_id",
  "content_categories": ["Health Tips", "Relationships", "Life Hacks"],
  "upload_schedule": "evening_night"
}
```

## ⚡ **구현 방법 2가지**

### **방법 1: Manual Trigger 활용**
- N8N 실행 시 채널 정보 수동 입력
- 실행마다 다른 채널 설정 가능

### **방법 2: 환경변수 활용**  
- N8N 환경변수에 채널 설정 저장
- 워크플로우 배포 시 채널별 복사

## 🎯 **장점**

1. **명확한 채널 정체성**: 각 채널별 일관된 언어/스타일
2. **운영 효율성**: 채널별 맞춤 콘텐츠 자동 생성
3. **수익 최적화**: 언어별 CPM, 시간대별 최적화 가능
4. **확장성**: 새 채널 추가시 설정만 변경

## 🔧 **즉시 적용**

Random 노드 앞에 **Set 노드** 하나만 추가하면:
```json
{
  "channel_language": "korean",
  "voice_id": "pNInz6obpgDQGcFmaJgB"  
}
```

이렇게 하면 채널별 운영이 훨씬 체계적이 됩니다! 🚀