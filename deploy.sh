#!/bin/bash
#
# ECV Explorer Deployment Script
#
# Usage:
#   ./deploy.sh [API_URL]
#
# Examples:
#   ./deploy.sh  # Uses default localhost:8000
#   ./deploy.sh https://regexflowdownload.blob.core.windows.net/garfield/ecvexplorer
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "ECV Explorer Deployment"
echo "========================================"

# Get API URL from argument or use default
API_URL="${1:-http://localhost:8000}"
echo -e "${YELLOW}API URL:${NC} $API_URL"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js not found. Please install Node.js 18+${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js 18+ required (found v$NODE_VERSION)${NC}"
    exit 1
fi
echo -e "${GREEN}Node.js:${NC} $(node -v)"

# Navigate to frontend
cd "$(dirname "$0")/frontend"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm ci --silent

# Build with API URL
echo ""
echo "Building frontend..."
VITE_API_URL="$API_URL" npm run build

# Check build output
if [ ! -d "dist" ]; then
    echo -e "${RED}Error: Build failed - dist/ not created${NC}"
    exit 1
fi

DIST_SIZE=$(du -sh dist | cut -f1)
echo -e "${GREEN}Build complete:${NC} dist/ ($DIST_SIZE)"

# List output
echo ""
echo "Build output:"
ls -la dist/

echo ""
echo "========================================"
echo -e "${GREEN}Deployment Ready${NC}"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Upload dist/* to your web server"
echo "  2. Ensure Zarr data is accessible at: $API_URL/zarr/"
echo "  3. Enable CORS if serving from different domain"
echo ""
echo "Test locally:"
echo "  cd frontend && npx serve dist"
echo ""
