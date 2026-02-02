"""
UI Layout for ECMWF ECV Explorer.
Faithful recreation of NEC Explorer interface using Leaflet.
"""

from dash import dcc, html
import dash_bootstrap_components as dbc
import dash_leaflet as dl

from .data_loader import DATASETS, COLORMAPS, data_loader

# Default dataset
DEFAULT_DATASET = "era5_land"
DEFAULT_VARIABLE = "2m_temperature"

# Europe bounds for initial view
EUROPE_CENTER = [51, 10]
EUROPE_ZOOM = 4


def create_layout() -> html.Div:
    """Create the complete application layout - NEC Explorer style with Leaflet."""
    _, _, time_strings = data_loader.get_time_range(DEFAULT_DATASET)
    max_time = len(time_strings) - 1 if time_strings else 0

    # Create time marks for slider - only show start year and end year
    time_marks = {}
    if time_strings:
        time_marks[0] = time_strings[0].split("-")[0]
        time_marks[len(time_strings) - 1] = time_strings[-1].split("-")[0]

    return html.Div(
        [
            # Stores
            dcc.Store(id="selected-coords", data={"lat": None, "lon": None}),
            dcc.Store(id="play-state", data={"playing": False}),
            dcc.Store(id="theme-store", data={"theme": "dark"}),
            dcc.Store(id="dataset-dropdown", data=DEFAULT_DATASET),
            dcc.Store(id="variable-dropdown", data=DEFAULT_VARIABLE),
            dcc.Store(id="colormap-dropdown", data="YlOrRd"),
            dcc.Store(id="dev-settings", data={"sigma": 0, "interp": 3}),

            # Main map container (full screen) - Leaflet
            html.Div(
                [
                    dl.Map(
                        id="leaflet-map",
                        children=[
                            # Dark basemap tiles (CARTO Dark Matter)
                            dl.TileLayer(
                                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
                                attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                                maxZoom=19,
                            ),
                            # Simple image overlay - Web Mercator projection bounds
                            dl.ImageOverlay(
                                id="data-image-overlay",
                                url=f"/simple/{DEFAULT_DATASET}/{DEFAULT_VARIABLE}/0/RdYlBu_r.png?sigma=0&interp=lanczos",
                                bounds=[[-85.051, -180], [85.051, 180]],
                                opacity=1.0,
                            ),
                            # Marker for clicked location
                            dl.LayerGroup(id="click-marker"),
                        ],
                        center=EUROPE_CENTER,
                        zoom=EUROPE_ZOOM,
                        style={
                            "width": "100%",
                            "height": "100vh",
                            "position": "absolute",
                            "top": 0,
                            "left": 0,
                            "zIndex": 1,
                        },
                    ),
                ],
                className="map-container",
            ),

            # Left control panel (floating)
            html.Div(
                [
                    # Header
                    html.Div(
                        [
                            html.I(className="fas fa-sliders-h panel-icon"),
                            html.Span("ECV Explorer", className="panel-title"),
                        ],
                        className="panel-header",
                    ),

                    # Dataset section
                    html.Div(
                        [
                            html.Div(
                                [
                                    html.I(className="fas fa-database section-icon"),
                                    html.Span("Dataset", className="section-title"),
                                ],
                                className="section-header",
                            ),
                            dcc.Dropdown(
                                id="dataset-selector",
                                options=[
                                    {"label": config["name"], "value": dataset_id}
                                    for dataset_id, config in DATASETS.items()
                                ],
                                value=DEFAULT_DATASET,
                                clearable=False,
                                className="dataset-dropdown",
                            ),
                        ],
                        className="control-section",
                    ),

                    # Climate variable section
                    html.Div(
                        [
                            html.Div(
                                [
                                    html.I(className="fas fa-info-circle section-icon"),
                                    html.Span("Climate variable", className="section-title"),
                                ],
                                className="section-header",
                            ),
                            html.Div(
                                id="variable-buttons-container",
                                className="var-toggle-group",
                            ),
                        ],
                        className="control-section",
                    ),

                    # Colormap section
                    html.Div(
                        [
                            html.Div(
                                [
                                    html.I(className="fas fa-info-circle section-icon"),
                                    html.Span("Color scale", className="section-title"),
                                ],
                                className="section-header",
                            ),
                            html.Div(
                                [
                                    html.Button("YlOrRd", id="cmap-btn-YlOrRd", className="cmap-btn active"),
                                    html.Button("RdYlBu", id="cmap-btn-RdYlBu_r", className="cmap-btn"),
                                    html.Button("Viridis", id="cmap-btn-Viridis", className="cmap-btn"),
                                ],
                                className="cmap-toggle-group",
                            ),
                        ],
                        className="control-section",
                    ),
                ],
                className="left-panel",
            ),

            # Left icon strip
            html.Div(
                [
                    html.Button(
                        html.I(className="fas fa-info"),
                        id="btn-info",
                        className="icon-strip-btn",
                        title="Information",
                    ),
                    html.Button(
                        html.I(className="fas fa-download"),
                        id="btn-export-csv",
                        className="icon-strip-btn",
                        title="Download data",
                    ),
                    html.Button(
                        html.I(className="fas fa-layer-group"),
                        id="btn-layers",
                        className="icon-strip-btn",
                        title="Layers",
                    ),
                ],
                className="left-icon-strip",
            ),
            dcc.Download(id="download-csv"),

            # Bottom time controls
            html.Div(
                [
                    # Year display badge
                    html.Div(
                        id="time-display",
                        className="year-badge",
                    ),
                    # Slider row
                    html.Div(
                        [
                            # Settings button
                            html.Button(
                                html.I(className="fas fa-sliders-h"),
                                id="btn-settings",
                                className="time-control-btn",
                            ),
                            # Time slider
                            html.Div(
                                dcc.Slider(
                                    id="time-slider",
                                    min=0,
                                    max=max_time,
                                    value=0,
                                    step=1,
                                    marks=time_marks,
                                    className="time-slider",
                                ),
                                className="slider-container",
                            ),
                            # Playback controls
                            html.Div(
                                [
                                    html.Button(
                                        html.I(className="fas fa-chevron-left"),
                                        id="btn-prev",
                                        className="time-control-btn",
                                    ),
                                    html.Button(
                                        html.I(className="fas fa-play", id="play-icon"),
                                        id="btn-play",
                                        className="time-control-btn play-btn",
                                    ),
                                    html.Button(
                                        html.I(className="fas fa-chevron-right"),
                                        id="btn-next",
                                        className="time-control-btn",
                                    ),
                                ],
                                className="playback-controls",
                            ),
                            # More options
                            html.Button(
                                html.I(className="fas fa-ellipsis-h"),
                                id="btn-more",
                                className="time-control-btn",
                            ),
                        ],
                        className="time-controls-row",
                    ),
                    dcc.Interval(
                        id="animation-interval",
                        interval=800,
                        n_intervals=0,
                        disabled=True,
                    ),
                ],
                className="bottom-time-panel",
            ),

            # Right color legend
            html.Div(
                [
                    html.Div(id="legend-max", className="legend-label"),
                    html.Div(id="color-bar", className="color-bar"),
                    html.Div(id="legend-min", className="legend-label"),
                    html.Div(id="legend-title", className="legend-title"),
                ],
                className="right-legend",
            ),

            # Dev Panel (collapsible)
            html.Div(
                [
                    html.Div(
                        [
                            html.I(className="fas fa-code"),
                            html.Span(" Dev Panel", style={"marginLeft": "8px"}),
                        ],
                        className="dev-panel-header",
                    ),
                    html.Div(
                        [
                            # Gaussian Sigma
                            html.Label("Gaussian Sigma", className="dev-label"),
                            dcc.Slider(
                                id="dev-sigma-slider",
                                min=0,
                                max=3,
                                step=0.5,
                                value=0,
                                marks={0: "0", 0.5: "0.5", 1: "1", 1.5: "1.5", 2: "2", 2.5: "2.5", 3: "3"},
                                className="dev-slider",
                            ),
                            # Interpolation Method
                            html.Label("Interpolation", className="dev-label", style={"marginTop": "15px"}),
                            html.Div(
                                [
                                    html.Button("Nearest", id="interp-btn-nearest", className="interp-btn"),
                                    html.Button("Bilinear", id="interp-btn-bilinear", className="interp-btn"),
                                    html.Button("Bicubic", id="interp-btn-bicubic", className="interp-btn"),
                                    html.Button("Lanczos", id="interp-btn-lanczos", className="interp-btn active"),
                                ],
                                className="interp-btn-group",
                            ),
                            dcc.Store(id="dev-interp-dropdown", data="lanczos"),
                            # Current settings display
                            html.Div(id="dev-settings-display", className="dev-settings-display"),
                            # Compare button
                            html.Button(
                                "Open Comparison Grid",
                                id="btn-open-comparison",
                                className="compare-btn",
                                style={"marginTop": "10px", "width": "100%"},
                            ),
                        ],
                        className="dev-panel-content",
                    ),
                ],
                id="dev-panel",
                className="dev-panel",
            ),

            # Comparison Modal - shows all options side by side
            dbc.Modal(
                [
                    dbc.ModalHeader(
                        dbc.ModalTitle("Rendering Comparison - Pick Your Preferred Settings"),
                        close_button=True,
                    ),
                    dbc.ModalBody(
                        [
                            html.P("Click on any image to apply those settings:", className="text-muted"),
                            html.Div(id="comparison-grid", className="comparison-grid"),
                        ],
                    ),
                ],
                id="comparison-modal",
                is_open=False,
                size="xl",
                fullscreen="lg-down",
            ),

            # Zoom controls (bottom left) - Leaflet has built-in, but we can add custom
            html.Div(
                [
                    html.Button(
                        html.I(className="fas fa-plus"),
                        id="btn-zoom-in",
                        className="zoom-btn",
                    ),
                    html.Button(
                        html.I(className="fas fa-minus"),
                        id="btn-zoom-out",
                        className="zoom-btn",
                    ),
                ],
                className="zoom-controls",
            ),

            # Top right controls
            html.Div(
                [
                    html.Button(
                        html.I(className="fas fa-ellipsis-h"),
                        id="btn-menu",
                        className="top-control-btn",
                    ),
                    html.Button(
                        html.I(className="fas fa-expand"),
                        id="btn-fullscreen",
                        className="top-control-btn",
                    ),
                ],
                className="top-right-controls",
            ),

            # Attribution badge
            html.Div(
                "POWERED BY THE C3S CLIMATE DATA STORE",
                className="attribution-badge",
            ),

            # Hidden elements for compatibility
            html.Div(id="selected-location", style={"display": "none"}),
            html.Div(id="stats-display", style={"display": "none"}),

            # Timeseries modal (shown on click)
            dbc.Modal(
                [
                    dbc.ModalHeader(
                        dbc.ModalTitle("Location Timeseries"),
                        close_button=True,
                    ),
                    dbc.ModalBody(
                        dcc.Graph(
                            id="timeseries-figure",
                            config={"displayModeBar": True, "displaylogo": False},
                            style={"height": "300px"},
                        ),
                    ),
                ],
                id="timeseries-modal",
                is_open=False,
                size="lg",
            ),
        ],
        className="app-container",
    )
