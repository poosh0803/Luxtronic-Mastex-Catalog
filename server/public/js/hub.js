/* ============================================================
   Vendor hub search: all vendor tiles are rendered server-side
   (see server/views/hub.ejs) from data/meta.json, so this just
   shows/hides them by name — no client-side re-render needed.
   ============================================================ */
(function () {
  const searchInput = document.getElementById("searchInput");
  const tiles = [...document.querySelectorAll(".vcard[data-name]")];
  const emptyState = document.getElementById("emptyState");

  function applyFilter(q) {
    const query = (q || "").trim().toLowerCase();
    let visible = 0;
    tiles.forEach((tile) => {
      const match = tile.dataset.name.includes(query);
      tile.hidden = !match;
      if (match) visible++;
    });
    if (emptyState) emptyState.style.display = visible === 0 ? "block" : "none";
  }

  searchInput.addEventListener("input", (e) => applyFilter(e.target.value));

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) themeToggle.addEventListener("click", () => MastexTheme.toggle());

  // ---------- Manual "sync now" ----------
  const syncBtn = document.getElementById("syncNowBtn");
  const syncText = document.getElementById("syncStatusText");
  let polling = null;

  function setSyncing(elapsedSec) {
    syncBtn.disabled = true;
    syncBtn.textContent = "Syncing…";
    syncText.textContent = `Syncing catalog from the sheet… (${elapsedSec}s)`;
  }

  function stopPolling() {
    if (polling) clearInterval(polling);
    polling = null;
    syncBtn.disabled = false;
    syncBtn.textContent = "Sync now";
  }

  function poll() {
    fetch("/api/sync/status")
      .then((r) => r.json())
      .then((status) => {
        if (status.running) {
          const elapsed = Math.round((Date.now() - new Date(status.startedAt).getTime()) / 1000);
          setSyncing(elapsed);
          return;
        }
        stopPolling();
        if (status.exitCode === 0) {
          syncText.textContent = "Sync complete — reloading…";
          window.location.reload();
        } else if (status.finishedAt) {
          syncText.textContent = "Sync failed — check server logs. Last run: " +
            new Date(status.finishedAt).toLocaleString();
        }
      })
      .catch(() => stopPolling());
  }

  if (syncBtn) {
    syncBtn.addEventListener("click", () => {
      syncBtn.disabled = true;
      syncBtn.textContent = "Starting…";
      fetch("/api/sync", { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
          if (data.error && !data.started) {
            // already running elsewhere — just start polling to reflect it
          }
          polling = setInterval(poll, 1500);
          poll();
        })
        .catch(() => {
          syncBtn.disabled = false;
          syncBtn.textContent = "Sync now";
          syncText.textContent = "Could not start sync — check your connection.";
        });
    });

    // If a sync (from another tab, or the daily cron) is already running
    // when this page loads, reflect that instead of showing a stale button.
    fetch("/api/sync/status")
      .then((r) => r.json())
      .then((status) => {
        if (status.running) {
          polling = setInterval(poll, 1500);
          poll();
        }
      })
      .catch(() => {});
  }
})();
