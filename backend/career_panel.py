"""Expand study cohort to full Big-5 career rows per player."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from sofifa_enrichment import norm_name

BIG5_LEAGUES = [
    "ENG-Premier League",
    "ESP-La Liga",
    "ITA-Serie A",
    "GER-Bundesliga",
    "FRA-Ligue 1",
]


def load_player_cohort(csv_path: str | Path = "bundesliga_forwards.csv") -> set[str]:
    """Normalized player names from the current study CSV."""
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found — run pull_bundesliga_forwards.py once to seed the cohort."
        )
    df = pd.read_csv(path)
    return set(df["player"].dropna().map(norm_name).unique())


def filter_to_cohort(panel: pd.DataFrame, cohort: set[str]) -> pd.DataFrame:
    out = panel[panel["player"].map(norm_name).isin(cohort)].copy()
    print(f"  Cohort filter: {len(out):,} rows for {len(cohort)} players")
    return out


def preserve_side_review(
    panel: pd.DataFrame,
    csv_path: str | Path = "bundesliga_forwards.csv",
) -> pd.DataFrame:
    """Keep manual side_review tags from the previous CSV when expanding careers."""
    path = Path(csv_path)
    if not path.exists() or "side_review" not in panel.columns:
        return panel

    old = pd.read_csv(path)
    if "side_review" not in old.columns:
        return panel

    tags = old[["player", "team", "season_end_year", "side_review"]].copy()
    tags = tags[tags["side_review"].fillna("").astype(str).str.strip() != ""]
    if tags.empty:
        return panel

    if "league" in old.columns and "league" in panel.columns:
        keys = ["player", "team", "season_end_year", "league"]
        tags = old[keys + ["side_review"]]
        tags = tags[tags["side_review"].fillna("").astype(str).str.strip() != ""]
    else:
        keys = ["player", "team", "season_end_year"]

    merged = panel.drop(columns=["side_review"]).merge(tags, on=keys, how="left")
    merged["side_review"] = merged["side_review"].fillna("")
    return merged


def tag_bundesliga_rows(panel: pd.DataFrame) -> pd.DataFrame:
    out = panel.copy()
    if "league" in out.columns:
        out["in_bundesliga"] = out["league"].eq("GER-Bundesliga")
    else:
        out["in_bundesliga"] = True
    return out
