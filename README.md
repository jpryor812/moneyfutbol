# ⚽ MoneyFútbol — Squad-Quality Analytics

A Moneyball-style scouting tool for soccer. A Python backend scores squads on
**position-weighted underlying metrics** (xG, xA, progressive actions — process,
not outcomes) and backtests whether *this* season's squad quality predicts
*next* season's points better than the league table does. A React frontend turns
those outputs into an interactive scouting interface.

> The core idea: results regress, process repeats. A team whose underlying squad
> quality outstrips its points is a **buy**; one flattered by results is a **fade**.

## Repo structure

```
moneyfutbol/
├── backend/                 # Python model (untouched core logic)
│   ├── squad_model.py       # position framework, z-scoring, league adj, aggregation
│   ├── data_loaders.py      # make_synthetic() (offline) + load_fbref() (real, stub)
│   ├── backtest.py          # leave-one-season-out backtest, inefficiencies, projection
│   ├── export_snapshot.py   # runs the pipeline → writes /data/*.json
│   ├── requirements.txt
│   └── README.md            # backend-specific docs + FBref instructions
├── data/                    # JSON snapshot the frontend reads (generated)
│   ├── teams.json           # league table + buy/fade signal
│   ├── players.json         # per-player scores + metric z-scores
│   ├── backtest.json        # predictor comparison
│   ├── projection.json      # next-season points projection
│   └── meta.json            # framework weights, leagues, seasons
└── frontend/                # React + Vite + TypeScript + Tailwind
    └── src/
        ├── views/           # LeagueTable, TeamDetail, SquadBuilder, Backtest
        ├── components/      # SignalBadge, PlayerRadar, States
        └── lib/             # data loader, snapshot hook, squad math
```

## Data flow

```
make_synthetic()  →  build_squad_scores()  →  backtest / inefficiencies / projection
                                   │
                          export_snapshot.py
                                   │
                              /data/*.json  ──►  frontend (read-only)
```

The frontend currently reads the **static JSON snapshot** — no live server
needed. A FastAPI layer for re-scoring with custom weights is the planned next
step; the data layer (`frontend/src/lib/data.ts`) is the single seam to swap.

> The backend's scoring logic is **never modified by the frontend**. Per-player
> scores shown in the UI are produced by `export_snapshot.py` re-chaining the
> *same* public functions `build_squad_scores()` uses internally, so the numbers
> are guaranteed to match the model.

## Quick start

### 1. Backend — generate the data snapshot
```bash
cd backend
pip install -r requirements.txt
python3 export_snapshot.py        # writes ../data/*.json
```
Optional sanity check (squad score should beat raw points at predicting next season):
```bash
python3 -c "from data_loaders import make_synthetic; from squad_model import build_squad_scores; \
from backtest import build_panel, backtest; \
p,pts=make_synthetic(); s=build_squad_scores(p); print(backtest(build_panel(s,pts)))"
```

### 2. Frontend — run the app
```bash
cd frontend
npm install
npm run dev                       # copies /data → public/data, then starts Vite
```
Open the printed URL (default http://localhost:5173). Build for production with
`npm run build && npm run preview`.

> `npm run dev`/`build` automatically sync the latest `/data` snapshot into
> `frontend/public/data` (see `scripts/sync-data.mjs`). Re-run
> `python3 backend/export_snapshot.py` after tuning the model, then refresh.

## Frontend views

| View | What it shows |
|---|---|
| **League Table** | Sortable table of teams by squad score, actual points vs model-expected points side by side, color-coded **buy** (green) / **fade** (red) signals. Click a row → team detail. |
| **Team Detail** | Full roster grouped by role; each player's individual score and a radar of the metrics they over/under-index on vs positional peers. |
| **Squad Builder** | Assemble a hypothetical XI by picking players into position slots; the squad score updates live as you swap players, with a delta vs league average. *(The core interactive feature.)* |
| **Backtest** | Squad score vs raw points as predictors of next-season points (R² / MAE bars), plus a squad-score-vs-points scatter visualizing the inefficiency. |

## Using real FBref data
The synthetic generator works fully offline. To run on real data, see
[`backend/README.md`](backend/README.md) — fill the `RENAME` maps in
`data_loaders._tidy_and_merge()` after one column-inspection run, swap
`make_synthetic()` for `load_fbref(...)`, and re-run `export_snapshot.py`.

## Roadmap
- [ ] FastAPI endpoint to re-score with custom `POSITION_FRAMEWORK` weights live
- [ ] Real FBref snapshot (Big-5 + selling leagues)
- [ ] Save/share built XIs; compare two squads head-to-head
