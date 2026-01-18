#!/bin/bash
# YouTube Token Update Script
# Usage: ./youtube-token-update.sh <channel_name> <oauth_code>
# Example: ./youtube-token-update.sh clickaround "4/0Axxxx..."

set -e

# Constants
PROJECT_ID="dkdk-474008"
SECRET_NAME="YOUTUBE_DATA"
BASE_URL="https://short-video-maker-7qtnitbuvq-uc.a.run.app"
WORK_DIR="/tmp/youtube-update-$(date +%s)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_health() {
    log_info "Checking YouTube token health..."
    curl -s "$BASE_URL/api/youtube/auth/health-check" | python3 -m json.tool 2>/dev/null || \
    curl -s "$BASE_URL/api/youtube/auth/health-check"
}

get_auth_url() {
    local channel=$1
    echo ""
    log_info "Open this URL in browser to authenticate '$channel':"
    echo "$BASE_URL/api/youtube/auth/url?state=$channel"
    echo ""
    log_warn "After authentication, copy the 'code=' value from the redirect URL"
}

exchange_code() {
    local channel=$1
    local code=$2

    log_info "Exchanging code for tokens..."
    response=$(curl -s -X POST "$BASE_URL/api/youtube/auth/exchange" \
        -H "Content-Type: application/json" \
        -d "{\"code\":\"$code\", \"state\":\"$channel\"}")

    echo "$response"

    # Extract tokens
    if echo "$response" | grep -q '"success":true'; then
        log_info "Token exchange successful!"
        return 0
    else
        log_error "Token exchange failed!"
        return 1
    fi
}

download_secret() {
    log_info "Downloading current secret..."
    mkdir -p "$WORK_DIR"
    cd "$WORK_DIR"

    gcloud secrets versions access latest --secret="$SECRET_NAME" --project="$PROJECT_ID" > current.b64
    base64 --ignore-garbage -d < current.b64 | tar xzf -

    log_info "Files extracted:"
    ls -la youtube-*.json
}

update_token_file() {
    local channel=$1
    local access_token=$2
    local refresh_token=$3
    local expiry_date=$4

    log_info "Updating token file for '$channel'..."

    cat > "$WORK_DIR/youtube-tokens-$channel.json" << EOF
{
  "access_token": "$access_token",
  "scope": "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/yt-analytics.readonly",
  "token_type": "Bearer",
  "refresh_token_expires_in": 604799,
  "expiry_date": $expiry_date,
  "refresh_token": "$refresh_token"
}
EOF

    log_info "Token file updated. Verifying..."
    cat "$WORK_DIR/youtube-tokens-$channel.json" | grep refresh_token
}

upload_secret() {
    log_info "Creating tar.gz archive..."
    cd "$WORK_DIR"
    tar czvf youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json

    log_info "Encoding to base64..."
    base64 -w 0 youtube-data.tar.gz > youtube-data.b64

    log_info "Uploading to Secret Manager..."
    gcloud secrets versions add "$SECRET_NAME" --data-file=youtube-data.b64 --project="$PROJECT_ID"
}

verify_secret() {
    local channel=$1
    log_info "Verifying uploaded secret..."

    mkdir -p "$WORK_DIR/verify"
    cd "$WORK_DIR/verify"

    gcloud secrets versions access latest --secret="$SECRET_NAME" --project="$PROJECT_ID" | \
        base64 --ignore-garbage -d | tar xzf -

    log_info "Checking token for '$channel':"
    cat "youtube-tokens-$channel.json" | grep refresh_token
}

deploy() {
    log_info "Deploying new Cloud Run revision..."
    cd "D:/Data/00_Personal/YTB/short-video-maker"
    gcloud builds submit --config=cloudbuild.yaml --project="$PROJECT_ID"
}

# Main script
case "${1:-help}" in
    health)
        check_health
        ;;
    url)
        if [ -z "$2" ]; then
            echo "Usage: $0 url <channel_name>"
            exit 1
        fi
        get_auth_url "$2"
        ;;
    exchange)
        if [ -z "$2" ] || [ -z "$3" ]; then
            echo "Usage: $0 exchange <channel_name> <code>"
            exit 1
        fi
        exchange_code "$2" "$3"
        ;;
    download)
        download_secret
        ;;
    update)
        if [ -z "$2" ] || [ -z "$3" ] || [ -z "$4" ]; then
            echo "Usage: $0 update <channel_name> <access_token> <refresh_token> [expiry_date]"
            exit 1
        fi
        update_token_file "$2" "$3" "$4" "${5:-$(date -d '+1 hour' +%s)000}"
        ;;
    upload)
        upload_secret
        ;;
    verify)
        if [ -z "$2" ]; then
            echo "Usage: $0 verify <channel_name>"
            exit 1
        fi
        verify_secret "$2"
        ;;
    deploy)
        deploy
        ;;
    full)
        # Full update process
        if [ -z "$2" ] || [ -z "$3" ]; then
            echo "Usage: $0 full <channel_name> <code>"
            exit 1
        fi
        channel="$2"
        code="$3"

        log_info "=== Starting full token update for '$channel' ==="

        # Exchange code
        response=$(exchange_code "$channel" "$code")

        # Parse tokens from response
        access_token=$(echo "$response" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
        refresh_token=$(echo "$response" | grep -o '"refresh_token":"[^"]*"' | cut -d'"' -f4)
        expiry_date=$(echo "$response" | grep -o '"expiry_date":[0-9]*' | cut -d':' -f2)

        if [ -z "$refresh_token" ]; then
            log_error "Failed to extract tokens from response"
            exit 1
        fi

        # Download, update, upload
        download_secret
        update_token_file "$channel" "$access_token" "$refresh_token" "$expiry_date"
        upload_secret
        verify_secret "$channel"

        log_info "=== Token update complete! ==="
        log_info "Run '$0 deploy' to deploy the changes"
        ;;
    help|*)
        echo "YouTube Token Update Script"
        echo ""
        echo "Commands:"
        echo "  health              - Check current token status"
        echo "  url <channel>       - Get OAuth URL for channel"
        echo "  exchange <ch> <code>- Exchange OAuth code for tokens"
        echo "  download            - Download current secret"
        echo "  update <ch> <at> <rt> [exp] - Update token file"
        echo "  upload              - Upload secret to Secret Manager"
        echo "  verify <channel>    - Verify uploaded secret"
        echo "  deploy              - Deploy new Cloud Run revision"
        echo "  full <ch> <code>    - Full update process (exchange + upload)"
        echo ""
        echo "Examples:"
        echo "  $0 health"
        echo "  $0 url clickaround"
        echo "  $0 full clickaround '4/0Axxxx...'"
        ;;
esac
