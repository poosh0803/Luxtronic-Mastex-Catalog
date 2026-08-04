# Mastex Catalog — Requirements & Build Plan

This document captures everything requested so far for this project. It started as a
planning-only document; **§6's automation proposal has since been implemented** (see the
"Status" box inside §6). A future session should still read this in full before making
further changes — it's the record of *why* things are built the way they are.

## 1. Background

Mastex is a distributor/supplier that carries 30+ product brands ("vendors") in one shared
Google Sheet:

- Sheet name: `Price List with SOH_U`
- URL: `https://docs.google.com/spreadsheets/d/1FJ_I-othbHcsSF8H1DDkrrJb0OfNAPL5AOje-Bl4q9Y/edit`
- Sharing: "Anyone with the link" (view access, no sign-in required)
- One tab per vendor, e.g. `MCHOSE`, `HOTO`, `Moondrop`, `Keychron`, `Fantech`, `YUNZII`,
  `Nuphy`, `Lofree`, `MAONO`, `Pulsar`, `Qwerty Keys`, `WOBKEY`, `Choetech`, `Melgeek`,
  `IQUNIX`, `ARBITERSTUDIO`, `Gamdias`, `DarkFlash`, `FSP`, `LAMZU`, `WLMouse`, `Valkyrie`,
  `Dry Studio / ANGRYMIAO`, `Keytok`, `Pwnage`, `VARMILO`, `HP`, `SiliconPower`, `PNY`,
  `Unitek`, plus `New Items` / `All Items` (aggregate views) and a hidden `Promotion` tab.
- Each vendor tab has the same column layout: `Product Code, Description, SKU, Remark
  (NEW/EOL/blank), Image, SOH, Price (ex), RRP, Margin, EAN, Weight (g), Length (cm), Width
  (cm), Height (cm), Link`. Some tabs also have category sub-header rows (a row with only
  column B filled in, e.g. "Precision SCREWDRIVERS") that group the rows below them.
- **Product photos are pasted directly into the Image column as floating images**, not
  as cell values or `=IMAGE()` formulas. They are not retrievable via CSV/gviz export —
  see §5.2 for the extraction method that does work.
- Luxtronic (the user's org) wants an internal tool to browse this catalog more pleasantly
  than a raw spreadsheet, and to build a purchase order list to send back to Mastex.

## 2. What Exists Today

The site lives in [`prototype/`](prototype/) (static HTML/CSS/JS, no build step) and is
kept fresh by the Node scripts in [`scripts/`](scripts/) — see §6 for how those fit
together; this section is just the file-by-file inventory.

- `index.html` — vendor hub/directory. Lists all vendor tabs from the sheet; `MCHOSE`,
  `HOTO`, and `Moondrop` are live pages, the rest are "coming soon" tiles. SKU counts and
  the "last synced" line come from `data/meta.json` at load time.
- `mchose.html`, `hoto.html`, `moondrop.html` — one page per vendor: search, favorites,
  sort, grid/list view, a product detail modal, and an "Add to order" control. Product
  data and photos are **real for all three vendors**, `fetch()`-ed from
  `data/<vendor>.json` at load time and kept current by the daily sync (§6). No product
  data is hardcoded in these files anymore.
- `cart.html` — the combined "order list" page. Grouped by vendor, with quantity steppers,
  a grand total, **Export as CSV**, **Copy as text**, and **Clear order list**.
- `assets/cart.js` — shared cart logic, backed by `localStorage` (key `mastexCart_v1`) so
  items added on any vendor page are visible on every other page and on `cart.html`.
- `assets/theme.js` — shared light/dark theme state (`localStorage` key `mastexTheme_v1`),
  applied before paint to avoid a flash, defaults to light regardless of OS preference, and
  stays consistent across every page once toggled.
- `assets/<vendor>/*` — product photos, written by `scripts/sync-catalog.js`.
- `data/<vendor>.json`, `data/meta.json` — product lists + sync summary, written by
  `scripts/sync-catalog.js`. This is generated output, not hand-maintained.

There is still no real backend — no database, no auth, no order-submission endpoint. The
"live" part is entirely the scheduled sync script rewriting static files (§6) plus the
client-side cart in `localStorage`.

## 3. Requirements Gathered So Far (chronological)

1. Build a prototype in a `prototype/` folder: plain demo HTML, no real functionality
   needed at first. The eventual goal is to pull the supplier's catalog from the Google
   Sheet above and present it as a nicer reading/browsing experience than the raw sheet,
   with a search function and other "nice to have" features.
2. Don't organize it as one big mixed catalog — Mastex carries many vendors, so it should
   be **"one vendor, one page."** Each vendor page needs search and a favorites feature.
   Investigate whether product photos can actually be pulled from the sheet. Build the
   demo for two vendors with fewer SKUs first (chosen: **HOTO** and **Moondrop**) since
   they're easier to build/verify than the larger vendors.
3. Remove the category-filter chips from each vendor page — the user will just browse
   "all products" and doesn't need to filter by category. (A small read-only category
   label on each card is fine to keep; the interactive filter row should go.)
