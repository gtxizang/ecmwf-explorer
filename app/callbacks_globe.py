"""
Dash callbacks for ECMWF ECV Explorer - pydeck GlobeView version.
"""

from dash import Input, Output, State, ctx, no_update, html, ALL, callback_context
from dash.exceptions import PreventUpdate
import json

from .data_loader import DATASETS, data_loader
from .globe_pydeck import create_globe_deck, COLORSCALES
from .charts import create_timeseries_chart, create_empty_timeseries


COLORMAPS = ["YlOrRd", "RdYlBu_r", "Viridis"]


def register_callbacks(app):
    """Register all callbacks with the Dash app."""

    # ========== DATASET SELECTION ==========
    @app.callback(
        Output("dataset-store", "data"),
        Output("variable-buttons-container", "children"),
        Output("variable-store", "data"),
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

        # Get time range
        _, _, time_strings = data_loader.get_time_range(dataset_id)
        max_time = len(time_strings) - 1 if time_strings else 0

        # Create time marks
        time_marks = {}
        if time_strings:
            time_marks[0] = time_strings[0].split("-")[0]
            if max_time > 0:
                time_marks[max_time] = time_strings[-1].split("-")[0]

        return dataset_id, var_buttons, first_var, max_time, time_marks, 0

    # ========== VARIABLE SELECTION ==========
    @app.callback(
        Output({"type": "var-btn", "index": ALL}, "className"),
        Output("variable-store", "data", allow_duplicate=True),
        Input({"type": "var-btn", "index": ALL}, "n_clicks"),
        State({"type": "var-btn", "index": ALL}, "id"),
        State("variable-store", "data"),
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
        Output("colormap-store", "data"),
        Output("color-bar", "style"),
        [Input(f"cmap-btn-{cmap}", "n_clicks") for cmap in COLORMAPS],
        State("colormap-store", "data"),
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

        # Create gradient for color bar
        colorscale = COLORSCALES.get(new_cmap, COLORSCALES["RdYlBu_r"])
        colors = [c[1] for c in colorscale]
        gradient = ", ".join(reversed(colors))

        color_bar_style = {
            "width": "20px",
            "height": "150px",
            "borderRadius": "3px",
            "margin": "6px 0",
            "background": f"linear-gradient(to bottom, {gradient})",
        }

        return *classes, new_cmap, color_bar_style

    # ========== SMOOTHING SLIDER ==========
    @app.callback(
        Output("sigma-store", "data"),
        Input("sigma-slider", "value"),
    )
    def update_sigma(sigma):
        return sigma

    # ========== GLOBE UPDATE ==========
    @app.callback(
        Output("deck-globe", "data"),
        Output("legend-min", "children"),
        Output("legend-max", "children"),
        Output("legend-title", "children"),
        Input("variable-store", "data"),
        Input("colormap-store", "data"),
        Input("time-slider", "value"),
        Input("dataset-store", "data"),
        Input("sigma-store", "data"),
    )
    def update_globe(variable, colormap, time_index, dataset_id, sigma):
        """Update the globe visualization."""
        if not dataset_id or not variable:
            return no_update, "", "", ""

        # Create new deck
        deck = create_globe_deck(
            dataset_id=dataset_id,
            variable=variable,
            time_index=time_index,
            colormap=colormap,
            sigma=sigma,
        )

        # Get data stats for legend
        lons, lats, values, vmin, vmax = data_loader.get_data_for_time(
            dataset_id, variable, time_index, resolution=1
        )

        # Get variable info
        var_config = DATASETS.get(dataset_id, {}).get("variables", {}).get(variable, {})
        units = var_config.get("units", "")

        legend_min = f"{vmin:.0f}"
        legend_max = f"{vmax:.0f}"
        legend_title = f"{units}"

        # Get JSON and fix pydeck's @@= prefix on data URLs
        deck_json = deck.to_json()
        # pydeck adds @@= to tell deck.gl to evaluate as JS expression
        # but this breaks JSON parsing for base64 data URLs
        deck_json = deck_json.replace('"@@=data:', '"data:')

        return deck_json, legend_min, legend_max, legend_title

    # ========== TIME DISPLAY ==========
    @app.callback(
        Output("time-display", "children"),
        Input("time-slider", "value"),
        State("dataset-store", "data"),
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

    # ========== COLOR BAR INITIALIZATION ==========
    @app.callback(
        Output("color-bar", "style", allow_duplicate=True),
        Input("colormap-store", "data"),
        prevent_initial_call="initial_duplicate",
    )
    def init_color_bar(colormap):
        """Initialize color bar on load."""
        colorscale = COLORSCALES.get(colormap, COLORSCALES["RdYlBu_r"])
        colors = [c[1] for c in colorscale]
        gradient = ", ".join(reversed(colors))

        return {
            "width": "20px",
            "height": "150px",
            "borderRadius": "3px",
            "margin": "6px 0",
            "background": f"linear-gradient(to bottom, {gradient})",
        }
