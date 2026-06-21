"""
data_loaders.py
===============
Two interchangeable sources, same output schema, so the model code never
changes between testing and production.

Output schema (one row per player-team-season):
  player, team, league, season, position, minutes, + metric columns

--- REAL DATA ---
load_understat(leagues, seasons)  — recommended for Big-5 leagues. Pulls xG/xA
    from Understat and enriches with FBref misc/keeper stats (tackles,
    interceptions, crosses, save %) computed per 90 using each player's minutes.

load_fbref(leagues, seasons)  — FBref-only loader. Basic counting stats per 90;
    no Understat xG. Advanced Opta metrics were removed from FBref in 2026.

--- SYNTHETIC DATA (works anywhere) ---
make_synthetic(...) fabricates realistic player rows so you can confirm the
pipeline math end-to-end without network access.
"""

from __future__ import annotations

import re

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

MERGE_KEYS = ["league", "season", "team", "player"]

DEFAULT_UNDERSTAT_LEAGUES = [
    "ENG-Premier League",
    "ESP-La Liga",
    "ITA-Serie A",
    "GER-Bundesliga",
    "FRA-Ligue 1",
]

DEFAULT_FBREF_LEAGUES = [
    "Big 5 European Leagues Combined",
    "ENG-Premier League",
    "ESP-La Liga",
    "ITA-Serie A",
    "GER-Bundesliga",
    "FRA-Ligue 1",
]

DEFAULT_SEASONS = ["2122", "2223", "2324", "2425"]


# ---------------------------------------------------------------------------
# SHARED HELPERS
# ---------------------------------------------------------------------------

def _normalize_position(pos) -> str:
    """Map Understat / FBref position strings to the tags map_position() expects."""
    if not isinstance(pos, str) or not pos.strip():
        return "UNK"
    token = pos.strip().upper().split(",")[0].split()[0]
    return {
        "GK": "GK",
        "DF": "DF", "D": "DF",
        "MF": "MF", "M": "MF", "S": "MF",
        "FW": "FW", "F": "FW",
    }.get(token, "UNK")


def _per90(total: pd.Series, nineties: pd.Series) -> pd.Series:
    n = pd.to_numeric(nineties, errors="coerce").replace(0, np.nan)
    return pd.to_numeric(total, errors="coerce") / n


def _parse_score(score: str) -> tuple[int, int]:
    """Parse FBref score strings like '2–1' or '2-1'."""
    if not isinstance(score, str) or not score.strip():
        raise ValueError("empty score")
    parts = re.split(r"[\u2013\u2014-]", score.strip())
    if len(parts) != 2:
        raise ValueError(f"unparseable score: {score!r}")
    return int(parts[0]), int(parts[1])


def _points_from_results(rows: list[dict]) -> pd.DataFrame:
    pts = pd.DataFrame(rows)
    if pts.empty:
        return pd.DataFrame(columns=["league", "season", "team", "points"])
    return (
        pts.groupby(["league", "season", "team"], as_index=False)["points"]
        .sum()
        .astype({"points": float})
    )


def _normalize_season(season) -> str:
    """Convert soccerdata season codes to end-year strings ('2024')."""
    s = str(season).strip()
    if "." in s and s.replace(".", "", 1).isdigit():
        s = str(int(float(s)))
    if len(s) == 4 and s.isdigit():
        start_yy, end_yy = int(s[:2]), int(s[2:])
        if (start_yy + 1) % 100 == end_yy:
            end = 2000 + end_yy if end_yy < 70 else 1900 + end_yy
            return str(end)
        year = int(s)
        if 1990 <= year <= 2035:
            return s
    return s


