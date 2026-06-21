"""
pull_bundesliga_forwards.py
===========================
Phase 1 — Bundesliga forward/winger panel (study only).

Combines:
  - FBref  → crosses, SoT, fouls drawn, etc. (free, post-2026 basic tables)
  - Understat → npxG, xA, key passes, xG chain/buildup (free, Bundesliga)
  - SoFIFA → EA FC / FIFA overall, potential, value (Bundesliga launch roster per season)

NO composite, NO breakout label, NO similarity model, NO ML.

Usage (from backend/, venv active):
    pip install soccerdata pandas numpy
    python pull_bundesliga_forwards.py              # combined pull
    python pull_bundesliga_forwards.py --fbref-only
    python pull_bundesliga_forwards.py --no-sofifa  # skip SoFIFA (needs Chrome)
    python pull_bundesliga_forwards.py --full-careers  # all Big-5 seasons for CSV players
    python pull_bundesliga_forwards.py --merge-sofifa-only  # apply cached FC ratings to CSV
    python pull_bundesliga_forwards.py --merge-sofifa-only --sofifa-fetch  # resume FC scrape
    python pull_bundesliga_forwards.py --inspect    # print FBref column names

Output:
    bundesliga_forwards.csv

Dribbles / take-ons: NOT on Understat or current FBref. See DRIBBLE_SOURCES below.
"""

from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from career_panel import (
    BIG5_LEAGUES,
    filter_to_cohort,
    load_player_cohort,
    preserve_side_review,
    tag_bundesliga_rows,
)
from sofifa_enrichment import merge_sofifa, merge_sofifa_into_csv, pull_sofifa_ratings

LEAGUE = "GER-Bundesliga"
# FBref season string = calendar year the season ENDS ("2018" = 2017-18 … "2025" = 2024-25)
SEASONS = ["2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"]

MERGE_KEYS = ["player", "team", "season_end_year", "league"]

DRIBBLE_SOURCES = """
Dribbles / successful take-ons (NOT in this CSV today):
  - Understat: no dribble or take-on fields
  - FBref: removed with advanced stats (~2026)
  - Free workaround here: fouls_drawn_per90 (FBref misc) — weak dribble proxy
  - Paid options with season totals you can ÷ minutes:
      * API-Football  — player stats include 'dribbles' (attempted) on many leagues
      * Sportmonks    — dribbles / take-ons on higher plans (verify on trial)
      * Wyscout/Opta  — gold standard for scouting
  SCA90 / progressive carries: same story — paid Opta-family sources only.
"""

MERGE_KEYS_FBREF = ["player", "team", "season", "league"]


def _normalize_season(season) -> int:
    """End calendar year of the season.

    FBref / soccerdata may use:
      - end year only: '2020' (2019-20)
      - paired code:   '1920' (2019-20), '2425' (2024-25)
    """
    s = str(season).strip()
    if "." in s and s.replace(".", "", 1).isdigit():
        s = str(int(float(s)))
    if len(s) == 4 and s.isdigit():
        start_yy, end_yy = int(s[:2]), int(s[2:])
        # Understat-style: first two digits = start year mod 100, last two = end year mod 100
        if (start_yy + 1) % 100 == end_yy:
            return 2000 + end_yy if end_yy < 70 else 1900 + end_yy
        year = int(s)
        if 1990 <= year <= 2035:
            return year
    return int(float(s))


def _fbref_to_understat_seasons(fbref_seasons: list[str]) -> list[str]:
    """Map FBref end-year codes ('2024') to Understat ('2324')."""
    codes = []
    for s in fbref_seasons:
        end = _normalize_season(s)
        codes.append(f"{(end - 1) % 100:02d}{end % 100:02d}")
    return codes


def _flat_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [
        "__".join(str(c) for c in col if str(c)).strip()
        if isinstance(col, tuple)
        else str(col)
        for col in out.columns
    ]
    return out.reset_index()


def pull_fbref_raw(leagues: list[str] | str = LEAGUE):
    import soccerdata as sd

    fb = sd.FBref(leagues=leagues, seasons=SEASONS)
    return {
        "standard": fb.read_player_season_stats(stat_type="standard"),
        "shooting": fb.read_player_season_stats(stat_type="shooting"),
        "misc": fb.read_player_season_stats(stat_type="misc"),
    }


def pull_understat_raw(leagues: list[str] | str = LEAGUE):
    import soccerdata as sd

    us_seasons = _fbref_to_understat_seasons(SEASONS)
    us = sd.Understat(leagues=leagues, seasons=us_seasons)
    return us.read_player_season_stats(force_cache=True).reset_index()


