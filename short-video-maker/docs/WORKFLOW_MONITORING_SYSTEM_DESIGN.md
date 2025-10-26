# Workflow Monitoring System Design

## Overview
Comprehensive workflow monitoring, logging, and notification system for video generation and YouTube upload pipeline.

## Design Principles

Based on 2025 best practices:
1. **Centralized Logging** - All logs in one place for easy debugging
2. **Structured Logging** - JSON format with consistent metadata
3. **Real-Time Status Tracking** - API endpoints for progress monitoring
4. **Webhook Notifications** - Async notifications for success/failure
5. **State Machine Pattern** - Clear workflow states and transitions

## Workflow States

### Video Generation States
```typescript
enum VideoWorkflowState {
  QUEUED = 'queued',               // Initial state
  GENERATING_TTS = 'generating_tts', // TTS audio generation
  TRANSCRIBING = 'transcribing',    // Whisper transcription
  SEARCHING_VIDEO = 'searching_video', // Video source search
  GENERATING_VIDEO = 'generating_video', // Video generation (VEO/Pexels/etc)
  PROCESSING_VIDEO = 'processing_video', // FFmpeg processing
  COMPLETED = 'completed',          // Video ready
  FAILED = 'failed'                 // Error occurred
}
```

### YouTube Upload States
```typescript
enum YouTubeUploadState {
  PENDING = 'pending',              // Not started
  AUTHENTICATING = 'authenticating', // OAuth verification
  UPLOADING = 'uploading',          // Upload in progress
  UPLOADED = 'uploaded',            // Upload successful
  FAILED = 'failed'                 // Upload failed
}
```

## Data Structures

### Workflow Log Entry
```typescript
interface WorkflowLogEntry {
  videoId: string;
  timestamp: string;              // ISO 8601
  state: VideoWorkflowState;
  previousState?: VideoWorkflowState;
  duration?: number;              // milliseconds
  metadata?: {
    progress?: number;            // 0-100
    details?: string;
    error?: {
      message: string;
      stack?: string;
      code?: string;
    };
  };
}
```

### Workflow Status
```typescript
interface WorkflowStatus {
  videoId: string;
  currentState: VideoWorkflowState;
  progress: number;               // 0-100
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  estimatedTimeRemaining?: number; // seconds
  logs: WorkflowLogEntry[];
  stages: {
    [key in VideoWorkflowState]?: {
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      startedAt?: string;
      completedAt?: string;
      duration?: number;          // milliseconds
      error?: string;
    };
  };
}
```

### YouTube Upload Status
```typescript
interface YouTubeUploadStatus {
  videoId: string;
  channelName: string;
  state: YouTubeUploadState;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  startedAt: string;
  completedAt?: string;
  error?: {
    message: string;
    code?: string;
    retryable: boolean;
  };
}
```

### Webhook Event
```typescript
interface WebhookEvent {
  eventId: string;                // Unique event ID
  eventType: 'video.completed' | 'video.failed' | 'youtube.uploaded' | 'youtube.failed';
  timestamp: string;
  data: {
    videoId: string;
    channelName?: string;
    youtubeVideoId?: string;
    youtubeUrl?: string;
    error?: {
      message: string;
      code?: string;
    };
  };
}
```

## API Endpoints

### 1. Get Workflow Status
```http
GET /api/workflow/status/:videoId

Response 200:
{
  "success": true,
  "data": WorkflowStatus
}
```

### 2. Get All Active Workflows
```http
GET /api/workflow/active

Response 200:
{
  "success": true,
  "data": {
    "workflows": WorkflowStatus[],
    "count": number
  }
}
```

### 3. Get Workflow History
```http
GET /api/workflow/history?limit=50&offset=0&status=completed

Response 200:
{
  "success": true,
  "data": {
    "workflows": WorkflowStatus[],
    "total": number,
    "limit": number,
    "offset": number
  }
}
```

### 4. Get YouTube Upload Status
```http
GET /api/workflow/youtube/:videoId/:channelName

Response 200:
{
  "success": true,
  "data": YouTubeUploadStatus
}
```

