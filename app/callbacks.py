"""
Dash callbacks for ECMWF ECV Explorer.
NEC Explorer style interface with Leaflet map.
"""

from dash import Input, Output, State, ctx, no_update, html, ALL, callback_context
from dash.exceptions import PreventUpdate
import dash_leaflet as dl
import numpy as np

from .data_loader import DATASETS, data_loader
from .globe import COLORSCALES
from .charts import create_timeseries_chart, create_empty_timeseries


COLORMAPS = ["YlOrRd", "RdYlBu_r", "Viridis"]


def register_callbacks(app):
    """Register all callbacks with the Dash app."""

    # ========== DATASET SELECTION ==========
    @app.callback(
        Output("dataset-dropdown", "data"),
        Output("variable-buttons-container", "children"),
        Output("variable-dropdown", "data"),
        Output("time-slider", "max"),
        Output("time-slider", "marks"),
        Output("time-slider", "value"),
        Input("dataset-selector", "value"),
    )
    def update_dataset(dataset_id):
        """Update everything when dataset changes."""
        if not dataset_id:
            return no_update, [], no_update, 0, {}, 0

        # Get dataset config
        config = DATASETS.get(dataset_id, {})
        variables = config.get("variables", {})

        # Create variable buttons
        var_buttons = []
        first_var = None
        for var_id, var_config in variables.items():
            if first_var is None:
                first_var = var_id
            var_buttons.append(
                html.Button(
                    [
                        html.I(className="fas fa-chart-line me-2"),
                        var_config.get("name", var_id)[:20],
                    ],
                    id={"type": "var-btn", "index": var_id},
                    className="var-btn active" if var_id == first_var else "var-btn",
                )
            )

        # Get time range for this dataset
        _, _, time_strings = data_loader.get_time_range(dataset_id)
        max_time = len(time_strings) - 1 if time_strings else 0

        # Create time marks
        time_marks = {}
        if time_strings:
            time_marks[0] = time_strings[0].split("-")[0]
            if max_time > 0:
                time_marks[max_time] = time_strings[-1].split("-")[0]

        return dataset_id, var_buttons, first_var, max_time, time_marks, 0

    # ========== VARIABLE SELECTION (Pattern-matching) ==========
    @app.callback(
        Output({"type": "var-btn", "index": ALL}, "className"),
        Output("variable-dropdown", "data", allow_duplicate=True),
        Input({"type": "var-btn", "index": ALL}, "n_clicks"),
        State({"type": "var-btn", "index": ALL}, "id"),
        State("variable-dropdown", "data"),
        prevent_initial_call=True,
    )
    def update_variable(n_clicks_list, button_ids, current_var):
        """Handle variable button clicks."""
        if not callback_context.triggered:
            raise PreventUpdate

        triggered = callback_context.triggered[0]
        if triggered["value"] is None:
            raise PreventUpdate

        prop_id = triggered["prop_id"]
        import json
        try:
            clicked_id = json.loads(prop_id.rsplit(".", 1)[0])
            new_var = clicked_id["index"]
        except (json.JSONDecodeError, KeyError):
            raise PreventUpdate

        classes = []
        for btn_id in button_ids:
            if btn_id["index"] == new_var:
                classes.append("var-btn active")
            else:
                classes.append("var-btn")

        return classes, new_var

    # ========== COLORMAP SELECTION ==========
    @app.callback(
        [Output(f"cmap-btn-{cmap}", "className") for cmap in COLORMAPS],
        Output("colormap-dropdown", "data"),
        Output("color-bar", "style"),
        [Input(f"cmap-btn-{cmap}", "n_clicks") for cmap in COLORMAPS],
        State("colormap-dropdown", "data"),
        prevent_initial_call=True,
    )
    def update_colormap(*args):
        """Handle colormap button clicks."""
        n_clicks_list = args[:-1]
        current_cmap = args[-1]

        triggered = ctx.triggered_id
        if triggered is None:
            raise PreventUpdate

        new_cmap = triggered.replace("cmap-btn-", "")

        classes = []
        for cmap in COLORMAPS:
            if cmap == new_cmap:
                classes.append("cmap-btn active")
            else:
                classes.append("cmap-btn")

        colorscale = COLORSCALES.get(new_cmap, "YlOrRd")
        if isinstance(colorscale, (list, tuple)) and not isinstance(colorscale, str):
            colors = [c[1] for c in colorscale]
            gradient = ", ".join(reversed(colors))
        else:
            gradient = "#800026, #bd0026, #e31a1c, #fc4e2a, #fd8d3c, #feb24c, #fed976, #ffeda0, #ffffcc"

        color_bar_style = {
            "width": "20px",
            "height": "150px",
            "borderRadius": "3px",
            "margin": "6px 0",
            "background": f"linear-gradient(to bottom, {gradient})",
        }

        return *classes, new_cmap, color_bar_style

    # ========== MAP DATA UPDATE (Simple Image) ==========
    @app.callback(
        Output("data-image-overlay", "url"),
        Output("legend-min", "children"),
        Output("legend-max", "children"),
        Output("legend-title", "children"),
        Output("dev-settings-display", "children"),
        Input("variable-dropdown", "data"),
        Input("colormap-dropdown", "data"),
        Input("time-slider", "value"),
        Input("dataset-dropdown", "data"),
        Input("dev-sigma-slider", "value"),
        Input("dev-interp-dropdown", "data"),
    )
    def update_map(variable, colormap, time_index, dataset_id, sigma, interp):
        """Update the image overlay URL to reflect current selection."""
        if not dataset_id or not variable:
            return no_update, "", "", "", ""

        # Build simple image URL
        import time
        cache_bust = int(time.time())
        image_url = f"/simple/{dataset_id}/{variable}/{time_index}/{colormap}.png?sigma={sigma}&interp={interp}&t={cache_bust}"

        # Get data stats for legend
        lons, lats, values, vmin, vmax = data_loader.get_data_for_time(
            dataset_id, variable, time_index, resolution=1
        )

        # Get variable info for legend
        var_config = DATASETS.get(dataset_id, {}).get("variables", {}).get(variable, {})
        units = var_config.get("units", "")

        legend_min = f"{vmin:.0f}"
        legend_max = f"{vmax:.0f}"
        legend_title = f"{units}"

        # Dev settings display
        dev_display = f"σ={sigma}, {interp}"

        return image_url, legend_min, legend_max, legend_title, dev_display

    # ========== TIME DISPLAY ==========
    @app.callback(
        Output("time-display", "children"),
        Input("time-slider", "value"),
        State("dataset-dropdown", "data"),
    )
    def update_time_display(time_index, dataset_id):
        """Update the time display label."""
        _, _, time_strings = data_loader.get_time_range(dataset_id)
        if time_strings and 0 <= time_index < len(time_strings):
            return time_strings[time_index]
        return "N/A"

    # ========== PLAYBACK CONTROLS ==========
    @app.callback(
        Output("animation-interval", "disabled"),
        Output("play-icon", "className"),
        Output("play-state", "data"),
        Input("btn-play", "n_clicks"),
        State("play-state", "data"),
        prevent_initial_call=True,
    )
    def toggle_animation(n_clicks, play_state):
        """Toggle animation play/pause."""
        playing = not play_state.get("playing", False)
        icon_class = "fas fa-pause" if playing else "fas fa-play"
        return not playing, icon_class, {"playing": playing}

    @app.callback(
        Output("time-slider", "value", allow_duplicate=True),
        Input("animation-interval", "n_intervals"),
        State("time-slider", "value"),
        State("time-slider", "max"),
        State("animation-interval", "disabled"),
        prevent_initial_call=True,
    )
    def advance_animation(n_intervals, current_value, max_value, disabled):
        """Advance time slider during animation."""
        if disabled:
            return no_update
        next_value = (current_value + 1) % (max_value + 1)
        return next_value

    @app.callback(
        Output("time-slider", "value", allow_duplicate=True),
        Input("btn-prev", "n_clicks"),
        State("time-slider", "value"),
        State("time-slider", "max"),
        prevent_initial_call=True,
    )
    def prev_time(n_clicks, current_value, max_value):
        """Go to previous time step."""
        return max(0, current_value - 1)

    @app.callback(
        Output("time-slider", "value", allow_duplicate=True),
        Input("btn-next", "n_clicks"),
        State("time-slider", "value"),
        State("time-slider", "max"),
        prevent_initial_call=True,
    )
    def next_time(n_clicks, current_value, max_value):
        """Go to next time step."""
        return min(max_value, current_value + 1)

    # ========== CLICK TO SELECT LOCATION (Leaflet) ==========
    @app.callback(
        Output("selected-coords", "data"),
        Output("timeseries-modal", "is_open"),
        Output("timeseries-figure", "figure"),
        Output("click-marker", "children"),
        Input("leaflet-map", "clickData"),
        State("dataset-dropdown", "data"),
        State("variable-dropdown", "data"),
        prevent_initial_call=True,
    )
    def handle_map_click(click_data, dataset_id, variable):
        """Handle click on Leaflet map to show timeseries."""
        if click_data is None:
            return {"lat": None, "lon": None}, False, create_empty_timeseries(), []

        # Leaflet clickData format: {'latlng': {'lat': ..., 'lng': ...}}
        latlng = click_data.get("latlng", {})
        lat = latlng.get("lat")
        lon = latlng.get("lng")

        if lat is None or lon is None:
            return {"lat": None, "lon": None}, False, create_empty_timeseries(), []

        # Get timeseries data
        df = data_loader.get_timeseries_at_point(dataset_id, variable, lat, lon)

        if df.empty:
            return {"lat": lat, "lon": lon}, False, create_empty_timeseries(), []

        # Create timeseries chart
        fig = create_timeseries_chart(df, variable, dataset_id, lat, lon)

        # Create click marker
        marker = dl.Marker(
            position=[lat, lon],
            children=[
                dl.Tooltip(f"Lat: {lat:.2f}, Lon: {lon:.2f}")
            ],
        )

        return {"lat": lat, "lon": lon}, True, fig, [marker]

    # ========== DOWNLOAD ==========
    @app.callback(
        Output("download-csv", "data"),
        Input("btn-export-csv", "n_clicks"),
        State("selected-coords", "data"),
        State("dataset-dropdown", "data"),
        State("variable-dropdown", "data"),
        prevent_initial_call=True,
    )
    def export_csv(n_clicks, coords, dataset_id, variable):
        """Export timeseries data as CSV."""
        if not coords or coords.get("lat") is None:
            return no_update

        lat = coords["lat"]
        lon = coords["lon"]

        df = data_loader.get_timeseries_at_point(dataset_id, variable, lat, lon)

        if df.empty:
            return no_update

        var_config = DATASETS.get(dataset_id, {}).get("variables", {}).get(variable, {})
        var_name = var_config.get("name", variable)

        df.columns = ["Time", var_name]

        filename = f"ecmwf_{variable}_lat{lat:.2f}_lon{lon:.2f}.csv"

        return dict(
            content=df.to_csv(index=False),
            filename=filename,
            type="text/csv",
        )

    # ========== COLOR BAR INITIALIZATION ==========
    @app.callback(
        Output("color-bar", "style", allow_duplicate=True),
        Input("colormap-dropdown", "data"),
        prevent_initial_call="initial_duplicate",
    )
    def init_color_bar(colormap):
        """Initialize color bar on load."""
        colorscale = COLORSCALES.get(colormap, "YlOrRd")
        if isinstance(colorscale, (list, tuple)) and not isinstance(colorscale, str):
            colors = [c[1] for c in colorscale]
            gradient = ", ".join(reversed(colors))
        else:
            gradient = "#800026, #bd0026, #e31a1c, #fc4e2a, #fd8d3c, #feb24c, #fed976, #ffeda0, #ffffcc"

        return {
            "width": "20px",
            "height": "150px",
            "borderRadius": "3px",
            "margin": "6px 0",
            "background": f"linear-gradient(to bottom, {gradient})",
        }

    # ========== INTERPOLATION BUTTON SELECTION ==========
    INTERP_METHODS = ["nearest", "bilinear", "bicubic", "lanczos"]

    @app.callback(
        [Output(f"interp-btn-{method}", "className") for method in INTERP_METHODS],
        Output("dev-interp-dropdown", "data"),
        [Input(f"interp-btn-{method}", "n_clicks") for method in INTERP_METHODS],
        State("dev-interp-dropdown", "data"),
        prevent_initial_call=True,
    )
    def update_interp_method(*args):
        """Handle interpolation button clicks."""
        n_clicks_list = args[:-1]
        current_method = args[-1]

        triggered = ctx.triggered_id
        if triggered is None:
            raise PreventUpdate

        new_method = triggered.replace("interp-btn-", "")

        classes = []
        for method in INTERP_METHODS:
            if method == new_method:
                classes.append("interp-btn active")
            else:
                classes.append("interp-btn")

        return *classes, new_method

    # ========== COMPARISON MODAL ==========
    @app.callback(
        Output("comparison-modal", "is_open"),
        Output("comparison-grid", "children"),
        Input("btn-open-comparison", "n_clicks"),
        State("dataset-dropdown", "data"),
        State("variable-dropdown", "data"),
        State("time-slider", "value"),
        State("colormap-dropdown", "data"),
        prevent_initial_call=True,
    )
    def open_comparison(n_clicks, dataset_id, variable, time_index, colormap):
        """Open comparison modal with grid of all options."""
        if not n_clicks:
            raise PreventUpdate

        # Generate grid of comparison images
        sigma_values = [0, 0.5, 1.0, 1.5, 2.0]
        interp_methods = ["nearest", "bilinear", "bicubic", "lanczos"]

        import time
        cache_bust = int(time.time())

        grid_items = []
        for sigma in sigma_values:
            for interp in interp_methods:
                url = f"/simple/{dataset_id}/{variable}/{time_index}/{colormap}.png?sigma={sigma}&interp={interp}&t={cache_bust}"
                label = f"σ={sigma}, {interp}"

                item = html.Div(
                    [
                        html.Img(src=url, style={"width": "100%"}),
                        html.Div(label, className="comparison-label"),
                    ],
                    className="comparison-item",
                    id={"type": "comparison-item", "sigma": sigma, "interp": interp},
                    n_clicks=0,
                )
                grid_items.append(item)

        return True, grid_items

    # ========== APPLY SETTINGS FROM COMPARISON ==========
    @app.callback(
        Output("dev-sigma-slider", "value", allow_duplicate=True),
        Output("dev-interp-dropdown", "data", allow_duplicate=True),
        Output("comparison-modal", "is_open", allow_duplicate=True),
        [Output(f"interp-btn-{method}", "className", allow_duplicate=True) for method in INTERP_METHODS],
        Input({"type": "comparison-item", "sigma": ALL, "interp": ALL}, "n_clicks"),
        State({"type": "comparison-item", "sigma": ALL, "interp": ALL}, "id"),
        prevent_initial_call=True,
    )
    def apply_comparison_settings(n_clicks_list, ids):
        """Apply settings when user clicks a comparison image."""
        if not callback_context.triggered or all(n == 0 for n in n_clicks_list if n):
            raise PreventUpdate

        # Find which item was clicked
        triggered = callback_context.triggered[0]
        if triggered["value"] == 0:
            raise PreventUpdate

        import json
        prop_id = triggered["prop_id"]
        try:
            clicked_id = json.loads(prop_id.rsplit(".", 1)[0])
            sigma = clicked_id["sigma"]
            interp = clicked_id["interp"]
        except:
            raise PreventUpdate

        # Update button classes
        classes = []
        for method in INTERP_METHODS:
            if method == interp:
                classes.append("interp-btn active")
            else:
                classes.append("interp-btn")

        return sigma, interp, False, *classes
