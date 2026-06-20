# Squad Quality Model — Moneyball-style scout & backtester

A position-weighted squad scoring model for the Big-5 + selling leagues
(Belgium, Netherlands, Portugal), with a backtest that checks whether squad
quality predicts **next** season's points better than the current table does —
and surfaces over/under-performers as buy/fade signals.

## Files
- `squad_model.py` — position framework, z-scoring, league adjustment, aggregation
- `data_loaders.py` — `load_fbref()` (real) + `make_synthetic()` (offline test)
- `backtest.py` — leave-one-season-out backtest, inefficiency finder, projection

## Quick start (offline sanity check — no network needed)
```bash
pip install pandas numpy scikit-learn
python3 -c "from data_loaders import make_synthetic; from squad_model import build_squad_scores; \
from backtest import build_panel, backtest; \
p,pts=make_synthetic(); s=build_squad_scores(p); print(backtest(build_panel(s,pts)))"
```
On synthetic data the squad score should edge out raw points at predicting next
season — confirming the machinery works before you trust real data.

## Running on real FBref data (your machine)
```bash
pip install soccerdata pandas numpy scikit-learn
```
soccerdata drives a headless browser to scrape FBref, so it needs internet and a
Chrome/Chromium install. Then:

1. **Inspect columns once.** FBref returns MultiIndex columns whose exact names
   drift by version. Run:
   ```python
   import soccerdata as sd
   fb = sd.FBref(leagues="Big 5 European Leagues Combined", seasons="2024")
   print(fb.read_player_season_stats(stat_type="standard").columns.tolist())
   ```
2. **Fill the RENAME maps** in `data_loaders._tidy_and_merge()` to translate
   FBref's column tuples → the canonical metric names in `METRIC_COLS`.
   (Left as an explicit stub on purpose — silent column-guessing is how these
   models quietly break.)
3. **Pull points** from `fb.read_schedule()` (compute final table) or a
   `read_team_season_stats` table, into a `points` df with columns
   `league, season, team, points`.
4. Swap `make_synthetic()` for `load_fbref(...)` and run the same pipeline.

Leagues to pass:
```python
leagues = ["Big 5 European Leagues Combined",
           "BEL-Pro League", "NED-Eredivisie", "POR-Primeira Liga"]
seasons = ["2021","2022","2023","2024","2025"]   # season = year it ENDS
```
Note: Big-5 advanced stats are clean back to 2017-18; selling-league advanced
coverage is thinner in older seasons — verify before trusting those rows.

## What to tune (this is the actual work)
1. **Weights** in `POSITION_FRAMEWORK` — your hypotheses about what matters per
   role. Changing these and re-running the backtest is the core research loop.
2. **League multipliers** in `LEAGUE_STRENGTH` — start rough, then derive
   empirically from players who transferred between leagues (how did their
   underlying numbers change). This is where real edge hides.
3. **Role mapping** in `map_position` / `refine_roles` — currently heuristic.
   Upgrade with positional minutes for cleaner FB/DM/W splits.
4. **min_minutes** in aggregation — filters noisy small-sample z-scores.

## Reading the outputs
- `backtest()` — if `B_squad` / `C_both` beat `A_points` on R²/MAE, your model
  adds signal beyond the table.
- `find_inefficiencies()` — negative residual = squad better than results
  (**buy**); positive = results flatter the squad (**fade**).
- `project_next_season()` — projected points table for the upcoming season.

## Honest limitations
- Squad score ignores fixtures, injuries, managerial change, and transfers
  *between* the score season and the predicted season. For real projections,
  re-score each summer's actual squad, not last season's.
- xG/xA models differ by provider (StatsBomb vs Opta) — FBref uses StatsBomb.
- Finishing skill (goals − xG) is real only over large samples; don't overweight
  it on one season.
