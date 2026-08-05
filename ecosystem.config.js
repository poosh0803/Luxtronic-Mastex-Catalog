/**
 * PM2 process definitions for the Mastex catalog.
 *
 *   pm2 start ecosystem.config.js
 *
 * PORT below is set to run on 8002. server/index.js and sync/sync-catalog.js
 * each load .env themselves (see .env.example) for their own config
 * (PORT / SHEET_ID) when run directly with `node`/`npm run`, but PM2 always
 * passes the PORT set here to the server process, so this is the value that
 * wins whenever PM2 is what starts it — keep .env's PORT in sync with this
 * if you change one, so direct-run and PM2-run don't disagree.
 *
 * - mastex-catalog-server: long-running Express server (server/index.js).
 *   Renders the vendor hub and every /vendor/:slug page directly from
 *   data/*.json — no per-vendor template, no restart needed when a vendor
 *   is added or removed.
 * - mastex-catalog-sync: NOT a server. Runs sync/sync-catalog.js once a day
 *   (cron_restart) and exits (autorestart:false) until the next scheduled
 *   run. Discovers every vendor tab in the supplier's Google Sheet and
 *   refreshes data/*.json + data/images/*. See REQUIREMENTS.md §6 for the
 *   design and open questions (deployment target, auth, alerting, etc.)
 *   before changing the schedule or moving this to another host.
 */
module.exports = {
  apps: [
    {
      name: "mastex-catalog-server",
      script: "server/index.js",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      env: {
        PORT: process.env.PORT || 8002,
      },
    },
    {
      name: "mastex-catalog-sync",
      script: "sync/sync-catalog.js",
      cwd: __dirname,
      autorestart: false,
      watch: false,
      cron_restart: "0 3 * * *", // daily at 03:00 — adjust once actual supplier update cadence is known
    },
  ],
};
