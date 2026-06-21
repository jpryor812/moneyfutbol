"""Pull EA FC / FIFA ratings from SoFIFA (via soccerdata + squad HTML parse)."""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import pandas as pd
from lxml import html

LEAGUE = "GER-Bundesliga"
CHECKPOINT_PATH = Path(__file__).resolve().parent / "sofifa_ratings.csv"

# FBref short names → SoFIFA team labels (Bundesliga)
FBREF_TO_SOFIFA_TEAM: dict[str, str] = {
    "Arminia": "Arminia Bielefeld",
    "Augsburg": "FC Augsburg",
    "Bayern Munich": "FC Bayern München",
    "Bochum": "VfL Bochum 1848",
    "Darmstadt 98": "SV Darmstadt 98",
    "Dortmund": "Borussia Dortmund",
    "Düsseldorf": "Fortuna Düsseldorf",
    "Eintracht Frankfurt": "Eintracht Frankfurt",
    "Frankfurt": "Eintracht Frankfurt",
    "Freiburg": "SC Freiburg",
    "Gladbach": "Borussia Mönchengladbach",
    "Hamburger SV": "Hamburger SV",
    "Hannover 96": "Hannover 96",
    "Heidenheim": "1. FC Heidenheim 1846",
    "Hertha BSC": "Hertha BSC",
    "Hoffenheim": "TSG 1899 Hoffenheim",
    "Holstein Kiel": "Holstein Kiel",
    "Köln": "1. FC Köln",
    "Leverkusen": "Bayer 04 Leverkusen",
    "Mainz 05": "1. FSV Mainz 05",
    "Paderborn 07": "SC Paderborn 07",
    "RB Leipzig": "RB Leipzig",
    "Schalke 04": "FC Schalke 04",
    "St. Pauli": "FC St. Pauli",
    "Stuttgart": "VfB Stuttgart",
    "Union Berlin": "1. FC Union Berlin",
    "Werder Bremen": "SV Werder Bremen",
    "Wolfsburg": "VfL Wolfsburg",
}

SOFIFA_COLS = [
    "sofifa_player_id",
    "fc_overall",
    "fc_potential",
    "fc_age",
    "fc_value_eur",
    "fc_pos",
    "fifa_edition",
    "sofifa_update",
    "sofifa_version_id",
]


def _fifa_edition_label(season_end_year: int) -> str:
    if season_end_year <= 2023:
        return f"FIFA {season_end_year - 2000}"
    return f"FC {season_end_year - 2000}"


def pick_sofifa_version(versions_df: pd.DataFrame, season_end_year: int) -> int | None:
    """Map a Bundesliga season end-year to a launch roster on SoFIFA."""
    label = _fifa_edition_label(season_end_year)
    sub = versions_df[versions_df["fifa_edition"] == label].copy()
    special = sub["update"].str.contains(
        r"World Cup|UEFA|Euro|Copa|Women|Icons| Festival",
        case=False,
        na=False,
    )
    sub = sub[~special]
    if sub.empty:
        return None

    launch_year = season_end_year - 1
    for month in ("Aug", "Sep", "Jul"):
        hits = sub[sub["update"].str.contains(month, na=False)]
        hits = hits[hits["update"].str.contains(str(launch_year), na=False)]
        if len(hits):
            return int(hits.index[0])

    for month in ("Aug", "Sep"):
        hits = sub[sub["update"].str.contains(month, na=False)]
        if len(hits):
            return int(hits.index[0])

    return int(sub.index[0])


def norm_name(value: str) -> str:
    if not isinstance(value, str):
        return ""
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9 ]", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def parse_fc_value_eur(raw: str | None) -> float | None:
    if not raw or not isinstance(raw, str):
        return None
    s = raw.strip().replace(",", "").replace("€", "")
    mult = 1.0
    if s.endswith("K"):
        mult = 1_000.0
        s = s[:-1]
    elif s.endswith("M"):
        mult = 1_000_000.0
        s = s[:-1]
    elif s.endswith("B"):
        mult = 1_000_000_000.0
        s = s[:-1]
    try:
        return float(s) * mult
    except ValueError:
        return None


def _cell(tr, col: str) -> str | None:
    nodes = tr.xpath(f".//td[@data-col='{col}']//em/@title")
    if nodes:
        return nodes[0]
    nodes = tr.xpath(f".//td[@data-col='{col}']/text()")
    if nodes:
        return nodes[0].strip()
    return None


