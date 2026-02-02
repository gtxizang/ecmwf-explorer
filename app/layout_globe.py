"""
UI Layout for ECMWF ECV Explorer - pydeck GlobeView version.
Per specification: 3D globe with WebGL rendering.
"""

from dash import dcc, html
import dash_bootstrap_components as dbc
import dash_deck

from .data_loader import DATASETS, data_loader
from .globe_pydeck import create_globe_deck

# Default dataset
DEFAULT_DATASET = "era5_land"
DEFAULT_VARIABLE = "2m_temperature"

# Initial view
INITIAL_LAT = 20
INITIAL_LON = 0
INITIAL_ZOOM = 1


def create_layout() -> html.Div:
    """Create the complete application layout with pydeck GlobeView."""
    _, _, time_strings = data_loader.get_time_range(DEFAULT_DATASET)
    max_time = len(time_strings) - 1 if time_strings else 0

    # Create time marks for slider
    time_marks = {}
    if time_strings:
        time_marks[0] = time_strings[0].split("-")[0]
        time_marks[len(time_strings) - 1] = time_strings[-1].split("-")[0]

    # Create initial deck
    initial_deck = create_globe_deck(
        dataset_id=DEFAULT_DATASET,
        variable=DEFAULT_VARIABLE,
        time_index=0,
        colormap="RdYlBu_r",
        sigma=1.0,
    )

    # Fix pydeck's @@= prefix on data URLs (breaks JSON parsing)
    initial_deck_json = initial_deck.to_json().replace('"@@=data:', '"data:')

    return html.Div(
        [
            # Stores
            dcc.Store(id="selected-coords", data={"lat": None, "lon": None}),
            dcc.Store(id="play-state", data={"playing": False}),
            dcc.Store(id="dataset-store", data=DEFAULT_DATASET),
            dcc.Store(id="variable-store", data=DEFAULT_VARIABLE),
            dcc.Store(id="colormap-store", data="RdYlBu_r"),
            dcc.Store(id="sigma-store", data=1.0),

            # Main container
            html.Div(
                [
                    # 3D Globe (full screen background)
                    html.Div(
                        dash_deck.DeckGL(
                            id="deck-globe",
                            data=initial_deck_json,
                            style={
                                "width": "100%",
                                "height": "100vh",
                                "position": "absolute",
                                "top": 0,
                                "left": 0,
                            },
                            tooltip=True,
                        ),
                        className="globe-container",
                    ),

                    # Left control panel (floating)
                    html.Div(
                        [
                            # Header
                            html.Div(
                                [
                                    html.I(className="fas fa-globe panel-icon"),
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
                                            html.I(className="fas fa-thermometer-half section-icon"),
                                            html.Span("Climate Variable", className="section-title"),
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
                                            html.I(className="fas fa-palette section-icon"),
                                            html.Span("Color Scale", className="section-title"),
                                        ],
                                        className="section-header",
                                    ),
                                    html.Div(
                                        [
                                            html.Button("YlOrRd", id="cmap-btn-YlOrRd", className="cmap-btn"),
                                            html.Button("RdYlBu", id="cmap-btn-RdYlBu_r", className="cmap-btn active"),
                                            html.Button("Viridis", id="cmap-btn-Viridis", className="cmap-btn"),
                                        ],
                                        className="cmap-toggle-group",
                                    ),
                                ],
                                className="control-section",
                            ),

                            # Smoothing control
                            html.Div(
                                [
                                    html.Div(
                                        [
                                            html.I(className="fas fa-sliders-h section-icon"),
                                            html.Span("Smoothing", className="section-title"),
                                        ],
                                        className="section-header",
                                    ),
                                    dcc.Slider(
                                        id="sigma-slider",
                                        min=0,
                                        max=3,
                                        step=0.5,
                                        value=1.0,
                                        marks={0: "0", 1: "1", 2: "2", 3: "3"},
                                        className="sigma-slider",
                                    ),
                                ],
                                className="control-section",
                            ),
                        ],
                        className="left-panel",
                    ),

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

                    # Attribution badge
                    html.Div(
                        "POWERED BY C3S CLIMATE DATA STORE",
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
            ),
        ]
    )
