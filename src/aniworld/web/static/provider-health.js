const providerHealthList = document.getElementById("providerHealthList");
let providerHealthRequest = null;

function providerHealthTone(health) {
  return health || "idle";
}

function formatProviderDate(value) {
  if (!value) return "No activity yet";
  const date = new Date(String(value).replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function renderProviderHealth(items) {
  if (!providerHealthList) return;
  if (!items.length) {
    providerHealthList.innerHTML =
      '<div class="stats-empty">No provider health data yet.</div>';
    return;
  }

  providerHealthList.innerHTML = items
    .map((item) => {
      const tone = providerHealthTone(item.health);
      return `
        <article class="provider-health-card provider-health-${tone}">
          <div class="provider-health-head">
            <div>
              <div class="provider-health-rank">#${Number(item.rank || 0)}</div>
              <div class="provider-health-name">${escProviderHealth(item.provider || "Unknown")}</div>
              <div class="provider-health-status">${escProviderHealth((item.health || "idle").toUpperCase())}</div>
            </div>
            <div class="provider-health-score-wrap">
              <div class="provider-health-score">${Number(item.score || 0)}</div>
              <div class="provider-health-rate">${Number(item.success_rate || 0)}%</div>
            </div>
          </div>
          <div class="provider-health-metrics">
            <span>${Number(item.running || 0)} running</span>
            <span>${Number(item.queued || 0)} queued</span>
            <span>${Number(item.failed_24h || 0)} failed today</span>
          </div>
          <div class="provider-health-meta">
            <div>Completed: <strong>${Number(item.completed || 0)}</strong></div>
            <div>Failed: <strong>${Number(item.failed || 0)}</strong></div>
            <div>Delivered: <strong>${Number(item.episodes || 0)} eps</strong></div>
          </div>
          <div class="provider-health-foot">
            <span>Last success: ${escProviderHealth(formatProviderDate(item.last_success_at))}</span>
            <span>Last failure: ${escProviderHealth(formatProviderDate(item.last_failure_at))}</span>
          </div>
        </article>`;
    })
    .join("");
}

async function loadProviderHealth() {
  if (!providerHealthList) return null;
  if (providerHealthRequest) return providerHealthRequest;
  providerHealthRequest = (async () => {
    try {
      const resp = await fetch("/api/provider-health");
      const data = await resp.json();
      renderProviderHealth(data.items || []);
      return data.items || [];
    } catch (e) {
      providerHealthList.innerHTML =
        '<div class="stats-empty">Provider health could not be loaded.</div>';
      return null;
    } finally {
      providerHealthRequest = null;
    }
  })();
  return providerHealthRequest;
}

function escProviderHealth(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

loadProviderHealth();

if (window.LiveUpdates && typeof window.LiveUpdates.subscribe === "function") {
  window.LiveUpdates.subscribe(["queue", "dashboard", "settings"], () => {
    loadProviderHealth();
  });
}

setInterval(() => {
  if (!window.LiveUpdates || !window.LiveUpdates.isConnected()) {
    loadProviderHealth();
  }
}, 30000);
