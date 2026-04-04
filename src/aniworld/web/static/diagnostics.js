const diagnosticsSummary = document.getElementById("diagnosticsSummary");
const diagnosticsDiskGuard = document.getElementById("diagnosticsDiskGuard");
const diagnosticsCacheList = document.getElementById("diagnosticsCacheList");
let diagnosticsRequest = null;

function escDiagnostics(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function formatDiagnosticsNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatDiagnosticsDate(value) {
  if (!value) return "No data";
  const normalized = String(value).includes("T")
    ? String(value)
    : String(value).replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function renderDiagnosticsDiskGuard(data) {
  if (!diagnosticsDiskGuard) return;
  const items = Array.isArray(data?.paths) ? data.paths : [];
  if (!items.length) {
    diagnosticsDiskGuard.innerHTML =
      '<div class="settings-disk-card"><strong>Unavailable</strong><span>No storage information could be collected.</span></div>';
    return;
  }
  diagnosticsDiskGuard.innerHTML = items
    .map((item) => {
      const tone =
        item.status === "warning"
          ? "warning"
          : item.status === "unknown"
            ? "unknown"
            : "healthy";
      const detail = item.error
        ? item.error
        : `${Number(item.free_gb || 0).toFixed(2)} GB free · ${Number(
            item.free_percent || 0,
          ).toFixed(1)}% free`;
      return `
        <div class="settings-disk-card settings-disk-card-${tone}">
          <strong>${escDiagnostics(item.label)}</strong>
          <span class="settings-disk-path">${escDiagnostics(item.path)}</span>
          <span class="settings-disk-meta">${escDiagnostics(detail)}</span>
        </div>`;
    })
    .join("");
}

function renderDiagnosticsSummary(data) {
  if (!diagnosticsSummary) return;
  diagnosticsSummary.innerHTML = `
    <div class="diagnostics-card">
      <span class="library-summary-label">Server</span>
      <strong>${escDiagnostics(data.server?.bind_host || "Unknown")}:${escDiagnostics(
        data.server?.port || "-",
      )}</strong>
      <span class="library-summary-note">${escDiagnostics(
        data.server?.scope || "local",
      )}</span>
    </div>
    <div class="diagnostics-card">
      <span class="library-summary-label">Queue</span>
      <strong>${formatDiagnosticsNumber(data.queue?.total)}</strong>
      <span class="library-summary-note">${formatDiagnosticsNumber(
        data.queue?.by_status?.running,
      )} running · ${formatDiagnosticsNumber(
        data.queue?.by_status?.queued,
      )} queued</span>
    </div>
    <div class="diagnostics-card">
      <span class="library-summary-label">Auto-Sync</span>
      <strong>${formatDiagnosticsNumber(data.sync?.enabled)}</strong>
      <span class="library-summary-note">${formatDiagnosticsNumber(
        data.sync?.disabled,
      )} disabled · ${formatDiagnosticsNumber(
        data.sync?.total_episodes_found,
      )} episodes found</span>
    </div>
    <div class="diagnostics-card">
      <span class="library-summary-label">Database</span>
      <strong>${escDiagnostics(data.database?.size_mb || 0)} MB</strong>
      <span class="library-summary-note">${escDiagnostics(
        data.database?.path || "Unknown path",
      )}</span>
    </div>
    <div class="diagnostics-card">
      <span class="library-summary-label">Bandwidth Limit</span>
      <strong>${formatDiagnosticsNumber(
        data.downloads?.bandwidth_limit_kbps,
      )} KB/s</strong>
      <span class="library-summary-note">${
        data.downloads?.library_auto_repair ? "Library auto-repair on" : "Library auto-repair off"
      }</span>
    </div>
    <div class="diagnostics-card">
      <span class="library-summary-label">Fallback Order</span>
      <strong>${escDiagnostics(
        Array.isArray(data.downloads?.fallback_order) &&
          data.downloads.fallback_order.length
          ? data.downloads.fallback_order.join(" → ")
          : "Default ranking",
      )}</strong>
      <span class="library-summary-note">Provider retry sequence</span>
    </div>`;
}

function renderDiagnosticsCache(data) {
  if (!diagnosticsCacheList) return;
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  if (!entries.length) {
    diagnosticsCacheList.innerHTML =
      '<div class="stats-empty">No runtime cache entries are warm yet.</div>';
    return;
  }
  diagnosticsCacheList.innerHTML = `
    <div class="diagnostics-inline-note">
      ${data.warmer_started ? "Background cache warmer is running." : "Background cache warmer is not running."}
      ${formatDiagnosticsNumber(data.count)} cached surfaces tracked.
    </div>
    ${entries
      .map(
        (entry) => `
          <div class="diagnostics-list-item">
            <strong>${escDiagnostics(entry.key)}</strong>
            <span>${escDiagnostics(entry.age_seconds)}s old</span>
          </div>`,
      )
      .join("")}`;
}

async function loadDiagnostics() {
  if (!diagnosticsSummary) return null;
  if (diagnosticsRequest) return diagnosticsRequest;
  diagnosticsRequest = (async () => {
    try {
      const resp = await fetch("/api/diagnostics");
      const data = await resp.json();
      renderDiagnosticsSummary(data);
      renderDiagnosticsDiskGuard(data.disk_guard || null);
      renderDiagnosticsCache(data.cache || null);
      return data;
    } catch (e) {
      if (diagnosticsSummary) {
        diagnosticsSummary.innerHTML =
          '<div class="stats-empty">Diagnostics could not be loaded.</div>';
      }
      if (diagnosticsDiskGuard) {
        diagnosticsDiskGuard.innerHTML =
          '<div class="stats-empty">Disk guard data could not be loaded.</div>';
      }
      if (diagnosticsCacheList) {
        diagnosticsCacheList.innerHTML =
          '<div class="stats-empty">Cache data could not be loaded.</div>';
      }
      return null;
    } finally {
      diagnosticsRequest = null;
    }
  })();
  return diagnosticsRequest;
}

loadDiagnostics();

if (window.LiveUpdates && typeof window.LiveUpdates.subscribe === "function") {
  window.LiveUpdates.subscribe(["queue", "dashboard", "settings", "library"], () => {
    loadDiagnostics();
  });
}

setInterval(() => {
  if (!window.LiveUpdates || !window.LiveUpdates.isConnected()) {
    loadDiagnostics();
  }
}, 30000);