4. Add a working **cart** feature: let the user add items to a cart across any vendor
   page, then export the combined list as an **order list** to send to the Mastex
   supplier later (CSV export + copy-as-text were the two export formats built).
5. UI polish pass:
   - Product images must all render at the **same size**.
   - The cart icon and dark-mode toggle icon must sit on the **right edge** of the top
     bar, not drift toward the middle.
   - Dark mode must **default to light** regardless of the visitor's OS theme, and the
     chosen theme must **stay the same across every page** (persist + apply consistently
     site-wide, not per-page).
6. Follow-up on image sizing: "image for each product can only be square" — every
   product image (grid card, list row, and the detail modal) must render in a strict 1:1
   square box.
   - First attempt used `object-fit: cover` inside an `aspect-ratio: 1/1` box. This
     looked right in spot checks but was **not actually square for several products**
     (e.g. MOONDROP QUARKS, KADENZ, RAYS, HORIZON, PARA2) — measurement showed the box
     height was tracking the source photo's own aspect ratio instead of staying square.
     Root cause: `aspect-ratio` on a flex container whose image child uses `height:100%`
     creates a circular sizing dependency that the browser resolves inconsistently.
   - Fixed by switching to the classic `padding-top: 100%` box technique (a percentage
     `padding-top` is always resolved from the element's own width, so there's no
     circular dependency) with the `<img>` absolutely positioned inside it. Verified this
     time by measuring actual rendered `getBoundingClientRect()` dimensions in the
     browser, not just by eyeballing a screenshot.
   - Follow-up correction: the user does **not** want cropping. Squares must be achieved
     by **shrinking the photo to fit** (`object-fit: contain`, full photo always visible,
     letterboxed inside the square with a little padding) rather than cropping
     (`object-fit: cover`). This is the current, final state of `hoto.html` and
     `moondrop.html`.
7. **This document.** Write up everything requested so far into a doc a future Claude
   session can execute from. Also: since the supplier updates the underlying Google Sheet
   **daily**, figure out a plan to use **Node.js + PM2** to refresh the site's data on a
   schedule, so it doesn't go stale. Explicitly told to finish this doc first and **not
   write any code yet** — that's why this file exists and the codebase is otherwise
   unchanged from the end of §2.

## 4. Consolidated Frontend Spec (current target state)

- One HTML page per vendor + one hub page + one order-list page (matches current
  prototype structure).
- Every vendor page has: search box, favorites (star + "favorites only" filter), sort
  (name/price/stock), grid/list view toggle, stock badges (in stock / low / out /
  discontinued), a "NEW" tag where the sheet's Remark column says so, and a product detail
  modal.
- No category filter chips. A small read-only category/type label on each card is fine.
- Cart / order list:
  - "Add to order" control on every card and in the modal; becomes a qty stepper once an
    item is in the cart.
  - Cart persists and is shared across every page.
  - `cart.html` groups by vendor, shows per-vendor and grand totals, and supports CSV
    export + copy-as-text (format: `Vendor, Product Code, SKU, Description, Qty, Unit
    Price, Line Total`, plus a grand-total row).
- Theme: light by default, persisted, identical on every page, toggle in the top-right of
  the top bar.
