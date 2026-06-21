"""
export_snapshot.py
==================
Runs the data loader of your choice through the full pipeline and exports the
results to JSON files in /data for the frontend.

IMPORTANT: this script does NOT modify any backend logic. It only *calls* the
public functions in squad_model.py / data_loaders.py / backtest.py. The
per-player detail the frontend needs (individual scores + metric z-scores) is
produced by re-chaining the SAME public scoring functions that
build_squad_scores() uses internally -- so the numbers are guaranteed to match
the model.

Run:
    python export_snapshot.py                         # synthetic (offline)
    python export_snapshot.py --source understat    # real Big-5 xG/xA data
    python export_snapshot.py --source fbref        # real FBref (basic stats)
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from data_loaders import (
    DEFAULT_FBREF_LEAGUES,
    DEFAULT_SEASONS,
    DEFAULT_UNDERSTAT_LEAGUES,
    METRIC_COLS,
    load_fbref,
    load_understat,
    make_synthetic,
)
from squad_model import (
    build_squad_scores,
    map_position,
    refine_roles,
    zscore_within_role,
    player_role_score,
    apply_league_adjustment,
    POSITION_FRAMEWORK,
    LEAGUE_STRENGTH,
)
from backtest import (
    build_panel,
    backtest,
    find_inefficiencies,
    project_next_season,
)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MIN_MINUTES = 270


def _round(obj):
    """Recursively round floats; NaN/Inf become null for valid JSON."""
    if isinstance(obj, (float, np.floating)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return round(float(obj), 4)
    if isinstance(obj, dict):
        return {k: _round(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round(v) for v in obj]
    return obj


def write_json(name: str, payload):
    path = DATA_DIR / name
    with open(path, "w") as f:
        json.dump(_round(payload), f, indent=2, allow_nan=False)
    print(f"  wrote {path.relative_to(DATA_DIR.parent)}  ({path.stat().st_size:,} bytes)")


def build_player_detail(player_df: pd.DataFrame) -> pd.DataFrame:
    """Reproduce build_squad_scores()'s internal steps to expose PER-PLAYER
    scores + metric z-scores. Mirrors squad_model.build_squad_scores() exactly,
    minus the final aggregation."""
    df = player_df.copy()
    df["role"] = df["position"].apply(map_position)
    df = refine_roles(df)
    df = df[df["role"] != "UNK"]
    df = zscore_within_role(df)
    df = player_role_score(df)
    df = apply_league_adjustment(df)
    return df


def _load_data(source: str, leagues: list[str] | None, seasons: list[str] | None):
    if source == "synthetic":
        print("Generating synthetic dataset...")
        return make_synthetic()
    if source == "understat":
        lg = leagues or DEFAULT_UNDERSTAT_LEAGUES
        ss = seasons or DEFAULT_SEASONS
        print(f"Fetching Understat data ({len(lg)} leagues, seasons {ss})...")
        return load_understat(lg, ss)
    if source == "fbref":
        lg = leagues or DEFAULT_FBREF_LEAGUES
        ss = seasons or DEFAULT_SEASONS
        print(f"Fetching FBref data ({len(lg)} leagues, seasons {ss})...")
        print("  Note: FBref advanced metrics (xG, progressive passes, etc.) were")
        print("  removed in 2026. Use --source understat for Big-5 xG data.")
        return load_fbref(lg, ss)
    raise ValueError(f"unknown source: {source}")


def main():
    parser = argparse.ArgumentParser(description="Export squad model snapshot to /data")
    parser.add_argument(
        "--source",
        choices=["synthetic", "understat", "fbref"],
        default="synthetic",
        help="data source (default: synthetic offline test data)",
    )
    parser.add_argument(
        "--leagues",
        nargs="+",
        help="soccerdata league IDs (defaults depend on --source)",
    )
    parser.add_argument(
        "--seasons",
        nargs="+",
        help='season codes, e.g. 2223 2324 (default: 2122–2425)',
    )
    args = parser.parse_args()

    DATA_DIR.mkdir(exist_ok=True)
    players, points = _load_data(args.source, args.leagues, args.seasons)
    print(f"  {len(players):,} player rows, {len(points):,} team-season point rows")
    print(f"  sample teams: {', '.join(sorted(players['team'].unique())[:5])} ...")

    # --- squad scores (model output) ---
    squad = build_squad_scores(players, min_minutes=MIN_MINUTES)

    # --- panel + downstream analytics ---
    panel = build_panel(squad, points)
    bt = backtest(panel)
    ineff = find_inefficiencies(panel)
    latest_season = int(panel["season_int"].max())
    proj = project_next_season(panel, latest_season)

    # --- per-player detail (re-chained from the same public fns) ---
    detail = build_player_detail(players)
    z_cols = [f"z_{m}" for m in METRIC_COLS]
    qualifies = detail["minutes"].fillna(0) >= MIN_MINUTES

    # ---------------------------------------------------------------
    # 1) teams.json  -> league table w/ buy/fade signal
    # ---------------------------------------------------------------
    teams = ineff.rename(columns={
        "expected_points": "expected_points",
        "residual": "residual",
        "signal": "signal",
    }).copy()
    teams["season"] = teams["season"].astype(str)
    write_json("teams.json", teams.to_dict(orient="records"))

    # ---------------------------------------------------------------
    # 2) players.json -> roster w/ per-player score + metric z-scores
    # ---------------------------------------------------------------
    keep_cols = (
        ["player", "team", "league", "season", "position", "role", "minutes",
         "player_score", "league_mult", "adj_player_score"]
        + METRIC_COLS + z_cols
    )
    pj = detail[keep_cols].copy()
    pj["season"] = pj["season"].astype(str)
    pj["qualifies"] = qualifies.values  # whether they clear min_minutes
    write_json("players.json", pj.to_dict(orient="records"))

    # ---------------------------------------------------------------
    # 3) backtest.json -> predictor comparison
    # ---------------------------------------------------------------
    bt_payload = {
        "min_minutes": MIN_MINUTES,
        "models": [
            {"key": k, "label": LABELS[k], "mean_r2": float(row["mean_r2"]),
             "mean_mae": float(row["mean_mae"])}
            for k, row in bt.iterrows()
        ],
        "note": ("Higher R2 / lower MAE = better at predicting NEXT-season points. "
                 "If B_squad or C_both beat A_points, the model adds signal beyond the table."),
    }
    write_json("backtest.json", bt_payload)

    # ---------------------------------------------------------------
    # 4) projection.json -> next-season points projection
    # ---------------------------------------------------------------
    proj_out = proj.copy()
    proj_out["from_season"] = str(latest_season)
    write_json("projection.json", proj_out.to_dict(orient="records"))

    # ---------------------------------------------------------------
    # 5) meta.json -> framework + leagues + role list (for UI labels)
    # ---------------------------------------------------------------
    meta = {
        "min_minutes": MIN_MINUTES,
        "roles": list(POSITION_FRAMEWORK.keys()),
        "framework": POSITION_FRAMEWORK,
        "league_strength": LEAGUE_STRENGTH,
        "metric_cols": METRIC_COLS,
        "seasons": sorted(players["season"].unique().tolist()),
        "latest_season": str(latest_season),
        "leagues": sorted(players["league"].unique().tolist()),
        "data_source": args.source,
    }
    write_json("meta.json", meta)

    print("\nSnapshot complete. Files in /data:")
    for p in sorted(DATA_DIR.glob("*.json")):
        print(f"  {p.name}")


LABELS = {
    "A_points": "Raw points (baseline)",
    "B_squad": "Squad score (model)",
    "C_both": "Points + squad score",
}


if __name__ == "__main__":
    main()