def parse_team_squad_html(
    filepath: Path,
    *,
    team: str,
    season_end_year: int,
    version_id: int,
    fifa_edition: str,
    sofifa_update: str,
) -> list[dict]:
    if not filepath.exists():
        return []

    tree = html.parse(str(filepath))
    pat_player = re.compile(r"/player/(\d+)/")
    rows: list[dict] = []

    for tr in tree.xpath("//article//table/tbody/tr"):
        links = tr.xpath(".//td[2]//a[contains(@href,'/player/')]")
        if not links:
            continue
        link = links[0]
        match = pat_player.search(link.get("href", ""))
        if not match:
            continue

        pos_nodes = tr.xpath(".//span[contains(@class,'pos')]/text()")
        rows.append(
            {
                "player": (link.get("data-tippy-content") or link.text_content()).strip(),
                "team": team,
                "season_end_year": season_end_year,
                "sofifa_player_id": int(match.group(1)),
                "fc_overall": pd.to_numeric(_cell(tr, "oa"), errors="coerce"),
                "fc_potential": pd.to_numeric(_cell(tr, "pt"), errors="coerce"),
                "fc_age": pd.to_numeric(_cell(tr, "ae"), errors="coerce"),
                "fc_value_eur": parse_fc_value_eur(_cell(tr, "vl")),
                "fc_pos": pos_nodes[0].strip() if pos_nodes else None,
                "fifa_edition": fifa_edition,
                "sofifa_update": sofifa_update,
                "sofifa_version_id": version_id,
            }
        )
    return rows


def _empty_sofifa_df() -> pd.DataFrame:
    return pd.DataFrame(columns=["player", "team", "season_end_year", *SOFIFA_COLS])


def _version_map(season_end_years: list[int], leagues: list[str]) -> dict[int, int]:
    import soccerdata as sd

    versions_df = sd.SoFIFA(leagues=leagues).read_versions()
    version_map: dict[int, int] = {}
    for year in season_end_years:
        vid = pick_sofifa_version(versions_df, year)
        if vid is None:
            print(f"  [warn] SoFIFA: no roster found for season ending {year}")
        else:
            meta = versions_df.loc[vid]
            print(
                f"  SoFIFA {year}: {_fifa_edition_label(year)} "
                f"version {vid} ({meta['update']})"
            )
            version_map[year] = vid
    return version_map


def parse_sofifa_season_from_cache(
    year: int,
    version_id: int,
    leagues: list[str],
) -> pd.DataFrame:
    """Parse squad HTML already on disk — no new browser requests."""
    import soccerdata as sd

    sf = sd.SoFIFA(leagues=leagues, versions=int(version_id))
    versions_df = sf.read_versions()
    meta = versions_df.loc[version_id]
    teams = sf.read_teams()

    rows: list[dict] = []
    missing_teams = 0
    for team_id, row in teams.iterrows():
        filepath = Path(sf.data_dir) / f"players_{team_id}_{version_id}.html"
        if not filepath.exists():
            missing_teams += 1
            continue
        rows.extend(
            parse_team_squad_html(
                filepath,
                team=row["team"],
                season_end_year=year,
                version_id=version_id,
                fifa_edition=str(meta["fifa_edition"]),
                sofifa_update=str(meta["update"]),
            )
        )

    if missing_teams:
        print(f"  {year}: {missing_teams}/{len(teams)} teams not cached yet")
    if not rows:
        return _empty_sofifa_df()

    out = pd.DataFrame(rows)
    out["season_end_year"] = out["season_end_year"].astype(int)
    return out


def _save_checkpoint(df: pd.DataFrame) -> None:
    df.to_csv(CHECKPOINT_PATH, index=False)
    print(f"  checkpoint saved -> {CHECKPOINT_PATH.name} ({len(df):,} rows)")


def load_sofifa_checkpoint() -> pd.DataFrame:
    if not CHECKPOINT_PATH.exists():
        return _empty_sofifa_df()
    return pd.read_csv(CHECKPOINT_PATH)


def pull_sofifa_ratings(
    season_end_years: list[int],
    leagues: list[str] | None = None,
    *,
    resume: bool = True,
    fetch: bool = True,
) -> pd.DataFrame:
    """Fetch squad ratings per season. Saves checkpoint after each season.

    Safe to interrupt (Ctrl+C): re-run the same command to continue.
    Use fetch=False to only parse files already cached.
    """
    leagues = leagues or [LEAGUE]
    version_map = _version_map(season_end_years, leagues)
    if not version_map:
        return _empty_sofifa_df()

    checkpoint = load_sofifa_checkpoint() if resume else _empty_sofifa_df()
    done_years: set[int] = set()
    if len(checkpoint):
        done_years = set(checkpoint["season_end_year"].astype(int).unique())
        print(f"  Resume: {len(done_years)} season(s) in checkpoint")

    frames = [checkpoint] if len(checkpoint) else []

    for year in sorted(version_map):
        if year in done_years:
            print(f"  skip {year} (already in checkpoint)")
            continue

        version_id = version_map[year]
        if fetch:
            import soccerdata as sd

            sf = sd.SoFIFA(leagues=leagues, versions=int(version_id))
            print(f"  fetching missing squad pages for {year}…")
            sf.read_players()

        season_df = parse_sofifa_season_from_cache(year, version_id, leagues)
        frames.append(season_df)

        combined = pd.concat(frames, ignore_index=True).drop_duplicates(
            ["player", "team", "season_end_year", "sofifa_player_id"],
            keep="last",
        )
        _save_checkpoint(combined)

    if not frames:
        return checkpoint if len(checkpoint) else _empty_sofifa_df()

    out = pd.concat(frames, ignore_index=True).drop_duplicates(
        ["player", "team", "season_end_year", "sofifa_player_id"],
        keep="last",
    )
    out["season_end_year"] = out["season_end_year"].astype(int)
    return out