- Cart and theme icons pinned to the right edge of the top bar on every page.
- Product images: strict 1:1 square, `object-fit: contain` (never cropped), consistent
  padding, with a clean "No image in sheet" placeholder for products missing a photo.

## 5. Data & Image Pipeline

### 5.1 Row data

Each vendor's row data can be fetched without authentication via the Google Visualization
API, keyed by sheet name (no need to know a tab's `gid`):

```
https://docs.google.com/spreadsheets/d/1FJ_I-othbHcsSF8H1DDkrrJb0OfNAPL5AOje-Bl4q9Y/gviz/tq?tqx=out:csv&sheet=HOTO
```

This is good enough for text/number columns, but it returns nothing useful for the Image
column (see below) and can silently disagree with the "true" row numbers in a few edge
cases (a stray hidden row shifted HOTO's data by one row during this session — the xlsx
route in §5.2 is the more authoritative source of truth for row alignment).

### 5.2 Product images (the part that actually needs automating)

Google Sheets does **not** expose pasted/floating images through CSV, gviz, or the
regular Sheets API `values.get` endpoint. The technique that worked this session:

1. Export the **entire spreadsheet** as `.xlsx`:
   `https://docs.google.com/spreadsheets/d/1FJ_I-othbHcsSF8H1DDkrrJb0OfNAPL5AOje-Bl4q9Y/export?format=xlsx`
   (this was a ~55MB download for the full 30-vendor workbook).
2. An `.xlsx` is a zip archive. Unzip it.
3. `xl/workbook.xml` maps each visible sheet name (e.g. `"HOTO"`) to a `sheetN.xml` file
   via `xl/_rels/workbook.xml.rels`.
4. `xl/worksheets/_rels/sheetN.xml.rels` points to that sheet's `drawingM.xml` (if it has
   floating images).
