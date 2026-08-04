#!/usr/bin/env node
/**
 * Serves the prototype/ site over HTTP. This exists because the vendor
 * pages fetch() their product data from data/<vendor>.json — file:// pages
 * can't do that (browsers block fetch() of local files), so the site needs
 * to be served, not just double-clicked open. Kept alive by PM2 in
 * production; run directly with `npm run serve` for local use.
 */

const express = require("express");
const path = require("path");

const PORT = process.env.PORT || 4173;
const ROOT = path.join(__dirname, "..", "prototype");

const app = express();
app.use(express.static(ROOT, { extensions: ["html"] }));

app.listen(PORT, () => {
  console.log(`Mastex catalog serving http://localhost:${PORT} (from ${ROOT})`);
});
