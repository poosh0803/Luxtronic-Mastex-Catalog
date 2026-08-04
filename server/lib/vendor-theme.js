/**
 * Deterministic per-vendor accent color, so every vendor page (and its tile
 * on the hub) gets a consistent, distinct look with zero manual color
 * picking — necessary now that vendor pages are generated for whichever
 * tabs exist in the sheet, not hand-built one at a time.
 */

const PALETTE = [
  "#e8590c", "#0d9488", "#6d28d9", "#be185d", "#0369a1",
  "#b45309", "#166534", "#9333ea", "#c2410c", "#0e7490",
  "#dc2626", "#4338ca", "#059669", "#a21caf", "#ca8a04",
];

function hashString(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function colorForVendor(name) {
  return PALETTE[hashString(name) % PALETTE.length];
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function mixWithWhite(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({
    r: r + (255 - r) * amount,
    g: g + (255 - g) * amount,
    b: b + (255 - b) * amount,
  });
}

/** { accent, accent2, accentSoft } — light-theme values; dark theme reuses accent/accent2 as-is. */
function vendorTheme(name) {
  const accent = colorForVendor(name);
  return {
    accent,
    accent2: mixWithWhite(accent, 0.35),
    accentSoft: mixWithWhite(accent, 0.9),
  };
}

function initials(name) {
  const clean = name.replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "vendor";
}

module.exports = { colorForVendor, vendorTheme, initials, slugify };
