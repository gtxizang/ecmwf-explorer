"""
Chart generation for ECMWF ECV Explorer.
Creates Plotly figures for timeseries and other visualizations.
"""

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from .data_loader import DATASETS

# NEC Explorer dark theme colors
COLORS = {
    "primary": "#941333",
    "accent": "#ff6b6b",
    "background": "#282c34",
    "surface": "#1e2127",
    "text": "#ffffff",
    "text_muted": "#8a8a8a",
    "grid": "#404550",
}


def create_timeseries_chart(
    df: pd.DataFrame,
    variable: str,
    dataset_id: str,
    lat: float,
    lon: float,
) -> go.Figure:
    """
    Create a timeseries chart for a point location.

    Args:
        df: DataFrame with 'time' and 'value' columns
        variable: Variable name
        dataset_id: Dataset identifier
        lat: Latitude of point
        lon: Longitude of point

    Returns:
        Plotly Figure
    """
    if df.empty:
        fig = go.Figure()
        fig.add_annotation(
            text="No data available for this location",
            xref="paper",
            yref="paper",
            x=0.5,
            y=0.5,
            showarrow=False,
            font=dict(size=14, color=COLORS["text"]),
        )
        fig.update_layout(
            paper_bgcolor=COLORS["background"],
            plot_bgcolor=COLORS["background"],
        )
        return fig

    var_config = DATASETS.get(dataset_id, {}).get("variables", {}).get(variable, {})
    var_name = var_config.get("name", variable)
    units = var_config.get("units", "")

    fig = go.Figure()

    fig.add_trace(
        go.Scatter(
            x=df["time"],
            y=df["value"],
            mode="lines+markers",
            line=dict(color=COLORS["primary"], width=2),
            marker=dict(size=4, color=COLORS["accent"]),
            name=var_name,
            hovertemplate="%{x|%Y-%m}<br>%{y:.3f} " + units + "<extra></extra>",
        )
    )

    # Add trend line
    if len(df) > 2:
        x_numeric = np.arange(len(df))
        z = np.polyfit(x_numeric, df["value"].values, 1)
        trend = np.poly1d(z)(x_numeric)

        fig.add_trace(
            go.Scatter(
                x=df["time"],
                y=trend,
                mode="lines",
                line=dict(color=COLORS["accent"], width=1, dash="dash"),
                name="Trend",
                hoverinfo="skip",
            )
        )

    fig.update_layout(
        title=dict(
            text=f"{var_name} at ({lat:.2f}°, {lon:.2f}°)",
            font=dict(size=14, color=COLORS["text"]),
        ),
        xaxis=dict(
            title="Time",
            gridcolor=COLORS["grid"],
            showgrid=True,
            color=COLORS["text_muted"],
            tickfont=dict(color=COLORS["text_muted"]),
        ),
        yaxis=dict(
            title=f"{var_name} ({units})" if units else var_name,
            gridcolor=COLORS["grid"],
            showgrid=True,
            color=COLORS["text_muted"],
            tickfont=dict(color=COLORS["text_muted"]),
        ),
        paper_bgcolor=COLORS["background"],
        plot_bgcolor=COLORS["surface"],
        hovermode="x unified",
        showlegend=True,
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            font=dict(color=COLORS["text"]),
        ),
        margin=dict(l=60, r=20, t=60, b=40),
    )

    return fig


def create_empty_timeseries() -> go.Figure:
    """Create an empty timeseries chart with instructions."""
    fig = go.Figure()

    fig.add_annotation(
        text="Click on the globe to view timeseries data",
        xref="paper",
        yref="paper",
        x=0.5,
        y=0.5,
        showarrow=False,
        font=dict(size=16, color=COLORS["primary"]),
    )

    fig.update_layout(
        paper_bgcolor=COLORS["background"],
        plot_bgcolor=COLORS["background"],
        xaxis=dict(visible=False),
        yaxis=dict(visible=False),
        margin=dict(l=20, r=20, t=20, b=20),
    )

    return fig


def create_heatmap(
    lons: np.ndarray,
    lats: np.ndarray,
    values: np.ndarray,
    colormap: str,
    vmin: float,
    vmax: float,
    variable: str,
    dataset_id: str,
) -> go.Figure:
    """
    Create a 2D heatmap visualization.

    Args:
        lons: Longitude array
        lats: Latitude array
        values: 2D data array
        colormap: Colormap name
        vmin: Minimum value for colorscale
        vmax: Maximum value for colorscale
        variable: Variable name
        dataset_id: Dataset identifier

    Returns:
        Plotly Figure
    """
    var_config = DATASETS.get(dataset_id, {}).get("variables", {}).get(variable, {})
    var_name = var_config.get("name", variable)
    units = var_config.get("units", "")

    fig = go.Figure(
        data=go.Heatmap(
            z=values,
            x=lons,
            y=lats,
            colorscale=colormap,
            zmin=vmin,
            zmax=vmax,
            colorbar=dict(
                title=dict(text=units, side="right"),
                thickness=15,
            ),
            hovertemplate="Lon: %{x:.2f}°<br>Lat: %{y:.2f}°<br>Value: %{z:.3f}<extra></extra>",
        )
    )

    fig.update_layout(
        title=dict(
            text=var_name,
            font=dict(size=14, color=COLORS["primary"]),
        ),
        xaxis=dict(title="Longitude", scaleanchor="y"),
        yaxis=dict(title="Latitude"),
        paper_bgcolor=COLORS["background"],
        plot_bgcolor=COLORS["background"],
        margin=dict(l=60, r=20, t=60, b=40),
    )

    return fig


def create_stats_display(stats: dict, variable: str, dataset_id: str) -> str:
    """Format global statistics for display."""
    if not stats:
        return "No statistics available"

    var_config = DATASETS.get(dataset_id, {}).get("variables", {}).get(variable, {})
    units = var_config.get("units", "")

    return (
        f"**Global Statistics**  \n"
        f"Mean: {stats['mean']:.3f} {units}  \n"
        f"Std Dev: {stats['std']:.3f} {units}  \n"
        f"Min: {stats['min']:.3f} {units}  \n"
        f"Max: {stats['max']:.3f} {units}"
    )
