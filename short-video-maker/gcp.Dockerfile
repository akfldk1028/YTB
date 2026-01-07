# ============================================================================
# GCP Cloud Run Optimized Dockerfile
# ============================================================================
# This Dockerfile is optimized for deploying to Google Cloud Platform
# Includes: Whisper, FFmpeg, Remotion, Nano Banana (Gemini Image Generation)
# New Feature: Consistent Shorts API with character consistency
# ============================================================================

# Stage 1: Build Whisper.cpp for speech-to-text
FROM ubuntu:22.04 AS install-whisper
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update && apt install -y \
    git \
    build-essential \
    wget \
    cmake \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /whisper
RUN git clone https://github.com/ggml-org/whisper.cpp.git . && \
    git checkout v1.7.1 && \
    make

WORKDIR /whisper/models
RUN sh ./download-ggml-model.sh base.en

# Stage 2: Base image with system dependencies
FROM node:22-bookworm-slim AS base
ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Install all required system dependencies
RUN apt update && apt install -y \
      # Whisper dependencies
      git \
      wget \
      cmake \
      make \
      libsdl2-dev \
      # FFmpeg for video processing
      ffmpeg \
      curl \
      # Remotion/Chrome dependencies for video rendering
      libnss3 \
      libdbus-1-3 \
      libatk1.0-0 \
      libgbm-dev \
      libasound2 \
      libxrandr2 \
      libxkbcommon-dev \
      libxfixes3 \
      libxcomposite1 \
      libxdamage1 \
      libatk-bridge2.0-0 \
      libpango-1.0-0 \
      libcairo2 \
      libcups2 \
      # Additional fonts for better text rendering
      fonts-liberation \
      fonts-noto-color-emoji \
      # Korean font for captions (NanumGothic)
      fonts-nanum \
      # fontconfig for font cache
      fontconfig \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    # Update font cache for Korean fonts to work in FFmpeg
    && fc-cache -fv

# Install yt-dlp for YouTube downloading (PoliticsProject)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# ============================================================================
# PO Token Provider Setup (YouTube Bot Detection Bypass)
# ============================================================================
# bgutil-ytdlp-pot-provider: Generates proof-of-origin tokens for YouTube
# This allows yt-dlp to bypass YouTube's bot detection on datacenter IPs
# ============================================================================

# Install Python and pip for yt-dlp plugin
RUN apt update && apt install -y python3 python3-pip unzip && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Deno (JavaScript runtime required by yt-dlp for PO Token)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Install bgutil-ytdlp-pot-provider plugin for yt-dlp
RUN pip3 install --break-system-packages bgutil-ytdlp-pot-provider

# Clone and build the POT provider HTTP server
WORKDIR /pot-provider
RUN git clone --single-branch --branch 1.2.2 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git . && \
    cd server && npm install && npx tsc

WORKDIR /app

# Setup pnpm package manager
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Stage 3: Install production dependencies
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml* /app/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Stage 4: Build application
FROM base AS build
COPY package.json pnpm-lock.yaml* /app/
COPY tsconfig.json tsconfig.build.json vite.config.ts /app/
COPY src /app/src

# Install all dependencies and build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm build

# Stage 5: Final production image
FROM base

# Copy static assets
COPY static /app/static

# Copy Whisper binary and models
COPY --from=install-whisper /whisper /app/data/libs/whisper

# Copy production dependencies
COPY --from=prod-deps /app/node_modules /app/node_modules

# Copy built application
COPY --from=build /app/dist /app/dist

# Copy package.json for runtime
COPY package.json /app/

# ============================================================================
# Environment Variables - GCP Cloud Run Configuration
# ============================================================================

# Data directory configuration
ENV DATA_DIR_PATH=/app/data
ENV DOCKER=true

# Whisper configuration
ENV WHISPER_MODEL=base.en

# Performance configuration for GCP Cloud Run
# Adjust CONCURRENCY based on your Cloud Run instance size
# 1 = safe for 1-2GB RAM instances
# 2 = for 4GB+ RAM instances
ENV CONCURRENCY=1

# Video cache size - 2GB (adjust based on Cloud Run instance size)
ENV VIDEO_CACHE_SIZE_IN_BYTES=2097152000

# Port will be provided by Cloud Run (typically 8080)
# But we default to 3123 for local testing
ENV PORT=3123

# Logging configuration
ENV LOG_LEVEL=info

# ============================================================================
# API Keys and Service Configuration
# ============================================================================
# These should be set via Cloud Run environment variables or Secret Manager:
#
# Required:
# - PEXELS_API_KEY: For video stock footage
# - GOOGLE_GEMINI_API_KEY: For Nano Banana image generation & VEO3 video
#
# Optional:
# - GOOGLE_TTS_PROJECT_ID: Google Cloud Text-to-Speech
# - GOOGLE_TTS_API_KEY: Path to service account key
# - ELEVENLABS_API_KEY: ElevenLabs TTS
# - LEONARDO_API_KEY: Leonardo AI
# - YOUTUBE_CLIENT_SECRET_PATH: YouTube upload
# - GCS_BUCKET_NAME: Google Cloud Storage for video persistence
# - GCS_SERVICE_ACCOUNT_PATH: GCS service account key
#
# TTS Provider (kokoro/google/elevenlabs):
# - TTS_PROVIDER=kokoro
#
# Video Source (pexels/veo/leonardo/ffmpeg/both):
# - VIDEO_SOURCE=pexels
#
# VEO3 Audio Mode:
# - VEO3_USE_NATIVE_AUDIO=false
#
# VEO Model Selection:
# - VEO_MODEL=veo-3.0-fast-generate-001
# ============================================================================

# Install Kokoro TTS models, headless Chrome, and ensure music files exist
RUN node dist/scripts/install.js

# Health check for Cloud Run
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3123}/health || exit 1

# Expose port (Cloud Run will override with PORT env var)
EXPOSE 3123

# Create startup script that runs POT provider in background + main app
RUN echo '#!/bin/bash\n\
# Start POT provider server in background (port 4416)\n\
cd /pot-provider/server && node build/main.js --port 4416 &\n\
sleep 3\n\
echo "POT provider started on port 4416"\n\
# Verify POT provider is running\n\
curl -s http://127.0.0.1:4416/health || echo "POT provider health check failed"\n\
# Start main application\n\
cd /app && pnpm start\n\
' > /app/start.sh && chmod +x /app/start.sh

# Start both services
CMD ["/app/start.sh"]

# ============================================================================
# Build Instructions:
# ============================================================================
# Local build:
#   docker build -f gcp.Dockerfile -t short-video-maker:gcp .
#
# Build for GCP Artifact Registry:
#   docker build -f gcp.Dockerfile -t gcr.io/YOUR_PROJECT_ID/short-video-maker:latest .
#   docker push gcr.io/YOUR_PROJECT_ID/short-video-maker:latest
#
# Or use gcloud builds:
#   gcloud builds submit --config cloudbuild.yaml
# ============================================================================