def merge_sofifa_into_csv(
    csv_path: str | Path = "bundesliga_forwards.csv",
    season_end_years: list[int] | None = None,
    leagues: list[str] | None = None,
    *,
    fetch: bool = False,
) -> pd.DataFrame:
    """Merge cached / checkpoint SoFIFA data into the study CSV without a full re-pull."""
    path = Path(csv_path)
    panel = pd.read_csv(path)
    seasons = season_end_years or sorted(
        panel["season_end_year"].dropna().unique().astype(int).tolist()
    )
    leagues = leagues or [
        "ENG-Premier League",
        "ESP-La Liga",
        "ITA-Serie A",
        "GER-Bundesliga",
        "FRA-Ligue 1",
    ]

    checkpoint = load_sofifa_checkpoint()
    cached_years = (
        set(checkpoint["season_end_year"].astype(int).unique()) if len(checkpoint) else set()
    )
    missing = [y for y in seasons if y not in cached_years]

    if fetch and missing:
        pull_sofifa_ratings(missing, leagues, resume=True, fetch=True)
        sofifa = load_sofifa_checkpoint()
    elif len(checkpoint):
        sofifa = checkpoint[checkpoint["season_end_year"].isin(seasons)].copy()
        if missing:
            print(f"  Using checkpoint only; not cached yet: {missing}")
    else:
        print("  No checkpoint — parsing cached HTML only…")
        version_map = _version_map(seasons, leagues)
        parts = [
            parse_sofifa_season_from_cache(y, vid, leagues)
            for y, vid in sorted(version_map.items())
        ]
        sofifa = pd.concat(parts, ignore_index=True) if parts else _empty_sofifa_df()

    merged = merge_sofifa(panel, sofifa)
    merged.to_csv(path, index=False)
    print(f"  Updated {path} · fc_overall filled on {merged['fc_overall'].notna().sum():,} rows")
    return merged


def merge_sofifa(panel: pd.DataFrame, sofifa: pd.DataFrame) -> pd.DataFrame:
    if sofifa.empty:
        for col in SOFIFA_COLS:
            if col not in panel.columns:
                panel[col] = pd.NA
        return panel

    left = panel.drop(columns=[c for c in SOFIFA_COLS if c in panel.columns]).copy()
    right = sofifa.copy()
    left["_np"] = left["player"].map(norm_name)
    left["_nt"] = left["team"].map(lambda t: norm_name(FBREF_TO_SOFIFA_TEAM.get(t, t)))
    right["_np"] = right["player"].map(norm_name)
    right["_nt"] = right["team"].map(norm_name)

    merge_cols = [c for c in SOFIFA_COLS if c in right.columns]
    slim = right[["_np", "_nt", "season_end_year", *merge_cols]].drop_duplicates(
        ["_np", "_nt", "season_end_year"]
    )
    merged = left.merge(slim, on=["_np", "_nt", "season_end_year"], how="left")

    # Fallback: same player name + season when team labels differ (loan / rename)
    missing = merged["fc_overall"].isna()
    if missing.any():
        by_name = right[["_np", "season_end_year", *merge_cols]].drop_duplicates(
            ["_np", "season_end_year"], keep="first"
        )
        fallback = left.loc[missing, ["_np", "season_end_year"]].merge(
            by_name, on=["_np", "season_end_year"], how="left"
        )
        for col in merge_cols:
            merged.loc[missing, col] = merged.loc[missing, col].fillna(fallback[col])

    merged = merged.drop(columns=["_np", "_nt"])

    matched = merged["fc_overall"].notna().sum()
    print(f"  SoFIFA matched on name+team+season: {matched:,}/{len(merged):,} rows")
    if matched < len(merged) * 0.4:
        print("  [warn] Low SoFIFA match — check team map or player spelling")
    return merged


# Backwards-compatible alias
pull_sofifa_bundesliga = pull_sofifa_ratings
