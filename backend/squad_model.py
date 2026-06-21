"""
squad_model.py
==============
A Brentford/Brighton-style squad quality model.

Pipeline:
  1. Load player per-90 stats (pluggable: synthetic for testing, FBref for real)
  2. Map FBref position strings -> role buckets (GK/CB/FB/DM/CM/W/ST)
  3. Z-score each metric WITHIN each role, per season  (compare like-for-like)
  4. Weight + combine metric z-scores into one player score per role
  5. League-strength adjust the score
  6. Aggregate to a squad score, weighted by minutes played
  7. (see backtest.py) regress NEXT-season points on THIS-season squad score

Design principle: score on UNDERLYING/predictive metrics (xG, xA, progressive
actions), never on outcomes (actual goals/points). Outcomes regress; process
repeats. Scoring on outcomes just re-ranks last year's table.
"""

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# 1. POSITION FRAMEWORK
# ---------------------------------------------------------------------------
# For each role: the metrics that matter and their relative weight.
# Weights are starting points -- tune them, that's the whole point of the model.
# A negative weight means "more is bad" (e.g. errors leading to a shot).
# Metric names here are CANONICAL; map_fbref_columns() translates FBref's names.

POSITION_FRAMEWORK = {
    "GK": {
        "psxg_plus_minus_per90": 0.45,   # shot-stopping above expected (the key GK stat)
        "save_pct":              0.25,
        "sweeper_actions_per90": 0.15,   # defensive actions outside box
        "launch_completion_pct": 0.15,   # distribution
    },
    "CB": {
        "aerial_win_pct":        0.25,
        "pct_dribblers_tackled": 0.20,
        "progressive_passes_per90": 0.25,
        "interceptions_per90":   0.20,
        "errors_per90":         -0.10,   # negative: errors are bad
    },
    "FB": {
        "progressive_carries_per90": 0.25,
        "crosses_into_box_per90":    0.20,
        "take_ons_won_per90":        0.15,
        "tackles_plus_int_per90":    0.25,
        "xa_per90":                  0.15,
    },
    "DM": {
        "progressive_passes_per90":   0.25,
        "pass_completion_pct":        0.15,
        "ball_recoveries_per90":      0.25,
        "tackles_plus_int_per90":     0.25,
        "pressure_regains_per90":     0.10,
    },
    "CM": {
        "xa_per90":                   0.25,
        "shot_creating_actions_per90":0.25,
        "progressive_passes_per90":   0.25,
        "key_passes_per100":          0.15,
        "npxg_per90":                 0.10,
    },
    "W": {
        "npxg_plus_xa_per90":         0.30,
        "take_ons_won_per90":         0.20,
        "progressive_carries_per90":  0.20,
        "shot_creating_actions_per90":0.20,
        "crosses_into_box_per90":     0.10,
    },
    "ST": {
        "npxg_per90":                 0.35,
        "npxg_per_shot":              0.25,  # shot QUALITY, not volume
        "goals_minus_xg_per90":       0.15,  # finishing skill -- only trust over big samples
        "shot_creating_actions_per90":0.15,
        "aerial_win_pct":             0.10,
    },
}

# ---------------------------------------------------------------------------
# 2. POSITION MAPPING
# ---------------------------------------------------------------------------
# FBref reports positions like "FW", "MF", "DF", "GK", "MF,FW", "DF,MF".
# We collapse to our 7 buckets. This is deliberately simple -- a real build
# would use minutes-by-position or tracking data. Order matters: first match wins.

def map_position(fbref_pos: str) -> str:
    if not isinstance(fbref_pos, str):
        return "UNK"
    p = fbref_pos.upper()
    primary = p.split(",")[0].strip()   # FBref lists primary position first
    if primary == "GK":
        return "GK"
    if primary == "DF":
        # crude FB vs CB split needs more data; default CB, refine with width data
        return "CB"
    if primary == "FW":
        return "ST"
    if primary == "MF":
        return "CM"
    return "UNK"

# NOTE: GK/CB/ST/CM are separable from the position string alone.
# FB / DM / W require extra signal (e.g. take-on volume, crossing, defensive share).
# refine_roles() below does a light heuristic pass; replace with better logic
# when you have positional minutes.

def refine_roles(df: pd.DataFrame) -> pd.DataFrame:
    """Heuristic second pass to split DF->FB, MF->DM, FW->W using behaviour."""
    df = df.copy()
    # Defenders with high crossing/carrying look like fullbacks
    if {"crosses_into_box_per90", "progressive_carries_per90"}.issubset(df.columns):
        fb_mask = (df["role"] == "CB") & (
            df["crosses_into_box_per90"].fillna(0) > df["crosses_into_box_per90"].fillna(0).median()
        )
        df.loc[fb_mask, "role"] = "FB"
    # Midfielders with high recoveries + low xA look like DMs
    if {"ball_recoveries_per90", "xa_per90"}.issubset(df.columns):
        dm_mask = (df["role"] == "CM") & (
            df["ball_recoveries_per90"].fillna(0) > df["ball_recoveries_per90"].fillna(0).median()
        ) & (df["xa_per90"].fillna(0) < df["xa_per90"].fillna(0).median())
        df.loc[dm_mask, "role"] = "DM"
    # Forwards with high take-ons + carries look like wingers
    if {"take_ons_won_per90", "progressive_carries_per90"}.issubset(df.columns):
        w_mask = (df["role"] == "ST") & (
            df["take_ons_won_per90"].fillna(0) > df["take_ons_won_per90"].fillna(0).median()
        )
        df.loc[w_mask, "role"] = "W"
    return df

