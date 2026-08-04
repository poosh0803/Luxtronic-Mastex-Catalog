/**
 * PM2 process definitions for the Mastex catalog.
 *
 *   pm2 start ecosystem.config.js
 *
 * - mastex-catalog-server: long-running static file server for prototype/.
 *   Vendor pages fetch() their data/*.json at runtime, so the site needs to
 *   be served over HTTP — see scripts/server.js.
 * - mastex-catalog-sync: NOT a server. Runs scripts/sync-catalog.js once a
 *   day (cron_restart) and exits (autorestart:false) until the next
 *   scheduled run. Refreshes prototype/data/*.json and prototype/assets/*
 *   from the supplier's Google Sheet. See REQUIREMENTS.md §6 for the design
 *   and open questions (deployment target, auth, vendor scope, etc.)
 *   before changing the schedule or moving this to another host.
 */
module.exports = {
  apps: [
    {
      name: "mastex-catalog-server",
      script: "scripts/server.js",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      env: {
        PORT: 4173,
      },
    },
    {
      name: "mastex-catalog-sync",
      script: "scripts/sync-catalog.js",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 3 * * *", // daily at 03:00 — adjust once actual supplier update cadence is known
    },
  ],
};