def _pick(df: pd.DataFrame, colmap: dict[str, str], label: str) -> pd.DataFrame:
    have = {k: v for k, v in colmap.items() if v in df.columns}
    missing = [v for v in colmap.values() if v not in df.columns]
    if missing:
        print(f"  [warn] {label}: columns not found — adjust map: {missing}")
    out = df[list(have.values())].copy()
    out.columns = list(have.keys())
    return out


def tidy_fbref(frames: dict[str, pd.DataFrame]) -> pd.DataFrame:
    s = _flat_columns(frames["standard"])
    sh = _flat_columns(frames["shooting"])
    m = _flat_columns(frames["misc"])

    S_COLS = {
        "league": "league", "player": "player", "team": "team", "season": "season",
        "pos": "pos", "age": "age",
        "minutes": "Playing Time__Min", "nineties": "Playing Time__90s",
        "goals_per90": "Per 90 Minutes__G-PK",
        "assists_per90": "Per 90 Minutes__Ast",
        "ga_per90": "Per 90 Minutes__G+A-PK",
    }
    SH_COLS = {
        "league": "league", "player": "player", "team": "team", "season": "season",
        "shots_per90": "Standard__Sh/90",
        "sot_per90": "Standard__SoT/90",
        "g_per_sh": "Standard__G/Sh",
    }
    M_COLS = {
        "league": "league", "player": "player", "team": "team", "season": "season",
        "crosses": "Performance__Crs",
        "fouls_drawn": "Performance__Fld",
        "fouls_committed": "Performance__Fls",
        "offsides": "Performance__Off",
        "misc_90s": "90s",
    }

    panel = (
        _pick(s, S_COLS, "standard")
        .merge(_pick(sh, SH_COLS, "shooting"), on=MERGE_KEYS_FBREF, how="left")
        .merge(_pick(m, M_COLS, "misc"), on=MERGE_KEYS_FBREF, how="left")
    )

    n = panel.get("misc_90s", panel["nineties"]).replace(0, np.nan)
    n = n.fillna(panel["nineties"].replace(0, np.nan))
    for raw, name in [
        ("crosses", "crosses_per90"),
        ("fouls_drawn", "fouls_drawn_per90"),
        ("fouls_committed", "fouls_committed_per90"),
        ("offsides", "offsides_per90"),
    ]:
        if raw in panel.columns:
            panel[name] = pd.to_numeric(panel[raw], errors="coerce") / n

    panel["season_end_year"] = panel["season"].map(_normalize_season)
    drop = [c for c in ("crosses", "fouls_drawn", "fouls_committed", "offsides", "misc_90s") if c in panel.columns]
    return panel.drop(columns=drop)


def tidy_understat(raw: pd.DataFrame) -> pd.DataFrame:
    """Season totals + per-90 from Understat minutes (separate columns for study)."""
    raw = raw.copy()
    raw["season_end_year"] = raw["season"].map(_normalize_season)
    minutes = pd.to_numeric(raw["minutes"], errors="coerce")
    m90 = (minutes / 90.0).replace(0, np.nan)

    out = pd.DataFrame({
        "player": raw["player"],
        "team": raw["team"],
        "league": raw["league"],
        "season_end_year": raw["season_end_year"],
        "us_position": raw["position"],
        "us_minutes": minutes,
        # --- season totals (study distributions / roll your own per90) ---
        "npxg": pd.to_numeric(raw["np_xg"], errors="coerce"),
        "xg": pd.to_numeric(raw["xg"], errors="coerce"),
        "xa": pd.to_numeric(raw["xa"], errors="coerce"),
        "np_goals": pd.to_numeric(raw["np_goals"], errors="coerce"),
        "goals_us": pd.to_numeric(raw["goals"], errors="coerce"),
        "key_passes": pd.to_numeric(raw["key_passes"], errors="coerce"),
        "shots_us": pd.to_numeric(raw["shots"], errors="coerce"),
        "xg_chain": pd.to_numeric(raw["xg_chain"], errors="coerce"),
        "xg_buildup": pd.to_numeric(raw["xg_buildup"], errors="coerce"),
    })
    # --- per 90 (explicit; minutes from Understat) ---
    out["npxg_per90"] = out["npxg"] / m90
    out["xa_per90"] = out["xa"] / m90
    out["npxg_xa_per90"] = (out["npxg"] + out["xa"]) / m90
    out["key_passes_per90"] = out["key_passes"] / m90
    out["key_passes_per100"] = out["key_passes"] / minutes.replace(0, np.nan) * 100.0
    out["goals_minus_npxg"] = out["np_goals"] - out["npxg"]
    out["goals_minus_npxg_per90"] = out["goals_minus_npxg"] / m90
    out["npxg_per_shot"] = out["npxg"] / pd.to_numeric(raw["shots"], errors="coerce").replace(0, np.nan)
    return out


