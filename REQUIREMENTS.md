# Mastex Catalog — Requirements & Build Plan

This document is the running record of what this project is, why it's built the way it
is, and what's still open. Read it in full before making further changes — several past
decisions here (the image-extraction technique in particular) took real trial and error to
land on, and the reasoning is worth not re-deriving.

**Current state: a real Express server, not a prototype.** The `prototype/` folder from
earlier in this project is retired — it was a static-HTML demo covering 3 hand-picked
vendors and is no longer used by anything. The live app lives in `server/` + `sync/` +
`data/` (§2) and dynamically serves **all 30 vendor tabs** in the sheet, not a curated
subset — see §6 for how.

## 1. Background

Mastex is a distributor/supplier that carries 30+ product brands ("vendors") in one shared
Google Sheet:

- Sheet name: `Price List with SOH_U`
- URL: `https://docs.google.com/spreadsheets/d/1FJ_I-othbHcsSF8H1DDkrrJb0OfNAPL5AOje-Bl4q9Y/edit`
- Sharing: "Anyone with the link" (view access, no sign-in required)
- One tab per vendor. As of this writing: `Keychron`, `Fantech`, `YUNZII`, `MCHOSE`,
  `Nuphy`, `HOTO`, `Lofree`, `MAONO`, `Moondrop`, `Pulsar`, `Qwerty Keys`, `WOBKEY`,
  `Choetech`, `Melgeek`, `IQUNIX`, `ARBITERSTUDIO`, `Gamdias`, `DarkFlash`, `FSP`, `LAMZU`,
  `WLMouse`, `Valkyrie`, `Dry Studio  ANGRYMIAO`, `Keytok`, `Pwnage`, `VARMILO`, `HP`,
  `SiliconPower`, `PNY`, `Unitek` — plus `New Items` / `All Items` (aggregate views, not a
  single vendor's list) and a hidden `Promotion` tab. **This list is not hardcoded
  anywhere in the app** — `sync/sync-catalog.js` discovers it fresh from the workbook every
  run (see §6), so a vendor Mastex adds or removes shows up without a code change.
- Each vendor tab has the same column layout: `Product Code, Description, SKU, Remark
  (NEW/EOL/blank), Image, SOH, Price (ex), RRP, Margin, EAN, Weight (g), Length (cm), Width
  (cm), Height (cm), Link`. Some tabs also have category sub-header rows (a row with only
  column B filled in, e.g. "Precision SCREWDRIVERS") that group the rows below them; others
  (e.g. Moondrop) have none.
- **Product photos are pasted directly into the Image column as floating images**, not
  as cell values or `=IMAGE()` formulas. They are not retrievable via CSV/gviz export —
  see §5.2 for the extraction method that does work.
- Luxtronic (the user's org) wants an internal tool to browse this catalog more pleasantly
  than a raw spreadsheet, and to build a purchase order list to send back to Mastex.

## 2. What Exists Today

```
server/
  index.js            Express app: GET /, GET /vendor/:slug, GET /cart, GET /favorites,
                       plus GET /api/favorites[/:slug] + POST /api/favorites/toggle,
                       plus POST /api/sync + GET /api/sync/status (see below)
  lib/vendor-theme.js  deterministic per-vendor accent color + initials + slugify
  views/               EJS templates — hub.ejs, vendor.ejs, cart.ejs, favorites.ejs (one
                       generic vendor.ejs renders every vendor; no per-vendor template)
  public/
    css/site.css          one stylesheet for every page
    js/theme.js            shared light/dark theme (localStorage), same on every page
    js/cart.js             shared "order list" cart (localStorage), same on every page
    js/product-helpers.js  shared stock/price/image/cart-item logic — used by both
                           catalog.js and favorites.js so the two can't drift apart
    js/catalog.js          generic vendor-page behavior (search/sort/modal/cart), favorites
                           loaded from/saved to the server, not kept in memory
    js/favorites.js        the /favorites page: cross-vendor grid, remove-to-unfavorite
    js/favorites-badge.js  the small "N favorited" badge shown next to the nav link
    js/hub.js              hub page search filter + "Sync now" button
    js/cart-page.js        /cart page rendering + CSV/text export

sync/
  sync-catalog.js     downloads the sheet, discovers every vendor tab, writes data/*

data/                 mostly GENERATED — gitignored except favorites.json (see below)
  meta.json            vendor list + last-sync summary; the hub and server both read
                       this to know which vendors exist
  <slug>.json           product list per vendor
  images/<slug>/*        product photos per vendor
  favorites.json        NOT generated — real user state (see §4), tracked in git via a
                        `.gitignore` exception (`/data/*` + `!/data/favorites.json`)

.env / .env.example   PORT, SHEET_ID — see §6 for how these are loaded and where PORT
                       actually gets decided when running under PM2
ecosystem.config.js   PM2: mastex-catalog-server (always on, port from here — see §6) +
                       mastex-catalog-sync (cron_restart, daily)
prototype/            RETIRED. Static 3-vendor demo from before this rebuild. Nothing
                       reads from or writes to this folder anymore — do not add to it.
```

How a request is served: `GET /vendor/:slug` reads `data/meta.json` to find that slug's
display name + `data/<slug>.json` for its products, computes a theme color, and renders
`views/vendor.ejs` with all of it. There is no per-vendor route, template, or file — the
same code path serves all 30 vendors today and whatever Mastex adds tomorrow, as soon as
the next sync writes a new `data/<slug>.json`.

There is still no real backend beyond this — no database, no auth, no order-submission
endpoint. "Live" means: the scheduled sync script rewrites `data/*` on disk, and the
server reads that fresh on every request. The cart/order-list is entirely client-side
(`localStorage`), shared across pages via a `cart:change` event and a common storage key.
Favorites are the one exception — see §4.

## 3. Requirements Gathered So Far (chronological)

1. Build a prototype: plain demo HTML, no real functionality needed at first. Goal: pull
   the supplier's catalog from the Google Sheet above and present it as a nicer
   reading/browsing experience than the raw sheet, with search and other "nice to have"
   features.
2. Don't organize it as one big mixed catalog — Mastex carries many vendors, so it should
   be **"one vendor, one page"** with search and favorites per vendor. Investigate whether
   product photos can be pulled from the sheet. Build a demo for two smaller vendors first
   (**HOTO** and **Moondrop**) to prove it out before doing the rest.
3. Remove category-filter chips from each vendor page — just "all products," search is
   enough. (A small read-only category label per card is fine to keep.)
4. Add a working **cart**: add items across any vendor page, export the combined list as
   an **order list** (CSV + copy-as-text) to send to Mastex later.
5. UI polish: product images must all be the **same size**; the cart and dark-mode icons
   must sit on the **right edge** of the top bar; dark mode must **default to light** and
   **stay consistent across every page** once toggled.
6. Product images must be **strictly square**, achieved by **shrinking to fit, never
   cropping** (`object-fit: contain`, not `cover`). Getting the box itself to actually stay
   square took two attempts: `aspect-ratio: 1/1` on a flex container whose image child has
   `height:100%` is unreliable (confirmed by measuring rendered pixel dimensions, not just
   eyeballing a screenshot); the fix is the classic `padding-top: 100%` box technique,
   which has no such dependency. This is why `.card-media`/`.modal-media` in `site.css`
   look the way they do — don't "simplify" them back to `aspect-ratio` without re-reading
   why.
7. Write up everything requested into a doc for a future session (this document), and
   look into automating the daily refresh with **Node + PM2** since the supplier updates
   the sheet daily. Explicitly told to write the doc first and not touch code that turn.
8. Asked, exploratory: *could this run as a Node server that regenerates HTML on a
   schedule instead of static files + fetch?* Answered as a tradeoff (own server process
   vs. static files), not yet a decision to act on.
9. **The actual decision, superseding #8's static-fetch approach and #2's 3-vendor
   scope:** run it as a real Node server; prices/stock must update automatically; and
   critically — **when Mastex starts carrying a new vendor, the app must generate a
   working page for it automatically**, with no manual page-building. Also: stop treating
   this as a prototype — retire `prototype/`, don't add to or depend on anything in it
   going forward. This is what drove the rebuild into `server/` + `sync/` + `data/`
   described in §2, and the switch from 3 hardcoded vendor pages to all 30 discovered
   dynamically (§6).
10. **Favorites reported "not working."** Root cause: favorites had only ever been kept
    in an in-memory `Set()` that reset on every page load/navigation — clicking the star
    did nothing durable. Asked to fix it by "just creating a JSON file to store the data."
    Since there's no per-user login, implemented as one **shared** favorites list
    (`data/favorites.json`) via `GET/POST /api/favorites*`, not per-browser
    `localStorage` — a deliberate choice, not an oversight (see §4).
11. Asked for an **"All Favourites" button on the hub + a page showing every favorited
    item across all vendors** (`/favorites`, §2/§4) — the natural next step once
    favorites were shared/persistent rather than per-vendor-page-only.
12. Asked to **create a real `.env` and use it in the program** — moved `PORT` and
    `SHEET_ID` out of hardcoded values into `.env`/`.env.example` (§6).
13. Changed the run port to **8002** and simplified `ecosystem.config.js` back to plain
    hardcoded values (no `dotenv` inside that file) — see §6 for exactly how `.env` and
    PM2 interact now that they're not both loading dotenv the same way.
14. Added a **"Sync now" button on the hub page** so someone doesn't have to wait for the
    3am cron or SSH in and run `npm run sync` to pull a same-day price/stock change —
    see §6.2.
15. Since this tool is **internal-only** (staff, not customers), the product detail modal
    now shows the **ex price, inc (RRP) price, and margin %** together, not just RRP —
    deliberately kept off the small grid card (which stays customer-simple with just the
    RRP) and added only to the modal ("the bigger card"). `margin` was already computed
    per product by `sync/sync-catalog.js` (`Math.round((1 - priceEx/rrp) * 100)`) and
    already in every `data/<slug>.json`, so this was a display-only change — no sync/data
    changes needed. Implemented once in `MastexProduct.modalPriceHtml()`
    (`server/public/js/product-helpers.js`) and used by both `catalog.js`'s and
    `favorites.js`'s modals so they can't drift apart, same pattern as the other shared
    card-rendering helpers in that file.
16. **Superseding #15's "keep the grid card simple" choice:** the ex price should show on
    the small grid card too, not just the modal — still internal-only, no customer-facing
    view exists to protect. `MastexProduct.priceHtml()` (same file) now renders RRP (inc)
    stacked above a smaller `$X ex` line (`.card-price-wrap`/`.card-price-ex` in
    `site.css`); margin % stays modal-only since it doesn't fit the small card as cleanly
    as a two-line price does. Grid and list view both use the same markup, so no separate
    list-mode styling was needed.
17. **Ex price promoted to the primary figure everywhere, superseding #15/#16's RRP-first
    layout, and the cart is now ex-based.** Card, modal, and cart unit price all swapped to
    show the ex price large/first with RRP (inc) smaller/second underneath (renamed the
    now-generic secondary-price CSS classes from `*-price-ex` to `*-price-sub`/`item-price-inc`
    since the "ex" one moved to being the primary, not the secondary, figure). More than a
    display swap: `MastexProduct.cartItemMeta()` now sets `price: prod.priceEx` (was
    `prod.rrp`) plus a new `priceInc: prod.rrp` kept only for the smaller reference line —
    so `MastexCart.totalValue()`, the CSV export, and copy-as-text are now all ex-price
    totals, matching what Mastex actually invoices on. The `/cart` page's grand total shows
    the ex total large with the inc-equivalent total smaller beneath, same pattern as each
    line item. Vendor price-sort (`catalog.js`/`favorites.js`) now sorts by `priceEx` too.
    **Cart schema change:** existing `localStorage` cart entries from before this change
    have `price` = old RRP and no `priceInc` — they'll display/total against the old
    (inc) number until re-added or the cart is cleared (the "Clear order list" button).
    Not auto-migrated; same class of issue as the schema mismatch noted in §6.1, but no
    corrupt-data crash risk this time since `price` was already just a number either way.
18. **Correction to #17: "inc" and RRP are not the same number.** #17 treated the sheet's
    RRP column as if it *were* the GST-inclusive version of the ex price and labeled it
    "inc" — wrong. There are genuinely **three** distinct prices: `priceEx` (sheet, cost ex
    GST), **inc = `priceEx × 1.1`** (GST-inclusive cost — computed, not a sheet column,
    since Mastex's sheet has no separate inc-cost column), and `rrp` (sheet, the
    recommended *sale* price — unrelated to GST, it's a margin/markup figure). Card, modal,
    and cart now all show **all three**: ex large/primary, then a combined smaller line
    `$X inc · $Y RRP` (`priceSubline()`/`incPrice()` in `product-helpers.js`, mirrored
    locally in `cart-page.js` since that page doesn't load `product-helpers.js`). Renamed
    the cart item field (again) from #17's `priceInc` to **`priceRrp`** now that it
    unambiguously holds the RRP, not an inc figure — `MastexCart.totalValue()` stays
    ex-only; the RRP total and the derived inc total are both recomputed for the `/cart`
    summary's smaller reference line, never summed as cost. CSV/copy-as-text are
    unaffected (still ex-only, per #17). Same schema-drift caveat as #17: pre-existing
    `localStorage` entries have neither `priceRrp` nor the old `priceInc`, so their
    reference line is simply blank until re-added.

## 4. Frontend Spec (current target state)

- One dynamically-rendered page per vendor (`/vendor/:slug`) + one hub (`/`) + one order
  list (`/cart`) + one cross-vendor favorites view (`/favorites`). No per-vendor HTML file
  exists; `views/vendor.ejs` is the only template for vendor pages.
- Every vendor page has: search box, favorites (star + "favorites only" filter), sort
  (name/price/stock), grid/list view toggle, stock badges (in stock / low / out /
  discontinued), a "NEW" tag where the sheet's Remark column says so, and a product detail
  modal. Internal-only, ex-price-first pricing (§3.15–18): three distinct prices exist —
  ex (sheet, cost ex GST), inc (`ex × 1.1`, GST-inclusive cost — computed, not a sheet
  column), and RRP (sheet, recommended sale price, unrelated to GST). Every card (grid or
  list) and the modal show ex as the large/primary figure with a smaller combined
  `$X inc · $Y RRP` line underneath; the modal additionally shows margin % (cost vs RRP).
  The cart/order-list (below) totals ex only — inc and RRP are both reference-only there.
- No category filter chips. A small read-only category/type label on each card (falls
  back to the vendor's own name if the sheet has no category sub-headers for it, e.g.
  Moondrop).
- Favorites are **shared, not per-browser** — persisted server-side in
  `data/favorites.json` via `GET/POST /api/favorites*` (`server/index.js`), not
  `localStorage`. There's no per-user login yet, so "favorited" currently means "favorited
  by anyone using the tool," same as the cart conceptually is one shared order list. If
  per-user favorites/logins ever get built, this is the piece that needs to change.
  - Every vendor page's star button reads/writes this on click (optimistic UI update,
    reverts if the request fails) instead of a local variable that used to reset on every
    reload — that reset was the original bug report this fixed.
  - `/favorites` (hub has an "All Favourites" nav button + live count badge) resolves
    every `{vendorSlug, code}` pair against each vendor's current `data/<slug>.json` and
    shows them as normal product cards (real price/stock/image, "Add to order" works),
    labeled by vendor instead of category. Clicking the star here removes it entirely
    rather than just toggling a filter.
- Cart / order list:
  - "Add to order" control on every card and in the modal; becomes a qty stepper once an
    item is in the cart.
  - Cart persists and is shared across every page (`localStorage`, key `mastexCart_v1`).
  - `/cart` groups by vendor, shows per-vendor and grand totals (all ex-price, §3.17–18 —
    inc/RRP shown smaller as reference only, never summed), and supports CSV export +
    copy-as-text (`Vendor, Product Code, SKU, Description, Qty, Unit Price, Line Total` —
    Unit Price/Line Total are ex, plus a grand-total row).
- Theme: light by default, persisted (`localStorage`, key `mastexTheme_v1`), identical on
  every page, toggle in the top-right of the top bar.
- Cart and theme icons pinned to the right edge of the top bar on every page
  (`.topbar-actions{margin-left:auto}` — the search box's `max-width` otherwise leaves
  them stranded short of the actual right edge).
- Product images: strict 1:1 square (`padding-top:100%` box, not `aspect-ratio` — see §3.6),
  `object-fit: contain` (never cropped), with a clean "No image in sheet" placeholder for
  products missing a photo.
- Every vendor gets a distinct, deterministic accent color (`server/lib/vendor-theme.js`,
  hash of the vendor name against a 15-color palette) — necessary now that colors can't be
  hand-picked for 30+ vendors one at a time.

## 5. Data & Image Pipeline

### 5.1 Row data

Row data is parsed directly from the exported `.xlsx`'s worksheet XML (§5.2), not via the
Google Visualization API (`gviz`) — the two initially seemed interchangeable, but `gviz`
disagreed with the "true" row numbers in at least one sheet (a stray row shifted HOTO's
data by one), which matters a lot once you're using row numbers to match products to
images. Parsing the same XML for both row data and image anchors keeps them intrinsically
aligned.

### 5.2 Product images

Google Sheets does **not** expose pasted/floating images through CSV, gviz, or the
regular Sheets API `values.get` endpoint. The technique that works:

1. Export the **entire spreadsheet** as `.xlsx`:
   `https://docs.google.com/spreadsheets/d/1FJ_I-othbHcsSF8H1DDkrrJb0OfNAPL5AOje-Bl4q9Y/export?format=xlsx`
   (~52MB for the full 30-vendor workbook — `sync/sync-catalog.js` downloads this fresh
   every run via the global `fetch()`, which follows the redirect Google issues
   automatically).
2. An `.xlsx` is a zip archive — `sync-catalog.js` reads it in-memory with `adm-zip`, no
   temp files.
3. `xl/workbook.xml` maps each sheet's `name` + `state` (`visible`/`hidden`) to a
   `sheetN.xml` file via `xl/_rels/workbook.xml.rels`. Vendor discovery = every `visible`
   sheet not in the small exclusion list (`New Items`, `All Items`, `Promotion`).
4. `xl/worksheets/_rels/sheetN.xml.rels` points to that sheet's `drawingM.xml` (if it has
   floating images — some small vendor tabs have none).
5. `xl/drawings/drawingM.xml` has one `<xdr:oneCellAnchor>` (or `twoCellAnchor`) per
   image, each with a 0-indexed `<xdr:row>` and an `r:embed` relationship ID.
6. `xl/drawings/_rels/drawingM.xml.rels` maps that relationship ID to the real file in
   `xl/media/imageNNN.<ext>`.
7. Cross-reference the anchor's row against that same sheet's row data (parsed from the
   same worksheet XML, so row numbers can't disagree) to know which product each image
   belongs to.

Not every row has an image (color variants often share one photo, EOL rows often have
none) — `mediaHtml()` in `catalog.js` shows a "No image in sheet" placeholder rather than
erroring when a product has no matching image. Images are only rewritten to disk when
their content hash actually changes, so a daily sync doesn't touch hundreds of unchanged
files.

## 6. Automation: Node Server + Daily Sync

**Status: implemented and running locally.**

- `sync/sync-catalog.js` downloads the workbook, discovers every visible non-excluded
  sheet (currently 30), and for each one writes `data/<slug>.json` (products) and
  `data/images/<slug>/*` (photos, hash-skip on unchanged), plus one combined
  `data/meta.json` (vendor list + counts + sync timestamp + any per-vendor errors).
- `server/index.js` is a normal Express app, not a static file server: `GET /` and
  `GET /vendor/:slug` render EJS templates from whatever is currently in `data/`. Adding a
  vendor requires zero code changes — the next sync writes a new `data/<slug>.json` and
  `/vendor/<that-slug>` starts working immediately. Verified end-to-end: `keychron`,
  `fantech`, and every other tab that was never manually built before this rebuild render
  correctly the same way `hoto` and `moondrop` (the two originally hand-built ones) do.
- `ecosystem.config.js` defines two PM2 apps:
  - `mastex-catalog-server` — always on, serves the site.
  - `mastex-catalog-sync` — `cron_restart: "0 3 * * *"`, `autorestart: false`: runs once
    daily and exits until the next trigger. A price/stock/photo change in the sheet is
    live on the site by the next morning with no manual step.
- Both are running locally on this dev machine right now (`pm2 start
  ecosystem.config.js` + `pm2 save`), currently serving on **port 8002**.
- **Config comes from `.env`** (copy `.env.example` to `.env` — gitignored, not
  committed): `PORT` and `SHEET_ID`. Both `server/index.js` and `sync/sync-catalog.js`
  load `.env` themselves independently, so `node server/index.js` / `npm run serve` work
  correctly even outside PM2. `ecosystem.config.js` does **not** load `dotenv` itself
  (that was tried and deliberately reverted back to plain hardcoded values) — its `env:
  { PORT: ... }` block hardcodes the port PM2 actually launches the server with, and
  that value **wins over `.env`'s `PORT`** whenever PM2 is what starts the process
  (PM2 sets `process.env.PORT` on the child before the child's own `dotenv.config()`
  runs, and dotenv doesn't override an already-set variable). **If you change the port,
  change it in both `.env` and `ecosystem.config.js`** — nothing keeps them in sync
  automatically, and disagreeing between "run via PM2" and "run directly" is exactly the
  kind of thing that's confusing to debug later.
- **Not done: surviving a machine reboot.** `pm2 save` persists the process list, but PM2
  doesn't auto-start on boot on Windows without extra setup (the `pm2-windows-startup`
  package, or a Task Scheduler entry running `pm2 resurrect` at login). Worth doing before
  relying on this unattended for real — and worth deciding first whether this dev machine,
  or the shared LAN server the org's other PM2 services already run on
  (`192.168.68.255`, deployed via `git pull` + `pm2 restart`), is where this should
  permanently live.

### 6.1 Known bugs already hit and fixed here

- Leftover `localStorage` cart data from testing the old prototype (same origin,
  different cart item shape — `vendor` field instead of `vendorSlug`/`vendorName`)
  silently crashed `/cart`'s render (a `.sort()` comparator call on
  `undefined.localeCompare`), leaving the page blank with no error shown to the user.
  Fixed by making `MastexCart.all()` filter out any entry that doesn't match the current
  shape, so a schema change or corrupted entry degrades gracefully instead of blanking
  the whole page. If the cart data shape changes again, keep this defensive filter in
  mind rather than assuming `localStorage` only ever contains well-formed current data.
- **`.gitignore`'s `/data/` rule silently defeated its own exception.** The intent was
  "ignore everything generated in `data/`, except `favorites.json` (real user state)":
  `/data/` followed by `!/data/favorites.json`. This doesn't work — a bare directory
  pattern (`/data/`) tells git not to even *look inside* the directory, so the negation
  line is never reached and `favorites.json` stayed untracked/uncommitted. The fix is
  `/data/*` (ignore the directory's *contents* by default, which still lets git evaluate
  per-file negation rules) + `!/data/favorites.json`. If more real-state files ever need
  to live alongside the generated `data/*.json`, this is the pattern to reuse — a bare
  `/data/` will just as silently swallow future exceptions too.

### 6.2 Manual sync from the hub page

The hub (`views/hub.ejs`) has a **"Sync now"** button next to the "last synced" banner,
for pulling a same-day sheet change without waiting for the 3am cron.

- `POST /api/sync` (`server/index.js`) spawns `sync/sync-catalog.js` as a **child
  process** (`child_process.spawn`, not `require`'d in-process) — the same script the PM2
  cron job runs, so there's exactly one sync code path either way. Spawning it keeps the
  ~50MB download + parse off the server's event loop, so normal page requests keep being
  served while a sync runs.
- Server-side in-memory `syncState` (`{ running, startedAt, finishedAt, exitCode, log }`)
  tracks the one sync that can be in flight at a time — a second `POST /api/sync` while
  one is already running gets `409` rather than spawning a second process. This is
  in-memory (not persisted), which is fine: there's one server process and no
  login/session split to keep in sync across.
- `GET /api/sync/status` returns that state; `hub.js` polls it every 1.5s after clicking
  the button (or on page load, if a sync — from another tab, or the daily cron — was
  already running when the page loaded) and reloads the page once it finishes
  successfully, so the vendor tiles/SKU counts reflect the fresh data without a manual
  refresh.
- No auth on `/api/sync` — acceptable for now since the whole app has no login (§4's
  favorites/cart are already "shared, not per-user" for the same reason). Revisit if this
  ever moves off the LAN.

### 6.3 Open questions

- **Where does this run long-term?** This dev machine, or the shared LAN server? Does
  that server have outbound internet access to reach `docs.google.com`?
- **Auth to the sheet:** currently relies on "anyone with the link." Fine for now; a
  Google service account via the official Sheets API would be more robust for an
  unattended job once this matters for real, at the cost of setup effort.
- **Cart / order-list scope:** still fine to stay client-side (`localStorage`), or does
  "send an order list to Mastex" eventually mean actually emailing/submitting it
  somewhere (which would need a real backend endpoint)?
- **Sync-failure alerting:** worth a simple notification (email/Slack/etc.) if the daily
  sync fails, so a broken sheet structure or permissions change gets noticed quickly
  rather than the site silently going stale? `data/meta.json.errors` already captures
  per-vendor failures and the hub page surfaces a warning banner when `errors.length > 0`
  — there's just no push notification on top of that yet.
- **New Items / All Items tabs:** currently excluded as non-vendor aggregate views. Worth
  a dedicated page later if someone wants a cross-vendor "what's new" view, but that's a
  different data shape (spans multiple vendors) and out of scope for now.

## 7. Suggested Next Steps

1. Decide the deployment question in §6.3 (this dev machine vs. the shared LAN server) and
   set up PM2 boot persistence accordingly.
2. Sync-failure alerting (§6.3) if the answer to "how would we notice a broken sync" needs
   to be better than "someone happens to check the hub page's warning banner."
3. Decide the cart/order-submission scope (§6.3) if "send to Mastex" needs to become more
   than an exported file.
4. If sheet auth ever becomes a real concern, move from "anyone with the link" to a Google
   service account (§6.3).
