"""
backtest.py
===========
The validation that turns a ranking into a model.

Core test: does THIS season's squad_score predict NEXT season's points better
than this season's points do on their own? If yes, you've found signal the
table misses -- the Brentford edge. If no, your weights/metrics need work.

It also surfaces the practical output you asked for:
  - "outperformers": teams whose squad quality > their points suggest
    (the buy signal -- squad is better than results show, expect them to rise)
  - "overperformers": teams whose points > squad quality suggests
    (the fade signal -- results flatter the squad, expect regression)
  - next-season projection from current squad score
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score, mean_absolute_error


def build_panel(squad_scores: pd.DataFrame, points: pd.DataFrame) -> pd.DataFrame:
    """Join squad scores to same-season points and to NEXT-season points."""
    df = squad_scores.merge(points, on=["league","season","team"], how="inner")
    # Build next-season points by shifting season forward within each team
    df["season_int"] = df["season"].astype(int)
    nxt = points.copy()
    nxt["season_int"] = nxt["season"].astype(int) - 1   # align next yr onto this row
    nxt = nxt.rename(columns={"points": "points_next"})[["league","team","season_int","points_next"]]
    df = df.merge(nxt, on=["league","team","season_int"], how="left")
    return df


def backtest(panel: pd.DataFrame):
    """Compare three predictors of NEXT-season points:
        (A) this-season points only            -- the naive baseline
        (B) this-season squad_score only        -- the model
        (C) both combined
    Higher out-of-sample R^2 / lower MAE = better. Uses leave-one-season-out.
    """
    d = panel.dropna(subset=["points_next"]).copy()
    seasons = sorted(d["season_int"].unique())
    results = {"A_points": [], "B_squad": [], "C_both": []}

    for test_season in seasons:
        train = d[d["season_int"] != test_season]
        test  = d[d["season_int"] == test_season]
        if len(train) < 10 or len(test) < 3:
            continue
        specs = {
            "A_points": ["points"],
            "B_squad":  ["squad_score"],
            "C_both":   ["points", "squad_score"],
        }
        for name, feats in specs.items():
            m = LinearRegression().fit(train[feats], train["points_next"])
            pred = m.predict(test[feats])
            results[name].append({
                "season": test_season,
                "r2": r2_score(test["points_next"], pred) if len(test) > 2 else np.nan,
                "mae": mean_absolute_error(test["points_next"], pred),
            })

    summary = {}
    for name, runs in results.items():
        if runs:
            summary[name] = {
                "mean_r2":  np.nanmean([r["r2"]  for r in runs]),
                "mean_mae": np.nanmean([r["mae"] for r in runs]),
            }
    return pd.DataFrame(summary).T


def find_inefficiencies(panel: pd.DataFrame) -> pd.DataFrame:
    """Residual of points vs squad_score = the market inefficiency.

    Fit points ~ squad_score across the panel; the residual tells you whether a
    team is over- or under-performing its underlying squad quality.
      residual < 0  -> UNDERPERFORMING results vs squad  => OUTPERFORMER signal
                       (squad is good, results lag -> expect improvement / buy)
      residual > 0  -> OVERPERFORMING results vs squad    => regression risk / fade
    """
    d = panel.dropna(subset=["points","squad_score"]).copy()
    m = LinearRegression().fit(d[["squad_score"]], d["points"])
    d["expected_points"] = m.predict(d[["squad_score"]])
    d["residual"] = d["points"] - d["expected_points"]
    d["signal"] = np.where(d["residual"] < -3, "OUTPERFORMER (buy)",
                  np.where(d["residual"] >  3, "regression risk (fade)", "fair"))
    return d.sort_values("residual")[
        ["league","season","team","squad_score","points","expected_points","residual","signal"]
    ]


def project_next_season(panel: pd.DataFrame, latest_season: int) -> pd.DataFrame:
    """Train on all completed seasons, project next-season points from the
    latest season's squad scores."""
    d = panel.dropna(subset=["points_next"]).copy()
    m = LinearRegression().fit(d[["points","squad_score"]], d["points_next"])
    latest = panel[panel["season_int"] == latest_season].copy()
    if latest.empty:
        return pd.DataFrame()
    latest["projected_points_next"] = m.predict(latest[["points","squad_score"]])
    return latest.sort_values("projected_points_next", ascending=False)[
        ["league","team","points","squad_score","projected_points_next"]
    ]