def merge_fbref_understat(fbref: pd.DataFrame, understat: pd.DataFrame) -> pd.DataFrame:
    """Left join FBref panel with Understat on player + team + season_end_year."""
    merged = fbref.merge(understat, on=MERGE_KEYS, how="left", suffixes=("", "_usdup"))
    matched = merged["npxg"].notna().sum()
    print(f"  Understat matched on {MERGE_KEYS}: {matched:,}/{len(merged):,} rows")
    if matched < len(merged) * 0.5:
        print("  [warn] Low match rate — check team name spelling (e.g. M'gladbach vs Monchengladbach)")
    return merged


def filter_forwards(panel: pd.DataFrame) -> pd.DataFrame:
    pos = panel["pos"].fillna("")
    us_fwd = panel.get("us_position", pd.Series("", index=panel.index)).fillna("").str.contains(r"\bF\b|^F", regex=True)
    return panel[pos.str.contains("FW", case=False) | us_fwd].copy()


def flag_likely_wingers(fwd: pd.DataFrame, min_90s: float = 8) -> pd.DataFrame:
    nineties = fwd["nineties"].fillna(fwd.get("us_minutes", 0) / 90.0)
    d = fwd[nineties.fillna(0) >= min_90s].copy()
    proxy_cols = [
        c for c in (
            "crosses_per90", "fouls_drawn_per90", "sot_per90",
            "npxg_xa_per90", "take_ons_succ_per90",  # take_ons if you add paid source later
        )
        if c in d.columns and d[c].notna().any()
    ]
    for c in proxy_cols:
        std = d[c].std(ddof=0)
        d[c + "_z"] = (d[c] - d[c].mean()) / std if std > 0 else 0.0
    z_cols = [c for c in d.columns if c.endswith("_z")]
    d["winger_score"] = d[z_cols].mean(axis=1) if z_cols else np.nan
    d["likely_winger"] = d["winger_score"] > 0
    d["side_review"] = ""
    return d.sort_values("winger_score", ascending=False, na_position="last")


def stability_report(panel: pd.DataFrame, stats: list[str]) -> pd.DataFrame:
    rows = []
    d = panel.sort_values(["player", "season_end_year"])
    for stat in stats:
        if stat not in d.columns:
            continue
        cur, nxt = [], []
        for _, g in d.groupby("player"):
            g = g.sort_values("season_end_year")
            vals = g[stat].to_numpy(dtype=float)
            yrs = g["season_end_year"].to_numpy()
            for i in range(len(g) - 1):
                if yrs[i + 1] - yrs[i] == 1 and np.isfinite(vals[i]) and np.isfinite(vals[i + 1]):
                    cur.append(vals[i])
                    nxt.append(vals[i + 1])
        if len(cur) > 10:
            r = float(np.corrcoef(cur, nxt)[0, 1])
            rows.append({"stat": stat, "yoy_correlation": round(r, 3), "n_pairs": len(cur)})
    return pd.DataFrame(rows).sort_values("yoy_correlation", ascending=False)


def inspect_columns(frames: dict[str, pd.DataFrame]) -> None:
    for name, df in frames.items():
        flat = _flat_columns(df)
        print(f"\n=== {name} ({flat.shape[0]} rows, {flat.shape[1]} cols) ===")
        for c in flat.columns:
            print(f"  {c!r}")


def _parse_sofifa_seasons_arg(argv: list[str]) -> list[int] | None:
    for i, arg in enumerate(argv):
        if arg == "--sofifa-seasons" and i + 1 < len(argv):
            return [int(s.strip()) for s in argv[i + 1].split(",") if s.strip()]
    return None


