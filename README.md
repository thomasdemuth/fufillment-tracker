# Fulfillment Tracker

Self-hosted dashboard for shipment tracking. Upload spreadsheets of recipients (name, address, tracking number),
then see everyone on a map, a status board you can filter and sort, and a per-shipment view with the transit path
and a link to the carrier's tracking page.

**Privacy first:** everything runs on your machine. Names and addresses never leave it. Only tracking numbers are
sent, straight to USPS/FedEx, and only when you click Refresh.

## Quick start

```bash
cp .env.example .env
docker compose up
```

Open http://localhost:8000. The app starts in **mock mode** with no credentials needed.

Developer setup (Python 3.11 + uv, Node 22 + pnpm):

```bash
make dev        # backend on :8000, frontend dev server on :5173
make seed       # generate demo spreadsheets in ./demo
make demo       # upload them to the running server and refresh with mock carriers
make test       # backend + frontend tests
```

(Full documentation is written in the final phase.)
