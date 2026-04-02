// Auto-Sync page logic

const autosyncList = document.getElementById("autosyncList");

const SCHEDULE_INTERVALS = {
  "1min": 60,
  "30min": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "8h": 28800,
  "12h": 43200,
  "16h": 57600,
  "24h": 86400,
};

let currentSyncSchedule = "0";
let customPathsCache = [];
let langSepEnabled = false;
let autosyncJobsRequest = null;
let autosyncScheduleRequest = null;

async function loadSyncSchedule() {
  if (autosyncScheduleRequest) return autosyncScheduleRequest;
  autosyncScheduleRequest = (async () => {
    try {
      const resp = await fetch("/api/settings");
      const data = await resp.json();
      currentSyncSchedule = data.sync_schedule || "0";
      langSepEnabled = data.lang_separation === "1";
    } catch (e) {
      /* ignore */
    } finally {
      autosyncScheduleRequest = null;
    }
  })();
  return autosyncScheduleRequest;
}

async function loadCustomPathsForEdit() {
  try {
    const resp = await fetch("/api/custom-paths");
    const data = await resp.json();
    customPathsCache = data.paths || [];
  } catch (e) {
    customPathsCache = [];
  }
}

async function loadAutosyncJobs() {
  if (autosyncJobsRequest) return autosyncJobsRequest;
  autosyncJobsRequest = (async () => {
    try {
      const res = await fetch("/api/autosync");
      const data = await res.json();
      renderJobs(data.jobs || []);
    } catch (e) {
      autosyncList.innerHTML =
        '<div class="queue-empty">Failed to load sync jobs.</div>';
    } finally {
      autosyncJobsRequest = null;
    }
  })();
  return autosyncJobsRequest;
}

function computeNextCheck(lastCheck) {
  if (!lastCheck || currentSyncSchedule === "0") return "-";
  const interval = SCHEDULE_INTERVALS[currentSyncSchedule];
  if (!interval) return "-";
  const lastMs = new Date(lastCheck + "Z").getTime();
  const nextMs = lastMs + interval * 1000;
  if (nextMs <= Date.now()) return "Soon";
  return formatDate(
    new Date(nextMs)
      .toISOString()
      .replace("Z", "")
      .replace("T", " ")
      .slice(0, 19),
  );
}

function renderJobs(jobs) {
  if (!jobs.length) {
    autosyncList.innerHTML =
      '<div class="queue-empty">No sync jobs yet. Add a series via the search page.</div>';
    return;
  }

  let html =
    '<table class="user-table" style="table-layout:auto"><thead><tr>' +
    "<th>Title</th><th>Last Check</th><th>Re-Check at</th><th>Last New Found</th><th>Episodes</th>" +
    "<th>Download Path</th><th>Status</th><th>Added By</th><th>Actions</th>" +
    "</tr></thead><tbody>";

  for (const job of jobs) {
    const statusClass = job.enabled
      ? "queue-status-completed"
      : "queue-status-queued";
    const statusLabel = job.enabled ? "Enabled" : "Disabled";
    const lastCheck = job.last_check ? formatDate(job.last_check) : "-";
    const nextCheck = job.enabled ? computeNextCheck(job.last_check) : "-";
    const lastNew = job.last_new_found ? formatDate(job.last_new_found) : "-";

    let dlPath = "Default";
    if (job.custom_path_id) {
      const cp = customPathsCache.find((path) => path.id === job.custom_path_id);
      dlPath = cp ? cp.name : "Custom #" + job.custom_path_id;
    }

    html +=
      "<tr>" +
      '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;color:#e2e4e9" title="' +
      esc(job.series_url) +
      '">' +
      esc(job.title) +
      "</td>" +
      "<td>" +
      lastCheck +
      "</td>" +
      "<td>" +
      nextCheck +
      "</td>" +
      "<td>" +
      lastNew +
      "</td>" +
      "<td>" +
      job.episodes_found +
      "</td>" +
      "<td>" +
      esc(dlPath) +
      "</td>" +
      '<td><span class="queue-status ' +
      statusClass +
      '">' +
      statusLabel +
      "</span></td>" +
      "<td>" +
      esc(job.added_by || "-") +
      "</td>" +
      '<td><div class="queue-item-right">' +
      '<button class="queue-move" onclick="openEditModal(' +
      job.id +
      ')" title="Edit" style="font-size:.85rem">Edit</button>' +
      '<button class="queue-move" onclick="syncNow(' +
      job.id +
      ')" title="Sync Now" style="font-size:.85rem;color:#6ea8fe">Sync</button>' +
      '<button class="queue-remove" onclick="removeJob(' +
      job.id +
      ')" title="Remove" style="font-size:.85rem">Remove</button>' +
      "</div></td>" +
      "</tr>";
  }

  html += "</tbody></table>";
  autosyncList.innerHTML = html;
}

function formatDate(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr + "Z");
  if (Number.isNaN(d.getTime())) {
    const d2 = new Date(isoStr);
    if (Number.isNaN(d2.getTime())) return "-";
    return formatLocalDate(d2);
  }
  return formatLocalDate(d);
}

function formatLocalDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    pad(date.getDate()) +
    "." +
    pad(date.getMonth() + 1) +
    "." +
    date.getFullYear() +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

async function syncNow(id) {
  try {
    const res = await fetch("/api/autosync/" + id + "/sync", {
      method: "POST",
    });
    const data = await res.json();
    if (data.ok) {
      showToast("Sync started");
      setTimeout(loadAutosyncJobs, 1200);
    } else {
      showToast(data.error || "Failed to start sync");
    }
  } catch (e) {
    showToast("Failed to start sync");
  }
}

async function syncAllNow() {
  try {
    const res = await fetch("/api/autosync/sync-all", {
      method: "POST",
    });
    const data = await res.json();
    if (data.ok) {
      showToast(
        data.started
          ? "Started " + data.started + " sync job(s)"
          : "No sync jobs were started",
      );
      setTimeout(loadAutosyncJobs, 1200);
    } else {
      showToast(data.error || "Failed to start sync jobs");
    }
  } catch (e) {
    showToast("Failed to start sync jobs");
  }
}

async function removeJob(id) {
  if (!confirm("Remove this sync job?")) return;
  try {
    const res = await fetch("/api/autosync/" + id, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      showToast("Sync job removed");
      loadAutosyncJobs();
    } else {
      showToast(data.error || "Failed to remove");
    }
  } catch (e) {
    showToast("Failed to remove sync job");
  }
}

let currentJobs = [];

async function openEditModal(id) {
  try {
    const res = await fetch("/api/autosync");
    const data = await res.json();
    currentJobs = data.jobs || [];
    const job = currentJobs.find((entry) => entry.id === id);
    if (!job) {
      showToast("Job not found");
      return;
    }

    document.getElementById("editJobId").value = id;
    document.getElementById("editJobTitle").textContent =
      job.title || "Unknown";

    const langSelect = document.getElementById("editLanguage");
    langSelect.innerHTML = "";
    if (langSepEnabled) {
      const allOpt = document.createElement("option");
      allOpt.value = "All Languages";
      allOpt.textContent = "All Languages";
      langSelect.appendChild(allOpt);
    }
    ["German Dub", "English Sub", "German Sub"].forEach((language) => {
      const opt = document.createElement("option");
      opt.value = language;
      opt.textContent = language;
      langSelect.appendChild(opt);
    });
    langSelect.value = job.language || "German Dub";

    const providerSelect = document.getElementById("editProvider");
    providerSelect.value = job.provider || "VOE";

    const enabledSelect = document.getElementById("editEnabled");
    enabledSelect.value = job.enabled ? "1" : "0";

    const pathSelect = document.getElementById("editPath");
    while (pathSelect.options.length > 1) pathSelect.remove(1);
    await loadCustomPathsForEdit();
    customPathsCache.forEach((path) => {
      const opt = document.createElement("option");
      opt.value = path.id;
      opt.textContent = path.name + " (" + path.path + ")";
      pathSelect.appendChild(opt);
    });
    pathSelect.value = job.custom_path_id ? String(job.custom_path_id) : "";

    if (window.refreshCustomSelect) {
      window.refreshCustomSelect(langSelect);
      window.refreshCustomSelect(providerSelect);
      window.refreshCustomSelect(enabledSelect);
      window.refreshCustomSelect(pathSelect);
    }

    document.getElementById("editOverlay").style.display = "block";
  } catch (e) {
    showToast("Failed to load job");
  }
}

function closeEditModal() {
  document.getElementById("editOverlay").style.display = "none";
}

async function saveEdit() {
  const id = document.getElementById("editJobId").value;
  const pathVal = document.getElementById("editPath").value;
  const body = {
    language: document.getElementById("editLanguage").value,
    provider: document.getElementById("editProvider").value,
    enabled: parseInt(document.getElementById("editEnabled").value, 10),
    custom_path_id: pathVal ? parseInt(pathVal, 10) : null,
  };

  try {
    const res = await fetch("/api/autosync/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      showToast("Job updated");
      closeEditModal();
      loadAutosyncJobs();
    } else {
      showToast(data.error || "Failed to update");
    }
  } catch (e) {
    showToast("Failed to update job");
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.style.display = "block";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

function esc(value) {
  const div = document.createElement("div");
  div.textContent = value || "";
  return div.innerHTML;
}

Promise.all([loadSyncSchedule(), loadCustomPathsForEdit()]).then(loadAutosyncJobs);

if (window.LiveUpdates && typeof window.LiveUpdates.subscribe === "function") {
  window.LiveUpdates.subscribe(["autosync", "settings"], function () {
    loadSyncSchedule();
    loadAutosyncJobs();
  });
}

setInterval(function () {
  if (!window.LiveUpdates || !window.LiveUpdates.isConnected()) {
    loadSyncSchedule();
    loadAutosyncJobs();
  }
}, 90000);