# ---------------------------------------------------------------------------
# 3. LEAGUE STRENGTH MULTIPLIERS
# ---------------------------------------------------------------------------
# A progressive pass in Belgium != one in the Premier League. These are rough
# starting multipliers (PL = 1.00 baseline). The PRINCIPLED way to set these is
# empirically: track players who transferred between leagues and measure how
# their underlying numbers changed. Start here, refine with transfer data.

LEAGUE_STRENGTH = {
    "ENG-Premier League": 1.00,
    "ESP-La Liga":         0.95,
    "ITA-Serie A":         0.93,
    "GER-Bundesliga":      0.93,
    "FRA-Ligue 1":         0.88,
    "POR-Primeira Liga":   0.75,
    "NED-Eredivisie":      0.72,
    "BEL-Pro League":      0.70,
}

# ---------------------------------------------------------------------------
# 4. SCORING ENGINE
# ---------------------------------------------------------------------------

def zscore_within_role(df: pd.DataFrame, season_col="season") -> pd.DataFrame:
    """Z-score every framework metric within (role, season). Higher = better
    relative to positional peers that season. Handles negative-weight metrics
    by leaving the sign to the weighting step."""
    df = df.copy()
    all_metrics = sorted({m for role in POSITION_FRAMEWORK.values() for m in role})
    for m in all_metrics:
        if m not in df.columns:
            df[m] = np.nan
        z_col = f"z_{m}"
        df[z_col] = (
            df.groupby(["role", season_col])[m]
              .transform(_zscore_series)
        )
    return df


def _zscore_series(s: pd.Series) -> pd.Series:
    std = s.std(ddof=0)
    if pd.isna(std) or std == 0:
        return pd.Series(0.0, index=s.index)
    return (s - s.mean()) / std

def player_role_score(df: pd.DataFrame) -> pd.DataFrame:
    """Combine metric z-scores into one score per player using role weights."""
    df = df.copy()
    df["player_score"] = 0.0
    for role, weights in POSITION_FRAMEWORK.items():
        mask = df["role"] == role
        if not mask.any():
            continue
        score = pd.Series(0.0, index=df.index[mask])
        for metric, w in weights.items():
            z_col = f"z_{metric}"
            if z_col in df.columns:
                score = score + w * df.loc[mask, z_col].fillna(0.0)
        df.loc[mask, "player_score"] = score.values
    return df

def apply_league_adjustment(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["league_mult"] = df["league"].map(LEAGUE_STRENGTH).fillna(0.65)  # unknown leagues discounted
    df["adj_player_score"] = df["player_score"] * df["league_mult"]
    return df

def aggregate_to_squad(df: pd.DataFrame, min_minutes=270) -> pd.DataFrame:
    """Roll player scores up to a team-season squad score.

    Weighted by minutes (a great cameo shouldn't count like a full season).
    min_minutes filters out tiny samples whose z-scores are noise.
    Squad score = minutes-weighted mean of adjusted player scores.
    """
    d = df[df["minutes"].fillna(0) >= min_minutes].copy()
    def wavg(g):
        w = g["minutes"]
        return np.average(g["adj_player_score"], weights=w) if w.sum() > 0 else np.nan
    squad = (
        d.groupby(["league", "season", "team"], group_keys=False)
         .apply(wavg)
         .reset_index(name="squad_score")
    )
    return squad

# ---------------------------------------------------------------------------
# 5. ORCHESTRATION
# ---------------------------------------------------------------------------

def build_squad_scores(player_df: pd.DataFrame, min_minutes=270) -> pd.DataFrame:
    """Full pipeline: raw player per-90 stats -> squad scores per team-season.

    Expects player_df columns: player, team, league, season, position, minutes,
    plus whatever framework metrics are available (missing ones treated as NaN).
    """
    df = player_df.copy()
    df["role"] = df["position"].apply(map_position)
    df = refine_roles(df)
    df = df[df["role"] != "UNK"]
    df = zscore_within_role(df)
    df = player_role_score(df)
    df = apply_league_adjustment(df)
    return aggregate_to_squad(df, min_minutes=min_minutes)


if __name__ == "__main__":
    print("Framework roles:", list(POSITION_FRAMEWORK.keys()))
    print("Leagues configured:", list(LEAGUE_STRENGTH.keys()))
