# Pexels to VEO3 Migration Guide

## 🎯 Overview
This guide explains how to switch your video source from Pexels stock videos to Google VEO3 AI-generated videos for more customized and relevant content.

## 📋 Prerequisites

### 1. Google Cloud Setup
- Google Cloud Project with billing enabled
- VEO API access (currently in limited preview)
- Service account with proper permissions

### 2. API Key Configuration
1. Create a service account in Google Cloud Console
2. Download the JSON key file
3. Enable the VEO API for your project

## ⚙️ Configuration Changes

### 1. Environment Variables (.env)
```env
# Change VIDEO_SOURCE from default to veo or both
VIDEO_SOURCE=veo  # or "both" for fallback to Pexels

# Google VEO Configuration
GOOGLE_VEO_API_KEY=/path/to/your/service-account-key.json
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_REGION=us-central1  # or your preferred region

# Keep Pexels for fallback (optional)
PEXELS_API_KEY=your_pexels_key_here
```

### 2. Current Configuration Status
According to your `.env` file:
```env
VIDEO_SOURCE=ffmpeg  # Currently bypassing both Pexels and VEO
GOOGLE_VEO_API_KEY=/mnt/d/Data/00_Personal/YTB/short-video-maker/ttstest-472902-9395d597b314.json
GOOGLE_CLOUD_PROJECT_ID=ttstest-472902
```

## 🔄 Switching Process

### Step 1: Change Video Source
```env
# From:
VIDEO_SOURCE=ffmpeg

# To:
VIDEO_SOURCE=veo
```

### Step 2: Verify VEO Configuration
The system will automatically:
1. Initialize Google VEO API using your credentials
2. Use VEO for generating videos based on scene descriptions
3. Fall back to Pexels if VEO fails (when VIDEO_SOURCE=both)

## 🎨 How VEO3 Generation Works

### 1. Scene Analysis
- Your scene text is analyzed for visual elements
- Search terms are converted to VEO generation prompts
- Duration is automatically set based on audio length

### 2. Video Generation Process
```typescript
// Example: Scene text gets converted to VEO prompt
const sceneText = "A beautiful sunset over mountains";
const searchTerms = ["sunset", "mountains", "landscape"];

// VEO generates video based on:
// - Visual description: "A beautiful sunset over mountains"
// - Duration: Based on TTS audio length
// - Style: Cinematic, high quality
```

### 3. Quality Benefits
- **Custom Content**: Videos generated specifically for your script
- **Perfect Fit**: Exact duration matching your audio
- **Style Consistency**: Consistent visual style across scenes
- **No Copyright Issues**: AI-generated content is royalty-free

## 📊 Comparison: Pexels vs VEO3

| Feature | Pexels | VEO3 |
|---------|--------|------|
| Content Type | Stock footage | AI-generated |
| Relevance | Search-based matching | Custom creation |
| Duration | Fixed length clips | Exact duration match |
| Cost | Free tier available | Pay-per-generation |
| Quality | Professional stock | AI cinematic quality |
| Consistency | Varies by source | Consistent style |

## 🚀 Implementation Example

### Current Flow (Pexels)
```typescript
// Searches for existing videos matching terms
const video = await pexelsApi.findVideo(["sunset", "mountains"], audioDuration);
```

### New Flow (VEO3)
```typescript
// Generates custom video for exact scene
const video = await veoApi.generateVideo({
  prompt: "A beautiful sunset over mountains with golden light",
  duration: audioDuration,
  style: "cinematic"
});
```

## 🔧 Troubleshooting

### Common Issues

1. **VEO API Not Available**
   - Error: "VEO API keys not configured"
   - Solution: Ensure proper .env configuration

2. **Quota Exceeded**
   - Error: API quota limits reached
   - Solution: Use VIDEO_SOURCE=both for Pexels fallback

3. **Generation Timeout**
   - VEO generation can take 1-3 minutes per video
   - System will show progress logs during generation

### Fallback Strategy
```env
# Recommended for production
VIDEO_SOURCE=both  # VEO first, Pexels fallback
```

## 📝 Testing Your Setup

### 1. Test VEO Generation
```bash
# Start server with VEO enabled
VIDEO_SOURCE=veo npm start

# Create test video to verify VEO integration
# Check logs for "initializing google veo api"
```

### 2. Monitor Generation
Watch for logs like:
```
[DEBUG] initializing google veo api
[DEBUG] VEO video generation started: prompt="sunset mountains"
[DEBUG] VEO video generation completed: 4.2s duration
```

## 🎯 Benefits of Migration

### Content Quality
- **Relevance**: 100% match to your script content
- **Consistency**: Uniform visual style across all scenes
- **Uniqueness**: No duplicate content from stock libraries

### Technical Advantages
- **Perfect Timing**: Exact audio-video synchronization
- **Scalability**: Generate unlimited unique content
- **Customization**: Control visual style and mood

### Cost Considerations
- **VEO**: Pay-per-generation model
- **Pexels**: Free tier + paid plans
- **Recommendation**: Use "both" mode for cost optimization

## 🔄 Migration Steps Summary

1. ✅ **Verify Google Cloud Setup**: Service account and API access
2. ✅ **Update .env Configuration**: Change VIDEO_SOURCE to "veo" or "both"  
3. ✅ **Test Generation**: Create sample video to verify setup
4. ✅ **Monitor Performance**: Check generation times and quality
5. ✅ **Optimize Settings**: Adjust fallback strategy based on needs

## 💡 Pro Tips

1. **Use "both" mode** for production to ensure reliability
2. **Monitor VEO quotas** to avoid service interruptions
3. **Test thoroughly** before switching from Pexels completely
4. **Keep Pexels configured** as backup even when using VEO primarily

이제 VEO3를 통해 더욱 정확하고 커스텀한 비디오 콘텐츠를 생성할 수 있습니다! 🎬✨