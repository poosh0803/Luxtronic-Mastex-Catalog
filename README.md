# Luxtronic × Mastex Catalog

An internal tool for browsing Mastex's supplier catalog — 30+ vendor brands, all
shared in one Google Sheet — as a proper website instead of a raw spreadsheet.
Product data and photos sync automatically from the sheet; browsing, favorites,
an order-list cart, and order history all live on top of that.

## What it does

- **One page per vendor**, generated dynamically from synced data — no per-vendor
  code. A new vendor tab in the sheet gets a working page the next time the
  catalog syncs, with no code change.
- **Search, sort, grid/list view, stock badges**, and a product detail modal on
  every vendor page.
- **Favorites** — shared across everyone using the tool, persisted server-side
  (not just in your browser), plus an "All Favourites" cross-vendor view.
- **Order list (cart)** — add items from any vendor page, export the combined
  list as CSV or copy it as text to send to Mastex.
- **Order history** — save a cart as a dated record, edit quantities later, or
  restore it back into the cart to reorder.
- **Internal pricing detail** — every product shows ex price, GST-inclusive
  price, RRP, and margin %, since this is a staff tool, not customer-facing.
- **Manual "Sync now"** on the hub page, on top of the daily automatic sync, for
  pulling a same-day price/stock change immediately.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in SHEET_ID (see below)
npm run dev             # syncs once, then serves on http://localhost:8002
```

Or run the two steps separately:

```bash
npm run sync    # pulls the sheet into data/*.json + data/images/*
npm run serve   # starts the Express server
```

### Configuration (`.env`)

| Variable   | Meaning                                                        |
| ---------- | --------------------------------------------------------------- |
| `PORT`     | Port the server listens on when run directly (default `8002`)   |
| `SHEET_ID` | Google Sheet ID for Mastex's "Price List with SOH_U" workbook   |

`.env` is gitignored — copy it from `.env.example` and fill in your own values.
It isn't needed for `SHEET_ID` if you're fine with the fallback baked into
`sync/sync-catalog.js`, but setting it explicitly is recommended.

## Running in production (PM2)

```bash
pm2 start ecosystem.config.js
pm2 save
```

This starts two processes:

- **`mastex-catalog-server`** — the Express app, always on.
- **`mastex-catalog-sync`** — runs `sync/sync-catalog.js` once daily
  (`cron_restart`) and exits until the next run.

PM2's own `PORT` (set in `ecosystem.config.js`) wins over `.env`'s when the
server is started via PM2 — keep the two in sync if you change the port.

## Project layout

```
server/   Express app — one route/template per page (hub, vendor, cart,
          favorites, order history), reading from data/*.json on every request
sync/     sync-catalog.js — downloads the sheet, discovers every vendor tab,
          writes data/*.json + product photos
data/     generated catalog data (gitignored) + favorites.json/orders.json,
          the two pieces of real, persisted user state
```

## More detail

[`REQUIREMENTS.md`](REQUIREMENTS.md) is the running design log for this
project — what was asked for, why things work the way they do (especially the
image-extraction technique and the ex/inc/RRP pricing model), and what's still
open. Worth reading before making non-trivial changes.