def _ensure_metric_cols(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for col in METRIC_COLS:
        if col not in out.columns:
            out[col] = np.nan
    return out


def _fbref_tuple(df: pd.DataFrame, group: str, stat: str):
    """Read a column from a reset-indexed FBref frame with MultiIndex columns."""
    for key in ((group, stat), (group, ""), (stat, "")):
        if key in df.columns:
            return df[key]
    return None


def _minutes_to_nineties(minutes: pd.Series) -> pd.Series:
    return pd.to_numeric(minutes, errors="coerce") / 90.0


def _totals_to_per90(totals: pd.Series, minutes: pd.Series) -> pd.Series:
    return _per90(totals, _minutes_to_nineties(minutes))


def _load_fbref_misc_totals(
    leagues: list[str],
    seasons: list[str],
) -> pd.DataFrame:
    """Fetch raw FBref misc + keeper counting stats (not yet per 90)."""
    import soccerdata as sd

    # One combined scrape is much faster for the Big 5.
    fb_leagues = (
        ["Big 5 European Leagues Combined"]
        if set(leagues) <= set(DEFAULT_UNDERSTAT_LEAGUES)
        else leagues
    )

    fb = sd.FBref(leagues=fb_leagues, seasons=seasons)
    misc = fb.read_player_season_stats(stat_type="misc").reset_index()
    misc["season"] = misc["season"].map(_normalize_season)
    keeper = fb.read_player_season_stats(stat_type="keeper").reset_index()
    keeper["season"] = keeper["season"].map(_normalize_season)

    misc_df = pd.DataFrame({
        "league": misc[("league", "")],
        "season": misc["season"],
        "team": misc[("team", "")],
        "player": misc[("player", "")],
        "_int": pd.to_numeric(_fbref_tuple(misc, "Performance", "Int"), errors="coerce"),
        "_tklw": pd.to_numeric(_fbref_tuple(misc, "Performance", "TklW"), errors="coerce"),
        "_crs": pd.to_numeric(_fbref_tuple(misc, "Performance", "Crs"), errors="coerce"),
        "_fld": pd.to_numeric(_fbref_tuple(misc, "Performance", "Fld"), errors="coerce"),
    })
    keep_df = pd.DataFrame({
        "league": keeper[("league", "")],
        "season": keeper["season"],
        "team": keeper[("team", "")],
        "player": keeper[("player", "")],
        "_save_pct": pd.to_numeric(_fbref_tuple(keeper, "Performance", "Save%"), errors="coerce"),
    })
    return misc_df.merge(keep_df, on=MERGE_KEYS, how="left")


def _enrich_with_fbref_misc(players: pd.DataFrame, misc_totals: pd.DataFrame) -> pd.DataFrame:
    """Merge FBref misc totals and derive per-90 metrics using each row's minutes."""
    merged = players.merge(misc_totals, on=MERGE_KEYS, how="left")
    m90 = _minutes_to_nineties(merged["minutes"]).replace(0, np.nan)

    derived = {
        "interceptions_per90": merged["_int"] / m90,
        "tackles_plus_int_per90": (merged["_int"] + merged["_tklw"]) / m90,
        "crosses_into_box_per90": merged["_crs"] / m90,
        # Fouls drawn as a rough dribble/carry involvement proxy for role refinement.
        "take_ons_won_per90": merged["_fld"] / m90,
        "save_pct": merged["_save_pct"],
    }
    for col, values in derived.items():
        if col not in merged.columns:
            merged[col] = values
        else:
            merged[col] = merged[col].fillna(values)

    drop_cols = [c for c in merged.columns if c.startswith("_")]
    return merged.drop(columns=drop_cols)


# ---------------------------------------------------------------------------
# UNDERSTAT (recommended for Big-5 xG/xA metrics)
# ---------------------------------------------------------------------------

def load_understat(
    leagues: list[str] | None = None,
    seasons: list[str] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Pull player stats + league-table points from Understat via soccerdata.

    Covers the Big-5 European leagues only. Returns the same schema as
    make_synthetic() so the rest of the pipeline is unchanged.
    """
    import soccerdata as sd

    leagues = leagues or DEFAULT_UNDERSTAT_LEAGUES
    seasons = seasons or DEFAULT_SEASONS

    us = sd.Understat(leagues=leagues, seasons=seasons)
    raw = us.read_player_season_stats(force_cache=True).reset_index()
    raw["season"] = raw["season"].map(_normalize_season)

    m90 = pd.to_numeric(raw["minutes"], errors="coerce") / 90.0
    m90 = m90.replace(0, np.nan)
    minutes = pd.to_numeric(raw["minutes"], errors="coerce")
    shots = pd.to_numeric(raw["shots"], errors="coerce").replace(0, np.nan)
    np_xg = pd.to_numeric(raw["np_xg"], errors="coerce")
    xa = pd.to_numeric(raw["xa"], errors="coerce")
    np_goals = pd.to_numeric(raw["np_goals"], errors="coerce")
    key_passes = pd.to_numeric(raw["key_passes"], errors="coerce")

    players = pd.DataFrame({
        "player": raw["player"],
        "team": raw["team"],
        "league": raw["league"],
        "season": raw["season"],
        "position": raw["position"].map(_normalize_position),
        "minutes": minutes,
        "npxg_per90": np_xg / m90,
        "xa_per90": xa / m90,
        "npxg_plus_xa_per90": (np_xg + xa) / m90,
        "npxg_per_shot": np_xg / shots,
        "goals_minus_xg_per90": (np_goals - np_xg) / m90,
        "key_passes_per100": key_passes / minutes.replace(0, np.nan) * 100.0,
    })
    players = _ensure_metric_cols(players)

    print("  Enriching with FBref misc/keeper stats (per 90 from minutes)...")
    try:
        misc_totals = _load_fbref_misc_totals(leagues, seasons)
        before = players["interceptions_per90"].notna().sum()
        players = _enrich_with_fbref_misc(players, misc_totals)
        after = players["interceptions_per90"].notna().sum()
        print(f"  FBref misc matched: {after:,}/{len(players):,} rows with interceptions_per90 "
              f"(was {before:,})")
    except Exception as exc:
        print(f"  Warning: FBref misc enrichment skipped ({exc})")

    points = _understat_points(us)
    return players, points


def _understat_points(us) -> pd.DataFrame:
    sched = us.read_schedule(force_cache=True).reset_index()
    sched = sched[sched["is_result"] == True]  # noqa: E712
    rows = []
    for _, r in sched.iterrows():
        hg = r["home_goals"]
        ag = r["away_goals"]
        if pd.isna(hg) or pd.isna(ag):
            continue
        league, season, ht, at = r["league"], _normalize_season(r["season"]), r["home_team"], r["away_team"]
        if hg > ag:
            hp, ap = 3, 0
        elif hg < ag:
            hp, ap = 0, 3
        else:
            hp, ap = 1, 1
        rows.append({"league": league, "season": season, "team": ht, "points": hp})
        rows.append({"league": league, "season": season, "team": at, "points": ap})
    return _points_from_results(rows)


# ---------------------------------------------------------------------------
# FBREF (broader leagues; basic stats only since Opta data was removed)
# ---------------------------------------------------------------------------

def load_fbref(
    leagues: list[str] | None = None,
    seasons: list[str] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Pull player stats + league-table points from FBref via soccerdata.

    Note: FBref no longer publishes advanced StatsBomb/Opta metrics (xG,
    progressive passes, pressures, etc.) as of early 2026. This loader maps
    the basic stats that remain. Prefer load_understat() for Big-5 leagues.
    """
    import soccerdata as sd

    leagues = leagues or DEFAULT_FBREF_LEAGUES
    seasons = seasons or DEFAULT_SEASONS

    fb = sd.FBref(leagues=leagues, seasons=seasons)
    frames = {
        "standard": fb.read_player_season_stats(stat_type="standard"),
        "shooting": fb.read_player_season_stats(stat_type="shooting"),
        "keeper": fb.read_player_season_stats(stat_type="keeper"),
        "misc": fb.read_player_season_stats(stat_type="misc"),
    }
    players = _tidy_and_merge(frames)
    points = _fbref_points(fb)
    return players, points


def _tidy_and_merge(frames: dict) -> pd.DataFrame:
    """Flatten + rename + merge FBref stat tables into the canonical schema."""
    std = frames["standard"].reset_index()
    std["season"] = std["season"].map(_normalize_season)

    base = pd.DataFrame({
        "league": std[("league", "")],
        "season": std["season"],
        "team": std[("team", "")],
        "player": std[("player", "")],
        "position": std[("pos", "")].map(_normalize_position),
        "minutes": pd.to_numeric(_fbref_tuple(std, "Playing Time", "Min"), errors="coerce"),
        "_90s": pd.to_numeric(_fbref_tuple(std, "Playing Time", "90s"), errors="coerce"),
    })

    misc = frames["misc"].reset_index()
    misc["season"] = misc["season"].map(_normalize_season)
    ints = pd.to_numeric(_fbref_tuple(misc, "Performance", "Int"), errors="coerce")
    tklw = pd.to_numeric(_fbref_tuple(misc, "Performance", "TklW"), errors="coerce")
    crs = pd.to_numeric(_fbref_tuple(misc, "Performance", "Crs"), errors="coerce")
    fld = pd.to_numeric(_fbref_tuple(misc, "Performance", "Fld"), errors="coerce")
    misc_metrics = pd.DataFrame({
        "league": misc[("league", "")],
        "season": misc["season"],
        "team": misc[("team", "")],
        "player": misc[("player", "")],
        "_int": ints,
        "_tklw": tklw,
        "_crs": crs,
        "_fld": fld,
    })

    keep = frames["keeper"].reset_index()
    keep["season"] = keep["season"].map(_normalize_season)
    keep_metrics = pd.DataFrame({
        "league": keep[("league", "")],
        "season": keep["season"],
        "team": keep[("team", "")],
        "player": keep[("player", "")],
        "save_pct": pd.to_numeric(_fbref_tuple(keep, "Performance", "Save%"), errors="coerce"),
    })

    shoot = frames["shooting"].reset_index()
    shoot["season"] = shoot["season"].map(_normalize_season)
    g_sh = pd.to_numeric(_fbref_tuple(shoot, "Standard", "G/Sh"), errors="coerce")
    shoot_metrics = pd.DataFrame({
        "league": shoot[("league", "")],
        "season": shoot["season"],
        "team": shoot[("team", "")],
        "player": shoot[("player", "")],
        # Closest available proxy; true npxG/shot is no longer on FBref.
        "npxg_per_shot": g_sh,
    })

    merged = base.drop(columns=["_90s"])
    merged = merged.merge(misc_metrics, on=MERGE_KEYS, how="left")
    m90 = _minutes_to_nineties(merged["minutes"]).replace(0, np.nan)
    merged["interceptions_per90"] = merged["_int"] / m90
    merged["tackles_plus_int_per90"] = (merged["_int"] + merged["_tklw"]) / m90
    merged["crosses_into_box_per90"] = merged["_crs"] / m90
    merged["take_ons_won_per90"] = merged["_fld"] / m90
    merged = merged.drop(columns=[c for c in merged.columns if c.startswith("_")])

    for extra in (keep_metrics, shoot_metrics):
        merged = merged.merge(extra, on=MERGE_KEYS, how="left")

    return _ensure_metric_cols(merged)


def _fbref_points(fb) -> pd.DataFrame:
    sched = fb.read_schedule(force_cache=True).reset_index()
    rows = []
    for _, r in sched.iterrows():
        try:
            home, away = _parse_score(r["score"])
        except (ValueError, TypeError):
            continue
        league, season, ht, at = r["league"], _normalize_season(r["season"]), r["home_team"], r["away_team"]
        if home > away:
            hp, ap = 3, 0
        elif home < away:
            hp, ap = 0, 3
        else:
            hp, ap = 1, 1
        rows.append({"league": league, "season": season, "team": ht, "points": hp})
        rows.append({"league": league, "season": season, "team": at, "points": ap})
    return _points_from_results(rows)


# ---------------------------------------------------------------------------
# SYNTHETIC GENERATOR  (works offline; validates the pipeline)
# ---------------------------------------------------------------------------

POSITION_POOL = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"]


def make_synthetic(n_teams=20, seasons=("2021", "2022", "2023", "2024", "2025"),
                   league="ENG-Premier League", seed=7):
    """Fabricate player-season rows with a KNOWN latent team-quality signal."""
    rng = np.random.default_rng(seed)
    teams = [f"Team_{i:02d}" for i in range(n_teams)]
    base_quality = {t: rng.normal(0, 1) for t in teams}

    rows = []
    for season in seasons:
        for t in teams:
            q = base_quality[t] + rng.normal(0, 0.25)
            for pos in POSITION_POOL:
                minutes = float(rng.integers(300, 3000))
                row = {
                    "player": f"{t}_{pos}_{rng.integers(0, 9999)}",
                    "team": t, "league": league, "season": season,
                    "position": pos, "minutes": minutes,
                    "_true_quality": q,
                }
                for m in METRIC_COLS:
                    baseline = _metric_baseline(m, pos)
                    row[m] = baseline + 0.6 * q * _metric_scale(m) + rng.normal(0, _metric_scale(m))
                rows.append(row)
    players = pd.DataFrame(rows)

    pts_rows = []
    for season in seasons:
        for t in teams:
            q = players[(players.team == t) & (players.season == season)]["_true_quality"].mean()
            points = 52 + 12 * q + rng.normal(0, 4)
            pts_rows.append({
                "team": t, "league": league, "season": season,
                "points": float(np.clip(points, 18, 98)),
            })
    points_df = pd.DataFrame(pts_rows)
    return players, points_df


def _metric_baseline(metric, pos):
    if metric == "save_pct":
        return 70 if pos == "GK" else 0
    if metric == "psxg_plus_minus_per90":
        return 0.0
    if "pct" in metric:
        return 50
    if "completion" in metric:
        return 80
    return 1.0


def _metric_scale(metric):
    if "pct" in metric or "completion" in metric:
        return 6.0
    return 0.4


if __name__ == "__main__":
    players, points = make_synthetic()
    print("players:", players.shape, "| points:", points.shape)
    print(players[["player", "team", "season", "position", "minutes"]].head())