5. `xl/drawings/drawingM.xml` contains one `<xdr:oneCellAnchor>` per image, each with a
   0-indexed `<xdr:row>` (which row it's anchored to) and an `r:embed` relationship ID.
6. `xl/drawings/_rels/drawingM.xml.rels` maps that relationship ID to the actual file in
   `xl/media/imageNNN.png`.
7. Cross-reference the anchor's row number against the row data from `xl/worksheets/
   sheetN.xml` (parsed directly, not via gviz — see the row-alignment caveat above) to
   know which product each image belongs to.

This was done manually with a one-off Node script during this session (parsing the XML
with regex, no external dependencies) for the `HOTO` and `Moondrop` tabs only, and the
resulting PNGs were copied into `prototype/assets/hoto/` and `prototype/assets/
moondrop/`. **This entire process needs to become the automated sync job described in
§6** so it runs for all vendors, not just two, and reruns on a schedule instead of by
hand.

Not every row has an image (color variants often share one photo, EOL rows often have
none) — the site must keep working and show a "No image in sheet" placeholder rather than
erroring when a product has no matching image.

## 6. Automation: Daily Sync via Node.js + PM2

> **Status: implemented.** This section was originally a proposal; it's now the as-built
> description. What exists:
> - [`scripts/sync-catalog.js`](scripts/sync-catalog.js) — downloads the workbook, parses
>   `HOTO`, `Moondrop`, and `MCHOSE` (see §6.4 re: the other ~27 tabs — not yet in scope),
>   writes `prototype/data/<vendor>.json` + `prototype/data/meta.json`, and writes/updates
>   `prototype/assets/<vendor>/*` (skipping unchanged images via a content hash).
> - [`scripts/server.js`](scripts/server.js) — a small Express static server for
>   `prototype/`, needed because the vendor pages now `fetch()` their data at runtime
>   (browsers block `fetch()` of local `file://` JSON, so the site must be served, not
>   just double-clicked open).
> - `hoto.html`, `moondrop.html`, and `mchose.html` no longer have hardcoded product data —
>   they `fetch("data/<vendor>.json")` on load. `mchose.html` also switched from mock data
>   and icon/gradient placeholders to real synced data and real photos (was previously a
>   hand-picked 33-SKU subset; the sheet's `MCHOSE` tab actually has 111 SKUs).
> - `index.html`'s vendor tiles pull live SKU counts and a "last synced" timestamp from
>   `data/meta.json`, so they don't go stale the way the old hardcoded "33 SKUs" text did.
> - [`ecosystem.config.js`](ecosystem.config.js) defines two PM2 apps: `mastex-catalog-server`
>   (always on) and `mastex-catalog-sync` (`cron_restart: "0 3 * * *"`, `autorestart:
>   false` — runs once daily and exits until the next trigger). Currently running locally
>   on this dev machine via `pm2 start ecosystem.config.js` + `pm2 save`.
> - **Not done:** surviving a machine reboot. `pm2 save` persists the process list, but
>   PM2 doesn't auto-start on boot on Windows without extra setup (e.g. the
>   `pm2-windows-startup` package, or a Task Scheduler entry running `pm2 resurrect` at
>   login). Worth doing before relying on this unattended for real, and doubly worth doing
>   before deciding this dev machine — rather than the shared LAN server — is where it
>   should permanently live (see §6.4, still open).
>
> The rest of this section is kept as-written below for the reasoning behind these
> choices; §6.4's open questions are still open except where noted.

**Goal:** the supplier edits the Google Sheet daily (prices, stock levels, new products,
new photos). The site should pick up those changes automatically, without anyone manually
re-running the extraction steps in §5.2.

### 6.1 Shape of the change

Today the prototype has product data hardcoded into a JS array inside each vendor's HTML
file, and images committed as static PNGs. That's fine for a hand-built two-vendor demo,
but it means "update the data" currently means "hand-edit HTML." To make daily syncing
possible, the data needs to move **out of the HTML and into files the sync job can
overwrite on its own**:

- One JSON file per vendor, e.g. `data/hoto.json`, `data/moondrop.json`, containing the
  product array currently hardcoded in each `<script>` block.
- Product images continue to live under `assets/<vendor>/`, written/overwritten by the
  sync job.
- Each vendor HTML page changes from `const PRODUCTS = [...]` to `fetch('data/hoto.json')`
  (or similar) on load. This is a meaningful change to how the front end works and should
  be scoped as its own step, not bundled invisibly into "add a cron job."
- A small `data/meta.json` (or similar) recording the last successful sync time per
  vendor, so the UI can show "Catalog last updated: <date>" somewhere (nice-to-have, not
  strictly required, but cheap and worth doing while touching this).

### 6.2 The sync script

A Node.js script (e.g. `scripts/sync-catalog.js`) that, for each configured vendor:

1. Downloads the workbook `.xlsx` (see §5.2, step 1). Consider whether to download the
   whole workbook once per run and process every vendor from that single download (one
   ~55MB fetch) vs. some lighter-weight per-vendor approach — worth checking whether
   Google exposes a way to export a single tab as xlsx to avoid the full download, but the
   full-workbook approach is what's proven to work.
2. Parses the workbook using the technique in §5.2 (this logic already exists as ad-hoc
   Node code from this session and can be cleaned up and reused, rather than
   re-researched).
3. For each vendor tab: builds the product array (code, name, SKU, remark, stock, prices,
   EAN, weight/dims, link, category-from-subheader-row, image filename) and writes it to
   `data/<vendor>.json`.
4. Extracts each product's image (if any) and writes it to `assets/<vendor>/<code>.png`,
   skipping the copy if the image is byte-identical to what's already on disk (avoid
   needless writes/git churn).
5. Logs a summary (products added/removed/changed, price/stock deltas, images
   added/removed) — useful both for debugging and as a possible future "what changed
   today" notice.
6. Fails loudly (non-zero exit, clear error message) if the sheet is unreachable or its
   structure has changed in a way the parser doesn't understand (e.g. a vendor tab
   renamed, a column reordered) — do not silently write partial/wrong data over good data.
   Consider only overwriting `data/<vendor>.json` after fully parsing succeeds for that
   vendor, so a mid-run failure doesn't corrupt data for vendors that already parsed fine.

### 6.3 Scheduling with PM2

PM2 supports running a script as a scheduled job directly (it doesn't need to be wrapped
in a long-running server process just to get a daily cron):

```
pm2 start scripts/sync-catalog.js --name mastex-catalog-sync --cron "0 3 * * *" --no-autorestart
```

- `--cron` triggers the script on that schedule; `--no-autorestart` stops PM2 from
  restarting it immediately after each run (it exits when done, then waits for the next
  scheduled trigger).
- Pick a run time with the actual supplier update cadence in mind once that's known (e.g.
  once we know roughly when Mastex tends to edit the sheet).
- This fits the pattern already used elsewhere for this org: other Luxtronic tools
  (`luxtronic-portal`, `luxtronic-service-form`, `luxtronic-quotation-form`) run as PM2
  services on a shared LAN server (`192.168.68.255`), deployed via `git pull` +
  `pm2 restart`. Confirm with the user whether this catalog tool should join that same
  server/deployment flow, or run somewhere else — see open questions below.
- If the site ends up needing a real backend for other reasons (see §6.4), the sync job
  could instead be a `node-cron` task inside that always-on server process, kept alive by
  PM2 in the usual way, rather than a standalone `--cron` script. Which of these two
  shapes is right depends on the backend question below.

### 6.4 Open questions to resolve before implementing this

- **Where does this run?** The existing LAN pm2 server, or somewhere else? Does that
  server have outbound internet access to reach `docs.google.com`?
- **Static site + JSON, or a real backend?** The plan above keeps things as a static
  site (HTML/CSS/JS + JSON files) refreshed by a periodic script, which is the smallest
  change from what exists today. If the project later wants things like per-user carts,
  order history, multi-user auth, or write-back to the sheet, that implies a real
  Node/Express (or similar) backend instead — worth deciding intent now rather than
  migrating twice.
- **Auth to the sheet:** the current approach relies on the sheet being shared "anyone
  with the link." That's simple but fragile (one accidental permission change breaks the
  sync silently... well, loudly, per §6.2 point 6, but still breaks). A Google service
  account with read-only access via the official Sheets API would be more robust for an
  unattended daily job — worth it once this moves from prototype to production.
  need to weigh setup effort against robustness.
- **Scope:** roll this out to all ~30 vendor tabs, or keep it to the current 3
  (MCHOSE, HOTO, Moondrop) first and add the rest incrementally? If all 30, the vendor hub
  page should probably generate its tiles from the sync job's output (which vendors
  currently have data) instead of the hardcoded `LIVE_VENDORS` / `OTHER_VENDORS` lists in
  `index.html` today.
- ~~**MCHOSE's data is currently mock, not real.**~~ Resolved — MCHOSE is now synced from
  the real sheet like the other two (111 SKUs, not the old hand-picked 33).
- **Cart persistence:** still fine to stay client-side (`localStorage`) as it is today,
  or does "send an order list to Mastex" eventually mean actually emailing/submitting it
  somewhere, which would need a backend endpoint?
- **Alerting on sync failure:** worth a simple notification (email/Slack/etc.) if the
  daily sync fails, so a broken sheet structure or permissions change gets noticed quickly
  rather than the site silently going stale?

## 7. Suggested Build Order

1. ~~Extract the ad-hoc xlsx/image-parsing code from this session into a clean, reusable
   `scripts/sync-catalog.js`.~~ **Done.**
2. ~~Move each vendor's hardcoded `PRODUCTS` array out into `data/<vendor>.json`, and
   change each vendor page to `fetch()` it instead.~~ **Done**, for all three vendors.
3. ~~Point the sync script at HOTO/Moondrop/MCHOSE, replace MCHOSE's mock data with real
   sheet data, add a "Catalog last synced" indicator.~~ **Done.**
4. ~~Wire up the PM2 scheduled job and confirm a full end-to-end run updates the live
   site.~~ **Done** — running locally on this dev machine (see §6's status box for what
   that does and doesn't cover).
5. **Not done / next up:**
   - Resolve the open questions in §6.4 (deployment target, static-vs-backend for the
     long run, sheet auth, whether to expand past 3 vendors, cart/order-submission scope).
   - PM2-survives-reboot setup if this dev machine is where it's meant to keep running.
   - Sync-failure alerting and a diff/changelog log from §6.2 (nice-to-have, not required
     for the daily refresh to work).
   - Generate the vendor hub's "coming soon" tile list from sync output instead of the
     hardcoded `OTHER_VENDORS` array in `index.html`, if/when more vendors are added.
