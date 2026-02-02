#!/usr/bin/env python3
"""
ECMWF ECV Explorer - Main Application Entry Point

Interactive visualization of Essential Climate Variables from the
Copernicus Climate Data Store.

Run with:
    python app/main.py

Or with gunicorn for production:
    gunicorn app.main:server -b 0.0.0.0:8002
"""

import os
import sys
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from dash import Dash
import dash_bootstrap_components as dbc

# Use pydeck GlobeView per specification
from app.layout_globe import create_layout
from app.callbacks_globe import register_callbacks

# Legacy server-side rendering (kept for reference)
# from app.layout import create_layout
# from app.callbacks import register_callbacks
# from app.tile_server import register_tile_routes
# from app.image_renderer import register_image_routes
# from app.simple_image import register_simple_routes


def create_app() -> Dash:
    """Create and configure the Dash application."""
    # Assets folder is in project root, not in app/
    assets_path = project_root / "assets"

    app = Dash(
        __name__,
        assets_folder=str(assets_path),
        external_stylesheets=[
            dbc.themes.BOOTSTRAP,
            dbc.icons.FONT_AWESOME,
        ],
        title="ECMWF ECV Explorer",
        update_title="Loading...",
        suppress_callback_exceptions=True,
        meta_tags=[
            {"name": "viewport", "content": "width=device-width, initial-scale=1"},
            {"name": "description", "content": "Interactive visualization of Essential Climate Variables"},
        ],
    )

    # Set layout
    app.layout = create_layout()

    # Register callbacks
    register_callbacks(app)

    # Note: Server-side image routes disabled - using pydeck WebGL rendering
    # register_tile_routes(app)
    # register_image_routes(app)
    # register_simple_routes(app)

    return app


# Create app instance
app = create_app()

# Expose server for gunicorn
server = app.server


if __name__ == "__main__":
    # Get port from environment or default to 8002
    port = int(os.environ.get("PORT", 8002))
    debug = os.environ.get("DEBUG", "true").lower() == "true"

    print("=" * 60)
    print("ECMWF ECV Explorer")
    print("=" * 60)
    print(f"Starting server on http://localhost:{port}")
    print("Press Ctrl+C to stop")
    print("=" * 60)

    app.run(
        host="0.0.0.0",
        port=port,
        debug=debug,
    )