### 5. Register Webhook
```http
POST /api/webhooks/register

Request:
{
  "url": "https://your-server.com/webhook",
  "events": ["video.completed", "youtube.uploaded"],
  "secret": "your-webhook-secret"
}

Response 201:
{
  "success": true,
  "webhookId": "wh_abc123",
  "url": "https://your-server.com/webhook",
  "events": ["video.completed", "youtube.uploaded"]
}
```

### 6. List Webhooks
```http
GET /api/webhooks

Response 200:
{
  "success": true,
  "data": {
    "webhooks": [
      {
        "webhookId": "wh_abc123",
        "url": "https://your-server.com/webhook",
        "events": ["video.completed"],
        "createdAt": "2025-10-15T12:00:00.000Z",
        "active": true
      }
    ]
  }
}
```

### 7. Delete Webhook
```http
DELETE /api/webhooks/:webhookId

Response 200:
{
  "success": true,
  "message": "Webhook deleted successfully"
}
```

## Logging Strategy

### Log Levels
- **debug** - Detailed information for debugging
- **info** - General informational messages
- **warn** - Warning messages (non-critical issues)
- **error** - Error messages (operation failed)
- **fatal** - Critical errors (system failure)

### Structured Log Format
```json
{
  "level": "info",
  "time": "2025-10-15T12:00:00.000Z",
  "videoId": "cmgrzq18g0000uudla9n6anfv",
  "state": "generating_tts",
  "duration": 2400,
  "msg": "TTS generation completed",
  "metadata": {
    "provider": "google",
    "language": "ko-KR",
    "audioLength": 2.4
  }
}
```

### Key Logging Points
1. **Video Creation Start**
   - Input parameters
   - Selected video source
   - TTS provider

2. **Each State Transition**
   - Previous state → New state
   - Duration in previous state
   - Progress percentage

3. **Critical Operations**
   - API calls (with response time)
   - File operations (read/write/delete)
   - External service calls

4. **Errors and Warnings**
   - Full error stack
   - Context (what was being done)
   - Retry attempts

5. **Video Completion**
   - Total duration
   - File size
   - Final video path

6. **YouTube Upload**
   - Channel name
   - Upload start/complete times
   - YouTube video ID
   - Upload size/duration

## Notification System

### Webhook Delivery
```typescript
// Webhook payload
POST https://your-server.com/webhook
Content-Type: application/json
X-Webhook-Signature: sha256=<signature>
X-Webhook-Event: video.completed

{
  "eventId": "evt_abc123",
  "eventType": "video.completed",
  "timestamp": "2025-10-15T12:00:00.000Z",
  "data": {
    "videoId": "cmgrzq18g0000uudla9n6anfv",
    "videoPath": "/path/to/video.mp4",
    "duration": 15000,
    "metadata": {
      "title": "Video Title",
      "description": "Video Description"
    }
  }
}
```

### Webhook Signature Verification
```typescript
const crypto = require('crypto');

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### Retry Strategy
- **Attempt 1**: Immediate
- **Attempt 2**: After 1 minute
- **Attempt 3**: After 5 minutes
- **Attempt 4**: After 15 minutes
- **Attempt 5**: After 1 hour
- **Max Attempts**: 5

Failed webhooks are logged and can be manually retried via API.

## Implementation Components

### 1. WorkflowManager Service
```typescript
class WorkflowManager {
  // Track workflow status in memory and persist to disk
  createWorkflow(videoId: string): WorkflowStatus
  updateWorkflowState(videoId: string, state: VideoWorkflowState, metadata?: any): void
  getWorkflowStatus(videoId: string): WorkflowStatus | null
  getAllActiveWorkflows(): WorkflowStatus[]
  getWorkflowHistory(filters: any): WorkflowStatus[]
}
```

### 2. WebhookManager Service
```typescript
class WebhookManager {
  registerWebhook(url: string, events: string[], secret: string): WebhookRegistration
  listWebhooks(): WebhookRegistration[]
  deleteWebhook(webhookId: string): void
  triggerWebhook(event: WebhookEvent): Promise<void>
  retryFailedWebhooks(): Promise<void>
}
```

### 3. Enhanced Logger
```typescript
class WorkflowLogger {
  logStateTransition(videoId: string, from: VideoWorkflowState, to: VideoWorkflowState): void
  logError(videoId: string, error: Error, context: any): void
  logProgress(videoId: string, progress: number, message: string): void
  logYouTubeUpload(videoId: string, channelName: string, status: YouTubeUploadState): void
}
```

## Storage

### Workflow Status Storage
- **Active workflows**: In-memory (Redis optional)
- **Completed workflows**: SQLite/JSON files (last 1000)
- **Log files**: Rotating logs (7 days retention)

### File Structure
```
~/.ai-agents-az-video-generator/
├── workflows/
│   ├── active/
│   │   └── {videoId}.json
│   └── history/
│       └── {videoId}.json
├── webhooks/
│   ├── registrations.json
│   └── failed/
│       └── {eventId}.json
└── logs/
    └── workflow-{date}.log
