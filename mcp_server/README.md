# ECV Explorer MCP Server

An MCP (Model Context Protocol) server that provides AI assistants with direct access to ECMWF climate data from the ECV Explorer application.

## What This Enables

With this MCP server, you can ask Claude questions like:

- "What climate datasets are available in the ECV Explorer?"
- "What was the soil moisture in Dublin in July 2023?"
- "Show me the sea ice concentration trend at 80°N, 0°E for 2020"
- "Compare fire burned area between summer and winter 2022 in Portugal"

Claude will query the actual live data from the ECV Explorer and provide real answers.

## Quick Start

### 1. Install Dependencies

```bash
cd mcp_server
pip install -r requirements.txt
```

### 2. Configure Claude Desktop

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ecv-explorer": {
      "command": "python",
      "args": ["/path/to/ECMWF-POC/mcp_server/ecv_mcp_server.py"],
      "env": {
        "ECV_DATA_URL": "https://ecmwf.regexflow.com/zarr"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

Close and reopen Claude Desktop. You should see "ecv-explorer" in the MCP tools list.

## Available Tools

### `list_datasets`
Lists all available climate datasets with metadata.

**Example prompt**: "What datasets are available?"

**Response**:
```json
[
  {
    "id": "soil_moisture",
    "name": "Soil Moisture ERA5 (75 Years)",
    "description": "ERA5-Land Reanalysis — Volumetric Soil Water Layer 1 — 1950-2024",
    "years": "1950-2024",
    "unit": "m³/m³",
    "source": "ECMWF"
  },
  ...
]
```

### `get_dataset_info`
Get detailed metadata for a specific dataset.

**Example prompt**: "Tell me about the sea ice dataset"

**Response**: Full metadata including resolution, projection, source, and temporal coverage.

### `get_timeseries`
Extract 12 months of data at a geographic location.

**Example prompt**: "What was the soil moisture pattern in Ireland in 2023?"

**Parameters**:
- `dataset`: Dataset identifier
- `longitude`: -180 to 180
- `latitude`: -90 to 90
- `year`: Year within dataset's range

**Response**:
```json
{
  "dataset": "Soil Moisture ERA5 (75 Years)",
  "location": {"longitude": -6.26, "latitude": 53.35},
  "year": 2023,
  "unit": "m³/m³",
  "timeseries": [
    {"month": "Jan", "value": 0.42},
    {"month": "Feb", "value": 0.45},
    ...
  ]
}
```

### `get_value`
Get a single value at a specific location and time.

**Example prompt**: "What was the sea ice concentration at the North Pole in September 2023?"

**Parameters**:
- `dataset`: Dataset identifier
- `longitude`, `latitude`: Location
- `year`, `month`: Time (month is 1-12)

## Datasets Available

| Dataset | Years | Variable | Coverage |
|---------|-------|----------|----------|
| `soil_moisture` | 1950-2024 | Volumetric water content | Global land |
| `solar_radiation_era5` | 1950-2024 | Surface downward radiation | Global |
| `fire_burned_area` | 2019-2023 | Burned area | Global land |
| `sea_ice` | 1988-2023 | Ice concentration | Arctic |
| `solar_radiation_satellite` | 2001-2024 | TOA incoming shortwave | Global |

## Demo Walkthrough for Evaluators

1. **Open Claude Desktop** with the MCP configured

2. **Ask about available data**:
   > "What climate datasets are available in the ECV Explorer?"

3. **Query specific data**:
   > "What was the soil moisture in Dublin (53.35°N, 6.26°W) throughout 2023?"

4. **Compare across time**:
   > "How does the September sea ice at 85°N, 0°E compare between 1990 and 2020?"

5. **Explore fire data**:
   > "Show me the monthly fire burned area pattern in Portugal (39.4°N, 8.2°W) for 2022"

## Architecture

```
┌─────────────────┐     MCP Protocol      ┌──────────────────┐
│  Claude Desktop │ ◄──────────────────► │  ECV MCP Server  │
└─────────────────┘                       └────────┬─────────┘
                                                   │ HTTP
                                                   ▼
                                          ┌──────────────────┐
                                          │  Zarr Data Store │
                                          │ ecmwf.regexflow  │
                                          └──────────────────┘
```

The MCP server:
1. Receives tool calls from Claude Desktop
2. Converts geographic coordinates to the dataset's projection
3. Fetches Zarr chunks via HTTP
4. Returns structured data that Claude interprets

## Relevance to WP6 (AI Features)

This demonstrates:

- **Conversational data access**: Natural language queries against climate data
- **Live data integration**: Real-time access to the same data powering the web app
- **Intelligent assistance**: Claude can explain what the data means, not just return values

Potential extensions:
- Add visualization generation (matplotlib charts)
- Include anomaly detection tools
- Provide trend analysis capabilities
- Integrate ECV documentation for contextual explanations

## Troubleshooting

**"Could not connect to MCP server"**
- Check the path in `claude_desktop_config.json` is absolute and correct
- Ensure Python can find the `mcp` package

**"Error loading coordinate arrays"**
- The data URL may have changed; check `ECV_DATA_URL` environment variable
- Verify the data is accessible: `curl https://ecmwf.regexflow.com/zarr/soil_moisture_multiyear/0/.zattrs`

**Timeouts**
- First queries may be slow due to data loading
- Subsequent queries use cached connections
