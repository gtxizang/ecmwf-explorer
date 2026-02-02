# Deploying the Remote MCP Server

Instructions for Imre to deploy the MCP server on ecmwf.regexflow.com.

## 1. Install Dependencies

```bash
# On the server
cd /path/to/mcp_server
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn mcp httpx numpy blosc
```

## 2. Test Locally

```bash
source venv/bin/activate
python ecv_mcp_server_remote.py
# Should start on port 8001
# Test: curl http://localhost:8001/health
```

## 3. Create Systemd Service

Create `/etc/systemd/system/ecv-mcp.service`:

```ini
[Unit]
Description=ECV Explorer MCP Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/mcp_server
Environment="ECV_DATA_URL=https://ecmwf.regexflow.com/zarr"
ExecStart=/path/to/mcp_server/venv/bin/uvicorn ecv_mcp_server_remote:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ecv-mcp
sudo systemctl start ecv-mcp
sudo systemctl status ecv-mcp
```

## 4. Add Nginx Proxy

Add to the nginx config for ecmwf.regexflow.com:

```nginx
# MCP Server endpoint
location /mcp {
    proxy_pass http://127.0.0.1:8001/mcp;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE/streaming support
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400;
}

# Health check
location /mcp/health {
    proxy_pass http://127.0.0.1:8001/health;
}
```

Reload nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Verify Deployment

```bash
# Health check
curl https://ecmwf.regexflow.com/mcp/health

# Should return: {"status":"healthy","server":"ecv-explorer-mcp"}
```

## 6. Evaluator Setup

Evaluators connect via Claude Desktop:

1. Open Claude Desktop
2. Go to **Settings → Connectors**
3. Click **"Add custom connector"**
4. Enter URL: `https://ecmwf.regexflow.com/mcp`
5. No authentication required

They can then ask Claude questions like:
- "What climate datasets are available?"
- "What was the soil moisture in central Ireland in 2023?"
