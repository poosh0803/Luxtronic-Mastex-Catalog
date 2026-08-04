#!/usr/bin/env node
/**
 * Mastex catalog sync.
 *
 * Downloads the supplier's Google Sheet as .xlsx, parses the configured vendor
 * tabs (row data + the images pasted into the Image column), and writes:
 *   - data/<vendor>.json   product list per vendor, consumed by <vendor>.html
 *   - data/meta.json       last-sync summary, consumed by the site for a
 *                          "catalog last updated" indicator
 *   - assets/<vendor>/*    product photos (only rewritten when changed)
 *
 * Run manually with `npm run sync`, or on a schedule via PM2 (see
 * ecosystem.config.js). See REQUIREMENTS.md §5.2 for how/why the image
 * extraction works the way it does.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");

const SHEET_ID = "1FJ_I-othbHcsSF8H1DDkrrJb0OfNAPL5AOje-Bl4q9Y";
const WORKBOOK_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "prototype", "data");
const ASSETS_DIR = path.join(ROOT, "prototype", "assets");

// Which vendor tabs to sync, and what slug/output-folder each maps to.
const VENDORS = [
  { sheetName: "HOTO", slug: "hoto" },
  { sheetName: "Moondrop", slug: "moondrop" },
  { sheetName: "MCHOSE", slug: "mchose" },
];

// Column layout shared by every vendor tab in the sheet.
const COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];
const FIELDS = [
  "code", "desc", "sku", "remark", "imgCell", "soh", "priceEx", "rrp",
  "margin", "ean", "weight", "length", "width", "height", "link",
];

// ---------------------------------------------------------------------------
// XML helpers (no XML parser dependency — the sheet's XML is simple enough
// that a few targeted regexes are reliable and keep this script dependency-light).
// ---------------------------------------------------------------------------

function decodeXmlEntities(s) {
  if (s == null) return s;
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readEntryText(zip, entryPath) {
  const entry = zip.getEntry(entryPath);
  if (!entry) return null;
  return zip.readAsText(entry, "utf8");
}

function readEntryBuffer(zip, entryPath) {
  const entry = zip.getEntry(entryPath);
  if (!entry) return null;
  return zip.readFile(entry);
}

function resolveRelative(baseDir, target) {
  // baseDir like "xl/worksheets", target like "../drawings/drawing8.xml"
  return path.posix.normalize(path.posix.join(baseDir, target));
}

function parseRelationships(xml) {
  // Returns { rId: target }
  const map = {};
  const re = /<Relationship\s+Id="(rId\d+)"[^>]*Target="([^"]+)"/g;
  let m;
  while ((m = re.exec(xml))) map[m[1]] = m[2];
  return map;
}

function parseSharedStrings(zip) {
  const xml = readEntryText(zip, "xl/sharedStrings.xml");
  if (!xml) return [];
  const strings = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const text = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("");
    strings.push(decodeXmlEntities(text));
  }
  return strings;
}

function parseSheetMap(zip) {
  // sheet name -> { sheetPath }
  const workbookXml = readEntryText(zip, "xl/workbook.xml");
  const relsXml = readEntryText(zip, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) throw new Error("workbook.xml or its rels file is missing from the exported .xlsx");

  const rels = parseRelationships(relsXml);
  const map = {};
  const sheetRe = /<sheet\b[^>]*\/>/g;
  let m;
  while ((m = sheetRe.exec(workbookXml))) {
    const tag = m[0];
    const nameMatch = tag.match(/name="([^"]*)"/);
    const ridMatch = tag.match(/r:id="(rId\d+)"/);
    if (!nameMatch || !ridMatch) continue;
    const name = decodeXmlEntities(nameMatch[1]);
    const target = rels[ridMatch[1]];
    if (!target) continue;
    map[name] = { sheetPath: resolveRelative("xl", target) };
  }
  return map;
}

function parseRows(zip, sheetPath, sharedStrings) {
  const xml = readEntryText(zip, sheetPath);
  if (!xml) throw new Error(`Worksheet not found in workbook: ${sheetPath}`);

  const rows = {};
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xml))) {
    const rowNum = Number(rowMatch[1]);
    const rowXml = rowMatch[2];
    // Handles both self-closing cells (<c .../>) and cells with content
    // (<c ...>...</c>) — a naive regex that only matches the latter will
    // silently swallow the NEXT cell's content when it hits a self-closing
    // one, misattributing values to the wrong column.
    const cellRe = /<c r="([A-Z]+)(\d+)"([^\/>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    const rowObj = {};
    while ((cellMatch = cellRe.exec(rowXml))) {
      const col = cellMatch[1];
      const attrs = cellMatch[3];
      const inner = cellMatch[4];
      const isString = /t="s"/.test(attrs);
      const vMatch = inner ? inner.match(/<v>([\s\S]*?)<\/v>/) : null;
      let val = vMatch ? vMatch[1] : undefined;
      if (isString && val !== undefined) val = sharedStrings[Number(val)];
      rowObj[col] = decodeXmlEntities(val);
    }
    rows[rowNum] = rowObj;
  }
  return rows;
}

function parseSheetImages(zip, sheetPath) {
  // Returns Map(rowNum1Indexed -> media zip path), or empty map if the sheet has no drawing.
  const sheetFile = path.posix.basename(sheetPath);
  const sheetRelsPath = resolveRelative(path.posix.dirname(sheetPath), `_rels/${sheetFile}.rels`);
  const sheetRelsXml = readEntryText(zip, sheetRelsPath);
  if (!sheetRelsXml) return new Map();

  const drawingRelMatch = sheetRelsXml.match(
    /<Relationship[^>]*Type="[^"]*\/drawing"[^>]*Target="([^"]+)"/
  );
  if (!drawingRelMatch) return new Map();

  const drawingPath = resolveRelative(path.posix.dirname(sheetPath), drawingRelMatch[1]);
  const drawingXml = readEntryText(zip, drawingPath);
  if (!drawingXml) return new Map();

  const drawingFile = path.posix.basename(drawingPath);
  const drawingRelsPath = resolveRelative(path.posix.dirname(drawingPath), `_rels/${drawingFile}.rels`);
  const drawingRelsXml = readEntryText(zip, drawingRelsPath);
  const drawingRels = drawingRelsXml ? parseRelationships(drawingRelsXml) : {};

  const anchorRe = /<xdr:(?:one|two)CellAnchor>[\s\S]*?<\/xdr:(?:one|two)CellAnchor>/g;
  const map = new Map();
  let anchorMatch;
  while ((anchorMatch = anchorRe.exec(drawingXml))) {
    const anchor = anchorMatch[0];
    const fromMatch = anchor.match(/<xdr:from>\s*<xdr:col>\d+<\/xdr:col>[^<]*<xdr:colOff>\d+<\/xdr:colOff>\s*<xdr:row>(\d+)<\/xdr:row>/);
    const embedMatch = anchor.match(/r:embed="(rId\d+)"/);
    if (!fromMatch || !embedMatch) continue;
    const row0 = Number(fromMatch[1]);
    const target = drawingRels[embedMatch[1]];
    if (!target) continue;
    const mediaPath = resolveRelative(path.posix.dirname(drawingPath), target);
    map.set(row0 + 1, mediaPath); // anchors are 0-indexed; sheet rows are 1-indexed
  }
  return map;
}

// ---------------------------------------------------------------------------
// Field formatting
// ---------------------------------------------------------------------------

function toNumber(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.\-eE]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatEan(v) {
  if (!v) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : String(v);
}

function formatDims(length, width, height) {
  const parts = [length, width, height]
    .map((v) => (v === undefined || v === null || v === "" ? null : toNumber(v)))
    .map((v) => (v === null ? "—" : String(v)));
  if (parts.every((p) => p === "—")) return "";
  return `${parts[0]} × ${parts[1]} × ${parts[2]} cm`;
}

// ---------------------------------------------------------------------------
// Per-vendor extraction
// ---------------------------------------------------------------------------

function extractVendor(zip, sheetMap, sharedStrings, vendor) {
  const sheetInfo = sheetMap[vendor.sheetName];
  if (!sheetInfo) {
    throw new Error(
      `Tab "${vendor.sheetName}" was not found in the workbook. Vendor tabs may have been ` +
      `renamed — check the sheet and update VENDORS in scripts/sync-catalog.js.`
    );
  }

  const rows = parseRows(zip, sheetInfo.sheetPath, sharedStrings);
  const images = parseSheetImages(zip, sheetInfo.sheetPath);

  const rowNums = Object.keys(rows).map(Number).sort((a, b) => a - b);
  const maxRow = rowNums.length ? rowNums[rowNums.length - 1] : 1;

  const products = [];
  let currentCategory = null;

  for (let r = 2; r <= maxRow; r++) {
    const row = rows[r];
    if (!row) continue;

    const code = row.A;
    const desc = row.B;

    if (!code && desc) {
      // A category sub-header row (blank Product Code, text in Description).
      currentCategory = desc.trim();
      continue;
    }
    if (!code) continue; // fully blank row

    const raw = {};
    FIELDS.forEach((field, i) => { raw[field] = row[COLUMNS[i]]; });

    const priceEx = toNumber(raw.priceEx);
    const rrp = toNumber(raw.rrp);
    const imagePath = images.get(r) || null;

    products.push({
      code: code.trim(),
      name: (raw.desc || "").trim(),
      sku: (raw.sku || code).trim(),
      category: currentCategory,
      remark: (raw.remark || "").trim(),
      soh: Math.round(toNumber(raw.soh)),
      priceEx,
      rrp,
      margin: rrp ? Math.round((1 - priceEx / rrp) * 100) : 0,
      ean: formatEan(raw.ean),
      weight: raw.weight ? `${toNumber(raw.weight)} g` : "",
      dims: formatDims(raw.length, raw.width, raw.height),
      link: (raw.link || "").trim(),
      _imageZipPath: imagePath, // resolved to a real filename + written to disk below; not part of the public JSON
    });
  }

  return products;
}

function writeVendorImages(zip, vendor, products) {
  const outDir = path.join(ASSETS_DIR, vendor.slug);
  fs.mkdirSync(outDir, { recursive: true });

  let written = 0;
  let unchanged = 0;
  let missing = 0;

  for (const product of products) {
    if (!product._imageZipPath) {
      product.image = null;
      missing++;
      continue;
    }
    const buf = readEntryBuffer(zip, product._imageZipPath);
    if (!buf) {
      product.image = null;
      missing++;
      continue;
    }
    const ext = path.posix.extname(product._imageZipPath) || ".png";
    const filename = `${product.code}${ext}`;
    const destPath = path.join(outDir, filename);

    const newHash = crypto.createHash("sha256").update(buf).digest("hex");
    let existingHash = null;
    if (fs.existsSync(destPath)) {
      existingHash = crypto.createHash("sha256").update(fs.readFileSync(destPath)).digest("hex");
    }

    if (existingHash === newHash) {
      unchanged++;
    } else {
      fs.writeFileSync(destPath, buf);
      written++;
    }
    product.image = filename;
  }

  for (const product of products) delete product._imageZipPath;

  return { written, unchanged, missing };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function downloadWorkbook() {
  console.log(`Downloading workbook from ${WORKBOOK_URL} ...`);
  const res = await fetch(WORKBOOK_URL);
  if (!res.ok) {
    throw new Error(`Failed to download the workbook: HTTP ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  console.log(`Downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB.`);
  return buf;
}

async function main() {
  const startedAt = new Date();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const workbookBuf = await downloadWorkbook();
  const zip = new AdmZip(workbookBuf);

  console.log("Parsing shared strings and sheet map...");
  const sharedStrings = parseSharedStrings(zip);
  const sheetMap = parseSheetMap(zip);

  const meta = { syncedAt: startedAt.toISOString(), vendors: {}, errors: [] };

  for (const vendor of VENDORS) {
    console.log(`\n--- ${vendor.sheetName} (data/${vendor.slug}.json) ---`);
    try {
      const products = extractVendor(zip, sheetMap, sharedStrings, vendor);
      const imgStats = writeVendorImages(zip, vendor, products);

      const outPath = path.join(DATA_DIR, `${vendor.slug}.json`);
      fs.writeFileSync(outPath, JSON.stringify(products, null, 2));

      console.log(
        `${products.length} products. Images: ${imgStats.written} written, ` +
        `${imgStats.unchanged} unchanged, ${imgStats.missing} missing.`
      );

      meta.vendors[vendor.slug] = {
        sheetName: vendor.sheetName,
        productCount: products.length,
        imagesWritten: imgStats.written,
        imagesMissing: imgStats.missing,
        syncedAt: startedAt.toISOString(),
      };
    } catch (err) {
      console.error(`FAILED to sync ${vendor.sheetName}: ${err.message}`);
      meta.errors.push({ vendor: vendor.slug, message: err.message });
    }
  }

  fs.writeFileSync(path.join(DATA_DIR, "meta.json"), JSON.stringify(meta, null, 2));

  const durationSec = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(`\nDone in ${durationSec}s.`);

  if (meta.errors.length > 0) {
    console.error(`${meta.errors.length} vendor(s) failed to sync — see above.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exitCode = 1;
});
