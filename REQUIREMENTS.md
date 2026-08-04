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
  index.js            Express app: GET /, GET /vendor/:slug, GET /cart
  lib/vendor-theme.js  deterministic per-vendor accent color + initials + slugify
  views/               EJS templates — hub.ejs, vendor.ejs, cart.ejs (one generic
                       vendor.ejs renders every vendor; no per-vendor template)
  public/
    css/site.css        one stylesheet for every page
    js/theme.js          shared light/dark theme (localStorage), same on every page
    js/cart.js           shared "order list" cart (localStorage), same on every page
    js/catalog.js        generic vendor-page behavior (search/sort/favorites/modal/cart)
    js/hub.js            hub page search filter
    js/cart-page.js      /cart page rendering + CSV/text export

sync/
  sync-catalog.js     downloads the sheet, discovers every vendor tab, writes data/*

data/                 GENERATED — gitignored, rebuild with `npm run sync`
  meta.json            vendor list + last-sync summary; the hub and server both read
                       this to know which vendors exist
  <slug>.json           product list per vendor
  images/<slug>/*        product photos per vendor

ecosystem.config.js   PM2: mastex-catalog-server (always on) + mastex-catalog-sync
                       (cron_restart, daily)
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
   square took two attempts — see the incident note in §6.2's predecessor work: `aspect-
   ratio: 1/1` on a flex container whose image child has `height:100%` is unreliable
   (confirmed by measuring rendered pixel dimensions, not just eyeballing a screenshot);
   the fix is the classic `padding-top: 100%` box technique, which has no such dependency.
   This is why `.card-media`/`.modal-media` in `site.css` look the way they do — don't
   "simplify" them back to `aspect-ratio` without re-reading why.
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

## 4. Frontend Spec (current target state)

- One dynamically-rendered page per vendor (`/vendor/:slug`) + one hub (`/`) + one order
  list (`/cart`). No per-vendor HTML file exists; `views/vendor.ejs` is the only template.
- Every vendor page has: search box, favorites (star + "favorites only" filter), sort
  (name/price/stock), grid/list view toggle, stock badges (in stock / low / out /
  discontinued), a "NEW" tag where the sheet's Remark column says so, and a product detail
  modal.
- No category filter chips. A small read-only category/type label on each card (falls
  back to the vendor's own name if the sheet has no category sub-headers for it, e.g.
  Moondrop).
- Cart / order list:
  - "Add to order" control on every card and in the modal; becomes a qty stepper once an
    item is in the cart.
  - Cart persists and is shared across every page (`localStorage`, key `mastexCart_v1`).
  - `/cart` groups by vendor, shows per-vendor and grand totals, and supports CSV export +
    copy-as-text (`Vendor, Product Code, SKU, Description, Qty, Unit Price, Line Total`,
    plus a grand-total row).
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
  ecosystem.config.js` + `pm2 save`).
- **Not done: surviving a machine reboot.** `pm2 save` persists the process list, but PM2
  doesn't auto-start on boot on Windows without extra setup (the `pm2-windows-startup`
  package, or a Task Scheduler entry running `pm2 resurrect` at login). Worth doing before
  relying on this unattended for real — and worth deciding first whether this dev machine,
  or the shared LAN server the org's other PM2 services already run on
  (`192.168.68.255`, deployed via `git pull` + `pm2 restart`), is where this should
  permanently live.

### 6.1 Known bug already hit and fixed here

Testing surfaced a real one: leftover `localStorage` cart data from testing the old
prototype (same `localhost:4173` origin, different cart item shape — `vendor` field
instead of `vendorSlug`/`vendorName`) silently crashed `/cart`'s render (a `.sort()`
comparator call on `undefined.localeCompare`), leaving the page blank with no error shown
to the user. Fixed by making `MastexCart.all()` filter out any entry that doesn't match
the current shape, so a schema change or corrupted entry degrades gracefully instead of
blanking the whole page. If the cart data shape changes again, keep this defensive filter
in mind rather than assuming `localStorage` only ever contains well-formed current data.

### 6.2 Open questions

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

1. Decide the deployment question in §6.2 (this dev machine vs. the shared LAN server) and
   set up PM2 boot persistence accordingly.
2. Sync-failure alerting (§6.2) if the answer to "how would we notice a broken sync" needs
   to be better than "someone happens to check the hub page's warning banner."
3. Decide the cart/order-submission scope (§6.2) if "send to Mastex" needs to become more
   than an exported file.
4. If sheet auth ever becomes a real concern, move from "anyone with the link" to a Google
   service account (§6.2).
