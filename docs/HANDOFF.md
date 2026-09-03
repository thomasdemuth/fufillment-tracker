# Fulfillment Tracker — Handoff

_Last updated: 2026-09-03. Branch: `claude/mock-data-github-upload-5g9pjt` (on top of `claude/shipment-tracking-dashboard-mj9c5h`)._

## What this is

A self-hosted shipment dashboard. You upload spreadsheets of recipients (name, address, tracking number); the app
shows everyone on a map, a filterable status board, and a per-shipment page with Shop-style progress, transit path,
event history and a link to the carrier. Tracking status comes from USPS and FedEx when you click Refresh. Private
data never leaves your machine except the bare tracking number sent to the carrier.

Live hosted interface (no data): https://thomasdemuth.github.io/fufillment-tracker/

## Run it

| Goal | Command |
|---|---|
| Run the whole app | `cp .env.example .env && docker compose up`, then http://localhost:8000 |
| Develop | `make dev` (backend :8000 + Vite :5173) |
| Sample data | `make seed demo` |
| Tests | `make test` (pytest + vitest), `make e2e` (Playwright: desktop, iPhone, hosted) |
| Lint / types | `make lint` |
| Hosted (GitHub Pages) build | `cd frontend && pnpm build:hosted`, `pnpm serve:hosted` to preview on :4173 |

Everything runs in **mock mode** by default (fake but realistic tracking). Real carriers: Settings → Carriers → Live.

## Architecture in one screen

```
backend/  FastAPI + SQLAlchemy + SQLite (uv, ruff, pytest)         frontend/  React 19 + TS + Vite + Tailwind 4 + MapLibre (pnpm, vitest, Playwright)
  app/api/*          REST endpoints (all under /api)                  src/pages/*            one file per screen; desktop + phone branches
  app/services/      spreadsheet parsing, header mapping, importer,     src/components/*       ui/ primitives, board/, map/, shipment/, layout/
                     query (shared filters), status_map, tracking,      src/lib/               filters (URL state), status palette, mapLayers,
                     refresh jobs, attention, export, geocode_job                              server (which backend), snapshot (file mode)
  app/carriers/      protocol + usps.py, fedex.py, mock.py, detect.py  src/api/               generated OpenAPI types, client, queries,
  app/geocode/       offline ZIP centroids, online providers, cache                            localServer (in-browser read-only API for snapshots)
  alembic/           migrations (one initial)                           e2e/                   smoke (desktop), mobile, hosted specs + helpers
  scripts/           seed_demo.py, demo_load.py                         public/geo/            vendored US states GeoJSON, blank fallback styles
```

Key design points:

- **One filter language.** Filters live in the URL (`src/lib/filters.ts`) and one SQL builder (`app/services/query.py`)
  serves the board, map, stats, export, attention and snapshot endpoints. The in-browser `localServer.ts` mirrors it.
- **Status mapping is data.** `app/services/status_map.py` holds USPS/FedEx code tables → 7 normalized statuses.
  Adjusting a mapping is a one-line change with a parametrized test.
- **Carriers are pluggable.** `app/carriers/base.py` defines `fetch(numbers) -> {number: TrackResult | TrackError}`.
  The mock carrier is deterministic (hash of the tracking number) and advances with time.
- **Design tokens.** All colors in `frontend/src/index.css`; components never use raw Tailwind colors. Status hues
  are validated for colorblind separation on the map; status is never color-alone elsewhere.
- **Two layouts, one component tree.** `useIsMobile()` switches between `AppShell` (sidebar, table, drawer) and
  `MobileShell` (bottom tabs, cards, sheets). Users can force a layout in Settings → General.
- **Hosted UI has no data of its own.** The GitHub Pages build (`VITE_HOSTED=1`, base `/fufillment-tracker/`) has
  three data sources, chosen in `AppGate` and remembered in `localStorage` (`ft.mode`):
  - `snapshot`: a read-only file from "Send to phone", or the bundled demo (`frontend/public/demo/demo.snapshot.json`,
    fake data). Desktop boots into the demo; phones show the open-a-file screen.
  - `local`: the user's own data in IndexedDB, read-write, no server. `frontend/src/local/` ports the backend
    (spreadsheet reading via SheetJS, mapping, importer, offline ZIP geocoding from `public/geo/us_zips.txt`, mock
    carrier, jobs, notes/tags, export, snapshot export); `local/server.ts` answers the same `/api/...` paths, so the
    pages are unchanged. Live carriers work through the user's own relay Worker (`worker/src/index.js`, deployed on
    Cloudflare; `local/liveCarriers.ts` parses USPS/FedEx responses with the backend's status tables, tested on the
    same fixtures). Settings → Carriers holds the relay URL + token; `docs/LIVE-TRACKING.md` is the user guide.
    Online geocoding is not available here.
  - `server`: a user-run backend over CORS with a bearer token.
  Regenerate the demo file only with `make demo-snapshot` (throwaway database seeded from `demo/`), never from a real
  database: `.gitignore` blocks `*.snapshot.json` and spreadsheets outside `demo/` and test fixtures, and
  `frontend/dist-hosted/` is no longer tracked (the workflow builds it).

