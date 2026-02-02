# ECV Explorer - Azure Deployment Guide

## Overview

The ECV Explorer is a React frontend that loads climate data (Zarr pyramids) directly in the browser.

**Components:**
1. **Static Frontend** - React app built with Vite (~5MB built)
2. **Zarr Data** - Pre-processed climate data pyramids (~36GB)

Both are static files - no server-side processing required.

---

## Quick Start (Docker)

```bash
# Build and run
docker-compose up -d

# Access at http://localhost:8080
```

---

## Option A: Azure Static Web Apps + Blob Storage (Recommended)

### Step 1: Deploy Zarr Data to Blob Storage

The data is already uploading to:
```
https://regexflowdownload.blob.core.windows.net/garfield/ecvexplorer/pyramids/
```

**Enable CORS on the Storage Account:**

Azure Portal → Storage Account → Resource sharing (CORS) → Blob service:

| Setting | Value |
|---------|-------|
| Allowed origins | `*` |
| Allowed methods | `GET, OPTIONS, HEAD` |
| Allowed headers | `*` |
| Exposed headers | `*` |
| Max age | `86400` |

Or via Azure CLI:
```bash
az storage cors add \
  --account-name regexflowdownload \
  --services b \
  --methods GET OPTIONS HEAD \
  --origins '*' \
  --allowed-headers '*' \
  --exposed-headers '*' \
  --max-age 86400
```

### Step 2: Build Frontend with Correct API URL

```bash
cd frontend

# Set the API URL to your blob storage
export VITE_API_URL=https://regexflowdownload.blob.core.windows.net/garfield/ecvexplorer

# Build
npm install
npm run build

# Output is in dist/
```

### Step 3: Deploy Frontend

**Option 3a: Azure Static Web Apps**
```bash
# Install SWA CLI
npm install -g @azure/static-web-apps-cli

# Deploy
swa deploy ./dist --env production
```

**Option 3b: Azure Blob Static Website**
1. Enable "Static website" on a storage account
2. Upload `dist/*` to `$web` container
3. Access via the static website URL

---

## Option B: Single Container (Simple)

### Dockerfile
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=/zarr
RUN npm run build

FROM python:3.11-slim
WORKDIR /app

# Copy frontend build
COPY --from=builder /app/dist /app/static

# Copy zarr data (or mount as volume)
# COPY data/pyramids /app/pyramids

# Simple server
COPY <<EOF /app/server.py
import http.server
import socketserver
import os

class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory='/app', **kwargs)

    def translate_path(self, path):
        if path.startswith('/zarr/'):
            return '/app/pyramids' + path[5:]
        return '/app/static' + path

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

PORT = int(os.environ.get('PORT', 8080))
with socketserver.TCPServer(('', PORT), CORSHandler) as httpd:
    print(f'Serving on port {PORT}')
    httpd.serve_forever()
EOF

EXPOSE 8080
CMD ["python", "server.py"]
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  ecv-explorer:
    build: .
    ports:
      - "8080:8080"
    volumes:
      # Mount pyramids from host (don't copy 36GB into image)
      - ./data/pyramids:/app/pyramids:ro
    environment:
      - PORT=8080
```

---

## Option C: Nginx + Static Files

### nginx.conf
```nginx
server {
    listen 80;
    server_name _;

    # Frontend
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # Zarr data with CORS
    location /zarr/ {
        alias /data/pyramids/;

        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' '*' always;

        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }
}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:8000` | Backend URL for Zarr data |
| `PORT` | `8080` | Server port (container) |

**Important:** `VITE_API_URL` must be set at BUILD time, not runtime.

---

## Data Structure

```
pyramids/
├── radiation_multiyear/     # 29GB - ERA5 Solar Radiation (75 years)
│   ├── 0/                   # LOD level 0 (coarsest)
│   ├── 1/
│   ├── 2/
│   └── 3/
├── soil_moisture_multiyear/ # 6GB - ERA5 Soil Moisture (75 years)
├── satellite_radiation/     # 125MB - NASA CERES (24 years)
├── sea_ice_polar_multiyear/ # 1GB - Sea Ice (36 years)
└── fire_multiyear/          # 19MB - Fire Burned Area (5 years)
```

Each LOD level contains:
- `solar_radiation/` (or variable name) - data chunks
- `x/`, `y/` - coordinate arrays
- `year/`, `month/` - time arrays
- `.zarray`, `.zattrs`, `.zgroup` - Zarr metadata

---

## Verification

After deployment, verify these URLs return JSON:

```bash
# Should return Zarr metadata
curl https://YOUR_URL/zarr/radiation_multiyear/0/.zattrs

# Should return array metadata
curl https://YOUR_URL/zarr/radiation_multiyear/0/solar_radiation/.zarray
```

---

## Troubleshooting

### CORS Errors
- Check browser console for "Access-Control-Allow-Origin" errors
- Verify CORS is enabled on blob storage / nginx config
- Test with: `curl -I -X OPTIONS https://YOUR_URL/zarr/...`

### 404 on Zarr Files
- Verify the path mapping (`/zarr/` → pyramids directory)
- Check file permissions

### Data Not Rendering
- Open browser DevTools → Network tab
- Look for failed chunk requests (e.g., `0.0.0.0`)
- Verify chunks exist at the expected paths

---

## Performance Tips

1. **Azure CDN** - Put CDN in front of blob storage for faster global access
2. **Compression** - Zarr chunks are already compressed, disable gzip for `.zarray` files
3. **Caching** - Set long cache headers (data is immutable)

```nginx
location /zarr/ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

---

## Contact

Questions? Contact Garfield / RegexFlow
