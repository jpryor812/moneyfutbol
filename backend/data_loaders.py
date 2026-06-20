"""
data_loaders.py
===============
Two interchangeable sources, same output schema, so the model code never
changes between testing and production.

Output schema (one row per player-team-season):
  player, team, league, season, position, minutes, + metric columns

--- REAL DATA (run on your own machine) ---
load_fbref(leagues, seasons) uses the soccerdata library, which scrapes FBref.
FBref has consistent Big-5 advanced stats back to 2017-18. Selling leagues
(Belgium/Netherlands/Portugal) are scraped individually and advanced stats may
be thinner in older seasons -- verify coverage before trusting those rows.

--- SYNTHETIC DATA (works anywhere) ---
make_synthetic(...) fabricates realistic player rows so you can confirm the
pipeline math end-to-end without network access. It deliberately bakes in a
known signal (some teams are genuinely better) plus noise, so the backtest
should recover that signal -- a sanity check on the whole machine.
"""

import numpy as np
import pandas as pd

# Canonical metric columns the model knows about
METRIC_COLS = [
    "psxg_plus_minus_per90", "save_pct", "sweeper_actions_per90", "launch_completion_pct",
    "aerial_win_pct", "pct_dribblers_tackled", "progressive_passes_per90",
    "interceptions_per90", "errors_per90", "progressive_carries_per90",
    "crosses_into_box_per90", "take_ons_won_per90", "tackles_plus_int_per90",
    "xa_per90", "pass_completion_pct", "ball_recoveries_per90", "pressure_regains_per90",
    "shot_creating_actions_per90", "key_passes_per100", "npxg_per90",
    "npxg_plus_xa_per90", "npxg_per_shot", "goals_minus_xg_per90",
]

# ---------------------------------------------------------------------------
# REAL FBREF LOADER
# ---------------------------------------------------------------------------

def load_fbref(leagues, seasons):
    """Pull + assemble player season stats from FBref via soccerdata.

    leagues: list of soccerdata league IDs, e.g.
        ["Big 5 European Leagues Combined", "BEL-Pro League",
         "NED-Eredivisie", "POR-Primeira Liga"]
    seasons: list like ["2021","2022","2023","2024","2025"]
             (season string = calendar year the season ENDS)

    FBref splits stats across "stat_type" tables (standard, passing, defense,
    shooting, gca, possession, keeper_adv). We pull the ones our framework needs
    and merge on player+team+season. Column names below follow FBref's
    MultiIndex layout; print .columns once to confirm exact tuples for your
    soccerdata version, then adjust the rename map.
    """
    import soccerdata as sd

    frames = {}
    fb = sd.FBref(leagues=leagues, seasons=seasons)

    # Each call returns a MultiIndexed DataFrame; flatten + select in _tidy().
    frames["standard"] = fb.read_player_season_stats(stat_type="standard")
    frames["passing"]  = fb.read_player_season_stats(stat_type="passing")
    frames["defense"]  = fb.read_player_season_stats(stat_type="defense")
    frames["shooting"] = fb.read_player_season_stats(stat_type="shooting")
    frames["gca"]      = fb.read_player_season_stats(stat_type="goal_shot_creation")
    frames["poss"]     = fb.read_player_season_stats(stat_type="possession")
    frames["keeper"]   = fb.read_player_season_stats(stat_type="keeper_adv")

    # _tidy() flattens FBref's column MultiIndex and renames to canonical names.
    # Left as a stub with the mapping skeleton -- you fill exact source tuples
    # after one inspection run (FBref column names shift slightly by version).
    merged = _tidy_and_merge(frames)
    return merged


def _tidy_and_merge(frames: dict) -> pd.DataFrame:
    """Flatten + rename + merge the FBref stat tables into the canonical schema.

    IMPLEMENTATION NOTE: FBref columns arrive as MultiIndex tuples like
    ('Expected','xG') or ('Progression','PrgP'). After one run, do:
        print(frames['standard'].columns.tolist())
    then fill RENAME below. Kept explicit (not auto) so you SEE what maps to what
    -- silent column guessing is how these models quietly break.
    """
    raise NotImplementedError(
        "Fill RENAME maps after inspecting FBref columns on your machine. "
        "Skeleton provided; see comments. Use make_synthetic() to test logic now."
    )

# ---------------------------------------------------------------------------
# SYNTHETIC GENERATOR  (works offline; validates the pipeline)
# ---------------------------------------------------------------------------

POSITION_POOL = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"]

def make_synthetic(n_teams=20, seasons=("2021","2022","2023","2024","2025"),
                   league="ENG-Premier League", seed=7):
    """Fabricate player-season rows with a KNOWN latent team-quality signal.

    Each team gets a hidden 'true_quality'. Player metrics are drawn around that
    quality plus noise. Final points (next season) are generated from quality so
    the backtest has something real to recover. If the model works, squad_score
    should correlate with the hidden quality and predict next-season points.
    """
    rng = np.random.default_rng(seed)
    teams = [f"Team_{i:02d}" for i in range(n_teams)]
    # Persistent latent quality per team, with small year-to-year drift
    base_quality = {t: rng.normal(0, 1) for t in teams}

    rows = []
    for s_idx, season in enumerate(seasons):
        for t in teams:
            q = base_quality[t] + rng.normal(0, 0.25)   # drift
            for pos in POSITION_POOL:
                minutes = float(rng.integers(300, 3000))
                row = {
                    "player": f"{t}_{pos}_{rng.integers(0,9999)}",
                    "team": t, "league": league, "season": season,
                    "position": pos, "minutes": minutes,
                    "_true_quality": q,   # leaks for validation only; not used by model
                }
                # Draw each metric around team quality + positional baseline + noise
                for m in METRIC_COLS:
                    baseline = _metric_baseline(m, pos)
                    row[m] = baseline + 0.6 * q * _metric_scale(m) + rng.normal(0, _metric_scale(m))
                rows.append(row)
    players = pd.DataFrame(rows)

    # Build "actual points" per team-season FROM latent quality (+ noise),
    # so we can test prediction. Real pipeline gets points from FBref schedule.
    pts_rows = []
    for season in seasons:
        for t in teams:
            q = players[(players.team==t)&(players.season==season)]["_true_quality"].mean()
            points = 52 + 12*q + rng.normal(0, 4)        # ~40-64 pt spread
            pts_rows.append({"team": t, "league": league, "season": season,
                             "points": float(np.clip(points, 18, 98))})
    points_df = pd.DataFrame(pts_rows)
    return players, points_df


def _metric_baseline(metric, pos):
    """Rough positional baseline so metrics aren't nonsense (e.g. GKs save_pct)."""
    if metric == "save_pct":            return 70 if pos == "GK" else 0
    if metric == "psxg_plus_minus_per90": return 0.0
    if "pct" in metric:                 return 50
    if "completion" in metric:          return 80
    return 1.0

def _metric_scale(metric):
    if "pct" in metric or "completion" in metric: return 6.0
    return 0.4


if __name__ == "__main__":
    players, points = make_synthetic()
    print("players:", players.shape, "| points:", points.shape)
    print(players[["player","team","season","position","minutes"]].head())