```

## Usage Examples

### Example 1: Monitor Video Generation
```bash
# Start video generation
curl -X POST http://localhost:3124/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Beautiful sunset", "videoSource": "pexels"}'

# Get status
curl http://localhost:3124/api/workflow/status/cmgrzq18g0000uudla9n6anfv

# Response
{
  "success": true,
  "data": {
    "videoId": "cmgrzq18g0000uudla9n6anfv",
    "currentState": "processing_video",
    "progress": 75,
    "startedAt": "2025-10-15T12:00:00.000Z",
    "updatedAt": "2025-10-15T12:02:30.000Z",
    "estimatedTimeRemaining": 45,
    "stages": {
      "generating_tts": { "status": "completed", "duration": 2400 },
      "transcribing": { "status": "completed", "duration": 1200 },
      "searching_video": { "status": "completed", "duration": 3500 },
      "processing_video": { "status": "in_progress", "startedAt": "2025-10-15T12:02:15.000Z" }
    }
  }
}
```

### Example 2: Register Webhook for Success Notifications
```bash
# Register webhook
curl -X POST http://localhost:3124/api/webhooks/register \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://myserver.com/video-complete",
    "events": ["video.completed", "youtube.uploaded"],
    "secret": "my-secret-key"
  }'

# Your server receives webhook when video completes
POST https://myserver.com/video-complete
Content-Type: application/json
X-Webhook-Signature: sha256=abc123...
X-Webhook-Event: video.completed

{
  "eventId": "evt_123",
  "eventType": "video.completed",
  "timestamp": "2025-10-15T12:05:00.000Z",
  "data": {
    "videoId": "cmgrzq18g0000uudla9n6anfv",
    "videoPath": "/videos/cmgrzq18g0000uudla9n6anfv.mp4"
  }
}
```

### Example 3: Check YouTube Upload Status
```bash
curl http://localhost:3124/api/workflow/youtube/cmgrzq18g0000uudla9n6anfv/main_channel

# Response
{
  "success": true,
  "data": {
    "videoId": "cmgrzq18g0000uudla9n6anfv",
    "channelName": "main_channel",
    "state": "uploaded",
    "youtubeVideoId": "3Ig6_As4uBg",
    "youtubeUrl": "https://www.youtube.com/watch?v=3Ig6_As4uBg",
    "startedAt": "2025-10-15T12:52:42.000Z",
    "completedAt": "2025-10-15T12:52:45.000Z"
  }
}
```

## Benefits

1. **Real-Time Visibility** - Always know what's happening in the pipeline
2. **Easy Debugging** - Structured logs make it easy to find issues
3. **Async Integration** - Webhooks allow external systems to react to events
4. **Historical Analysis** - Track success rates and performance over time
5. **Error Recovery** - Retry mechanism for transient failures
6. **Progress Tracking** - Show users exactly where their video is in the pipeline

## Next Implementation Steps

1. Create `WorkflowManager` service
2. Create `WebhookManager` service
3. Add workflow tracking to `ShortCreatorRefactored`
4. Create workflow API routes
5. Create webhook API routes
6. Add structured logging throughout pipeline
7. Implement webhook delivery with retry logic
8. Add workflow status persistence
9. Create webhook signature verification
10. Test end-to-end with sample workflows

## Security Considerations

1. **Webhook Signatures** - Verify all webhook payloads
2. **Rate Limiting** - Prevent webhook spam
3. **HTTPS Only** - All webhook URLs must use HTTPS
4. **Secret Rotation** - Allow updating webhook secrets
5. **Access Control** - Authenticate API requests for sensitive endpoints
