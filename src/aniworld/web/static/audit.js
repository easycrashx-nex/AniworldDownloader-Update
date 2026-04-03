const auditList = document.getElementById("auditList");
const auditUserFilter = document.getElementById("auditUserFilter");
const auditActionFilter = document.getElementById("auditActionFilter");
let auditRequest = null;

function escAudit(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function formatAuditDate(value) {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatAuditAction(action) {
  return String(action || "")
    .replace(/\./g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderAuditList(items) {
  if (!auditList) return;
  if (!items.length) {
    auditList.innerHTML =
      '<div class="stats-empty">No audit activity available.</div>';
    return;
  }

  auditList.innerHTML = items
    .map((item) => {
      const detailBits = [];
      const details = item.details || {};
      if (details.provider) detailBits.push(`Provider: ${details.provider}`);
      if (details.language) detailBits.push(`Language: ${details.language}`);
      if (details.started) detailBits.push(`Started: ${details.started}`);
      if (details.created) detailBits.push(`Created: ${details.created}`);
      if (details.to_role) detailBits.push(`Role: ${details.to_role}`);
      return `
        <div class="audit-item">
          <div class="audit-row">
            <div>
              <div class="audit-title">${escAudit(formatAuditAction(item.action))}</div>
              <div class="audit-meta">${escAudit(item.username || "Guest")} · ${escAudit(item.subject || item.subject_type || "System")}</div>
            </div>
            <div class="audit-time">${escAudit(formatAuditDate(item.created_at))}</div>
          </div>
          ${
            detailBits.length
              ? `<div class="audit-details">${detailBits.map((bit) => `<span class="audit-chip">${escAudit(bit)}</span>`).join("")}</div>`
              : ""
          }
        </div>`;
    })
    .join("");
}

async function loadAuditUsers() {
  if (!auditUserFilter || !window.auditIsAdmin) return;
  try {
    const resp = await fetch("/api/audit/users");
    const data = await resp.json();
    const selected = auditUserFilter.value;
    auditUserFilter.innerHTML = '<option value="">All Users</option>';
    (data.items || []).forEach((item) => {
      if (!item.username) return;
      const option = document.createElement("option");
      option.value = item.username;
      option.textContent = item.username;
      auditUserFilter.appendChild(option);
    });
    auditUserFilter.value = selected;
    if (window.refreshCustomSelect) window.refreshCustomSelect(auditUserFilter);
  } catch (e) {
    /* ignore */
  }
}

async function loadAuditLog() {
  if (!auditList) return null;
  if (auditRequest) return auditRequest;
  auditRequest = (async () => {
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (auditUserFilter && auditUserFilter.value) {
        params.set("username", auditUserFilter.value);
      }
      if (auditActionFilter && auditActionFilter.value) {
        params.set("action", auditActionFilter.value);
      }
      const resp = await fetch(`/api/audit?${params.toString()}`);
      const data = await resp.json();
      renderAuditList(data.items || []);
      return data.items || [];
    } catch (e) {
      auditList.innerHTML =
        '<div class="stats-empty">Audit log could not be loaded.</div>';
      return null;
    } finally {
      auditRequest = null;
    }
  })();
  return auditRequest;
}

if (auditUserFilter) {
  auditUserFilter.addEventListener("change", loadAuditLog);
}

if (auditActionFilter) {
  auditActionFilter.addEventListener("change", loadAuditLog);
}

loadAuditUsers();
loadAuditLog();

if (window.LiveUpdates && typeof window.LiveUpdates.subscribe === "function") {
  window.LiveUpdates.subscribe(["queue", "autosync", "favorites", "settings"], () => {
    loadAuditUsers();
    loadAuditLog();
  });
}
