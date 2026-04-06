const maintenanceSummary = document.getElementById("maintenanceSummary");
const maintenanceSessionList = document.getElementById("maintenanceSessionList");
const providerTestResult = document.getElementById("providerTestResult");
const maintenanceWarmCacheBtn = document.getElementById("maintenanceWarmCacheBtn");
const maintenanceSnapshotBtn = document.getElementById("maintenanceSnapshotBtn");
const providerTestRunBtn = document.getElementById("providerTestRunBtn");

let maintenanceRequest = null;

function escMaintenance(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function formatMaintenanceDate(value) {
  if (!value) return "No data";
  const normalized = String(value).includes("T")
    ? String(value)
    : String(value).replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatMaintenanceDuration(seconds) {
  const value = Number(seconds || 0);
  if (!value) return "0s";
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
  return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
}

function renderMaintenanceSummary(data) {
  if (!maintenanceSummary) return;
  const diagnostics = data.diagnostics || {};
  const queue = diagnostics.queue || {};
  const disk = diagnostics.disk_guard || {};
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  maintenanceSummary.innerHTML = `
    <div class="diagnostics-card">
      <span class="library-summary-label">Safe Mode</span>
      <strong>${data.safe_mode ? "Enabled" : "Disabled"}</strong>
      <span class="library-summary-note">${data.safe_mode ? "Conservative runtime" : "Full feature set active"}</span>
    </div>
    <div class="diagnostics-card">
      <span class="library-summary-label">Queue Pressure</span>
      <strong>${Number(queue.total || 0)}</strong>
      <span class="library-summary-note">${Number(queue.by_status?.running || 0)} running · ${Number(queue.by_status?.failed || 0)} failed</span>
    </div>
    <div class="diagnostics-card">
      <span class="library-summary-label">Disk Guard</span>
      <strong>${Array.isArray(disk.paths) ? disk.paths.length : 0} path(s)</strong>
      <span class="library-summary-note">${escMaintenance(disk.status || "unknown")}</span>
    </div>
    <div class="diagnostics-card">
      <span class="library-summary-label">Recent Sessions</span>
      <strong>${sessions.length}</strong>
      <span class="library-summary-note">${sessions.length ? formatMaintenanceDate(sessions[0].completed_at || sessions[0].created_at) : "No archived sessions yet"}</span>
    </div>
    <div class="diagnostics-card">
      <span class="library-summary-label">Webhooks</span>
      <strong>${data.webhooks?.enabled ? "Enabled" : "Disabled"}</strong>
      <span class="library-summary-note">${data.webhooks?.type || "generic"} · ${data.webhooks?.url_configured ? "URL set" : "no URL"}</span>
    </div>`;
}

function renderMaintenanceSessions(items) {
  if (!maintenanceSessionList) return;
  if (!Array.isArray(items) || !items.length) {
    maintenanceSessionList.innerHTML =
      '<div class="stats-empty">No archived download sessions are available yet.</div>';
    return;
  }

  maintenanceSessionList.innerHTML = items
    .map((item) => {
      const errors = Array.isArray(item.errors) ? item.errors : [];
      const latestError = errors.length
        ? errors[errors.length - 1].error || errors[errors.length - 1].message || "Unknown error"
        : "";
      return `
        <article class="maintenance-session-card">
          <div class="maintenance-session-head">
            <div>
              <strong>${escMaintenance(item.title || "Unknown title")}</strong>
              <span>${escMaintenance(item.language || "-")} · ${escMaintenance(item.provider || "-")} · ${escMaintenance(item.source || "manual")}</span>
            </div>
            <span class="queue-status queue-status-${escMaintenance(item.status || "queued")}">${escMaintenance(item.status || "unknown")}</span>
          </div>
          <div class="maintenance-session-meta">
            <span>${Number(item.total_episodes || 0)} episode(s)</span>
            <span>${formatMaintenanceDuration(item.duration_seconds)}</span>
            <span>${formatMaintenanceDate(item.completed_at || item.created_at)}</span>
          </div>
          ${latestError ? `<div class="maintenance-session-error">${escMaintenance(latestError)}</div>` : ""}
        </article>`;
    })
    .join("");
}

async function loadMaintenance() {
  if (!maintenanceSummary) return null;
  if (maintenanceRequest) return maintenanceRequest;
  maintenanceRequest = (async () => {
    try {
      const resp = await fetch("/api/maintenance");
      const data = await resp.json();
      renderMaintenanceSummary(data);
      renderMaintenanceSessions(data.sessions || []);
      return data;
    } catch (e) {
      if (maintenanceSummary) {
        maintenanceSummary.innerHTML =
          '<div class="stats-empty">Maintenance data could not be loaded.</div>';
      }
      if (maintenanceSessionList) {
        maintenanceSessionList.innerHTML =
          '<div class="stats-empty">Session history could not be loaded.</div>';
      }
      return null;
    } finally {
      maintenanceRequest = null;
    }
  })();
  return maintenanceRequest;
}

async function runMaintenanceAction(url, successMessage) {
  try {
    const resp = await fetch(url, { method: "POST" });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      showToast(data.error || "Maintenance action failed");
      return;
    }
    showToast(successMessage);
    loadMaintenance();
  } catch (e) {
    showToast("Maintenance action failed");
  }
}

async function runProviderTest() {
  const episodeInput = document.getElementById("providerTestEpisodeUrl");
  const languageInput = document.getElementById("providerTestLanguage");
  const providerInput = document.getElementById("providerTestProvider");
  const episodeUrl = String(episodeInput?.value || "").trim();
  if (!episodeUrl) {
    showToast("Episode URL is required");
    return;
  }

  providerTestResult.innerHTML = '<div class="stats-empty">Running provider test...</div>';
  try {
    const resp = await fetch("/api/provider-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episode_url: episodeUrl,
        language: String(languageInput?.value || "").trim() || "German Dub",
        provider: String(providerInput?.value || "").trim() || "VOE",
      }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      providerTestResult.innerHTML = `<div class="stats-empty">${escMaintenance(
        data.error || "Provider test failed",
      )}</div>`;
      return;
    }
    providerTestResult.innerHTML = `
      <div class="diagnostics-list-item"><strong>Site</strong><span>${escMaintenance(data.site || "-")}</span></div>
      <div class="diagnostics-list-item"><strong>Provider URL</strong><span>${escMaintenance(data.provider_url || "-")}</span></div>
      <div class="diagnostics-list-item"><strong>Provider Host</strong><span>${escMaintenance(data.provider_host || "-")}</span></div>
      <div class="diagnostics-list-item"><strong>Stream URL</strong><span>${escMaintenance(data.stream_url || "-")}</span></div>
      <div class="diagnostics-list-item"><strong>Stream Host</strong><span>${escMaintenance(data.stream_host || "-")}</span></div>`;
  } catch (e) {
    providerTestResult.innerHTML =
      '<div class="stats-empty">Provider test could not be completed.</div>';
  }
}

if (maintenanceWarmCacheBtn) {
  maintenanceWarmCacheBtn.addEventListener("click", function () {
    runMaintenanceAction("/api/maintenance/warm-cache", "Runtime cache warmup started");
  });
}

if (maintenanceSnapshotBtn) {
  maintenanceSnapshotBtn.addEventListener("click", function () {
    runMaintenanceAction("/api/maintenance/provider-snapshot", "Provider score snapshot collected");
  });
}

if (providerTestRunBtn) {
  providerTestRunBtn.addEventListener("click", runProviderTest);
}

loadMaintenance();

if (window.LiveUpdates && typeof window.LiveUpdates.subscribe === "function") {
  window.LiveUpdates.subscribe(["queue", "dashboard", "settings", "autosync", "library"], function () {
    loadMaintenance();
  });
}

setInterval(function () {
  if (!window.LiveUpdates || !window.LiveUpdates.isConnected()) {
    loadMaintenance();
  }
}, 45000);