## Phone handoff (how "Send to phone" works)

1. Desktop: **Send to phone** downloads `shipments-<stamp>.snapshot.json` (the current filtered view, with events,
   coordinates, attention reasons) via `GET /api/snapshot`, and copies the hosted link.
2. User sends both to the phone (AirDrop, Messages, email).
3. Phone: opens the link → "Open a snapshot file" → picks the file. `AppGate` stores it in IndexedDB and swaps the API
   client's `fetch` for `snapshotFetch`, so every page runs unchanged, read-only.
4. If `PUBLIC_URL` (an HTTPS address for the server, e.g. a Cloudflare Tunnel) is set, the link instead carries
   `?server=` and the phone connects live.

## Deploy

- **GitHub Pages**: `.github/workflows/deploy-github-pages.yml` builds `frontend/dist-hosted` and deploys on every push
  to `main`/`master`/the feature branch. It enabled Pages itself on the first run. No secrets needed.
- **CI**: `.github/workflows/ci.yml` runs ruff, pytest, oxlint, tsc, vitest and the production build.
- Gotcha that bit us: `pnpm/action-setup` must be given `package_json_file: frontend/package.json`, because
  `package.json` is not at the repo root.

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATA_DIR` | `./data` | SQLite DB, uploaded files, auto-generated secret key |
| `CARRIER_MODE` | `mock` | `mock` or `live` |
| `APP_PASSWORD` | unset | Password-protect the app (Basic auth in the browser, bearer token from the hosted UI) |
| `APP_SECRET_KEY` | auto | Encrypts stored carrier/geocoder secrets |
| `USPS_CLIENT_ID/SECRET`, `FEDEX_API_KEY/SECRET_KEY` | unset | Carrier credentials via env (override Settings) |
| `MAP_STYLE_URL`, `MAP_STYLE_URL_DARK` | OpenFreeMap positron / fiord | Basemaps; PMTiles for offline (README) |
| `PUBLIC_URL` | unset | HTTPS address of this server for phone links |
| `HOSTED_UI_URL` | GitHub Pages URL | Where the hosted UI lives |
| `ALLOWED_ORIGINS` | github.io + localhost | Origins allowed to call the API |

## Status of things

Done and tested: upload wizard with header detection and presets; dedupe across uploads; offline ZIP geocoding;
opt-in online geocoding (Nominatim/Geocodio/Mapbox); map with clusters/heatmap/states; board with all filters,
sort, columns, pagination, CSV/XLSX export; shipment detail with stepper, path, timeline, notes, tags, edit, delete;
refresh jobs with progress; attention page; settings; privacy page with egress log and wipe; mobile layout; snapshot
handoff; GitHub Pages deploy; browser-only data mode on the hosted site (unit tests in `src/local/*.test.ts`, Playwright
`hosted-local` project, no backend needed).

Not yet verified against real carriers: the USPS and FedEx clients are tested against recorded response shapes only
(this sandbox could not reach the carrier hosts). Expect small vocabulary adjustments in `status_map.py` after the
first live refresh. Docker image build was reviewed but not executed here (no Docker daemon in the sandbox).

Assumptions: US addresses; one sheet per upload; "Available for Pickup" = in transit + flagged; "Delivered to Agent" =
delivered; notes are plain text.

## Ideas for next steps

- Scheduled background refresh (was deliberately left manual).
- Public per-recipient tracking page (tokenized link) if you ever want customers to self-serve.
- The browser data mode keeps uncommitted uploads in memory only: reloading during the mapping step means choosing the
  file again. Persisting the raw file in IndexedDB would fix that.
- SheetJS is pinned to 0.18.5 from npm (the last version published there); newer releases come from cdn.sheetjs.com.
- Address parsing for combined street lines (`usaddress`).
- Merge to `main` and open a PR when ready; the deploy workflow already listens on `main`.