def build_career_panel(
    cohort: set[str],
    *,
    fbref_only: bool = False,
    no_sofifa: bool = False,
) -> pd.DataFrame:
    """All Big-5 player-season rows for players in the study cohort."""
    print(f"  Players in cohort: {len(cohort)}")

    print("1) FBref Big-5 (all leagues in scope)…")
    fbref_panel = filter_to_cohort(tidy_fbref(pull_fbref_raw(BIG5_LEAGUES)), cohort)

    if fbref_only:
        panel = fbref_panel
    else:
        print("2) Understat Big-5…")
        us_panel = filter_to_cohort(tidy_understat(pull_understat_raw(BIG5_LEAGUES)), cohort)
        print("3) Merging FBref + Understat…")
        panel = merge_fbref_understat(fbref_panel, us_panel)

    if not no_sofifa:
        print("4) SoFIFA Big-5 launch rosters…")
        seasons = sorted(panel["season_end_year"].dropna().unique().astype(int).tolist())
        sofifa_panel = pull_sofifa_ratings(seasons, BIG5_LEAGUES)
        print("5) Merging SoFIFA ratings…")
        panel = merge_sofifa(panel, sofifa_panel)

    panel = tag_bundesliga_rows(panel)
    return flag_likely_wingers(panel)


if __name__ == "__main__":
    fbref_only = "--fbref-only" in sys.argv
    no_sofifa = "--no-sofifa" in sys.argv
    full_careers = "--full-careers" in sys.argv
    merge_sofifa_only = "--merge-sofifa-only" in sys.argv
    sofifa_fetch = "--sofifa-fetch" in sys.argv
    sofifa_seasons = _parse_sofifa_seasons_arg(sys.argv)

    if "--inspect" in sys.argv:
        print("Inspecting FBref columns…")
        inspect_columns(pull_fbref_raw())
        sys.exit(0)

    if merge_sofifa_only:
        print("=== Merge SoFIFA into CSV (cached / checkpoint; safe to interrupt) ===\n")
        merge_sofifa_into_csv(
            season_end_years=sofifa_seasons,
            fetch=sofifa_fetch,
        )
        sys.exit(0)

    if full_careers:
        print("=== Full careers: Big-5 seasons for current CSV players ===\n")
        cohort = load_player_cohort()
        flagged = build_career_panel(cohort, fbref_only=fbref_only, no_sofifa=no_sofifa)
        flagged = preserve_side_review(flagged)
    else:
        print("=== Phase 1: Bundesliga forwards panel ===\n")

        print("1) FBref (slow first run; cached locally)…")
        fbref_panel = tidy_fbref(pull_fbref_raw())

        if fbref_only:
            panel = fbref_panel
        else:
            print("2) Understat (fast; Bundesliga xG/xA)…")
            us_panel = tidy_understat(pull_understat_raw())
            print("3) Merging FBref + Understat…")
            panel = merge_fbref_understat(fbref_panel, us_panel)

        if not no_sofifa:
            print("4) SoFIFA (Bundesliga launch roster per season; Chrome + cache)…")
            seasons = sorted(panel["season_end_year"].dropna().unique().astype(int).tolist())
            sofifa_panel = pull_sofifa_ratings(seasons, [LEAGUE])
            print("5) Merging SoFIFA ratings…")
            panel = merge_sofifa(panel, sofifa_panel)

        fwd = filter_forwards(panel)
        flagged = flag_likely_wingers(fwd)
        flagged["in_bundesliga"] = True

    out_path = "bundesliga_forwards.csv"
    flagged.to_csv(out_path, index=False)
    print(f"\nSaved {len(flagged)} player-seasons (≥8 nineties) -> {out_path}")
    if full_careers:
        bl = flagged["in_bundesliga"].sum() if "in_bundesliga" in flagged.columns else 0
        print(f"  Bundesliga rows: {int(bl):,} · other Big-5 rows: {len(flagged) - int(bl):,}")
        print(f"  Unique players: {flagged['player'].nunique()}")
    print(f"  Likely wingers flagged: {int(flagged['likely_winger'].sum())}")

    key_stats = [
        c for c in [
            "npxg_per90", "xa_per90", "npxg_xa_per90", "goals_minus_npxg_per90",
            "key_passes_per90", "key_passes_per100", "xg_chain", "xg_buildup",
            "goals_per90", "assists_per90", "shots_per90", "sot_per90",
            "crosses_per90", "fouls_drawn_per90", "fc_overall", "fc_potential",
        ]
        if c in flagged.columns
    ]
    print("\n=== YoY STABILITY (higher = more persistent season-to-season) ===")
    print(stability_report(flagged, key_stats).to_string(index=False))
    print(DRIBBLE_SOURCES)
    if full_careers:
        print(
            "\nNote: only Big-5 leagues covered (no 2. Bundesliga, Belgium, etc.). "
            "Understat xG fills when the league is in scope."
        )
    else:
        print("\nNext: fill side_review (L/R/central) for likely_winger rows.")
        print("  Or run with --full-careers to add other Big-5 seasons for these players.")
