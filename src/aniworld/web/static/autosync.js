// Auto-Sync page logic

const autosyncList = document.getElementById("autosyncList");
const autosyncSelectionCount = document.getElementById("autosyncSelectionCount");
const autosyncSyncSelectedBtn = document.getElementById("autosyncSyncSelectedBtn");
const autosyncSyncAllBtn = document.getElementById("autosyncSyncAllBtn");

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
let currentJobs = [];
const selectedAutosyncIds = new Set();
let currentEditProvidersByLanguage = {};
let currentEditAllLanguageProviders = [];
let currentEditAllowsAllLanguages = false;

function refreshEditCustomSelect(select) {
  if (window.refreshCustomSelect && select) {
    window.refreshCustomSelect(select);
  }
}

function setSelectOptions(select, values, preferredValue, emptyLabel) {
  if (!select) return "";
  const cleanValues = Array.from(
    new Set(
      (values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  select.innerHTML = "";
  if (!cleanValues.length) {
    const fallback = document.createElement("option");
    fallback.value = "";
    fallback.textContent = emptyLabel || "No options available";
    select.appendChild(fallback);
    select.value = "";
    select.disabled = true;
    refreshEditCustomSelect(select);
    return "";
  }

  cleanValues.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  const nextValue = cleanValues.includes(preferredValue)
    ? preferredValue
    : cleanValues[0];
  select.disabled = false;
  select.value = nextValue;
  refreshEditCustomSelect(select);
  return nextValue;
}

function getEditProviderOptionsForLanguage(language) {
  if (language === "All Languages") {
    return currentEditAllLanguageProviders;
  }
  return currentEditProvidersByLanguage[language] || [];
}

function refreshEditProviderSelect(preferredProvider) {
  const languageSelect = document.getElementById("editLanguage");
  const providerSelect = document.getElementById("editProvider");
  if (!languageSelect || !providerSelect) return;

  const activeLanguage = languageSelect.value;
  const providerOptions = getEditProviderOptionsForLanguage(activeLanguage);
  setSelectOptions(
    providerSelect,
    providerOptions,
    preferredProvider || providerSelect.value,
    "No providers available",
  );
}

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
      currentJobs = data.jobs || [];
      syncAutosyncSelectionState();
      renderJobs(currentJobs);
    } catch (e) {
      currentJobs = [];
      selectedAutosyncIds.clear();
      updateAutosyncSelectionToolbar();
      autosyncList.innerHTML =
        '<div class="queue-empty">Failed to load sync jobs.</div>';
    } finally {
      autosyncJobsRequest = null;
    }
  })();
  return autosyncJobsRequest;
}

function syncAutosyncSelectionState() {
  const availableIds = new Set((currentJobs || []).map((job) => Number(job.id)));
  Array.from(selectedAutosyncIds).forEach((id) => {
    if (!availableIds.has(Number(id))) {
      selectedAutosyncIds.delete(id);
    }
  });
}

function updateAutosyncSelectionToolbar() {
  if (!autosyncSelectionCount) return;
  const count = selectedAutosyncIds.size;
  autosyncSelectionCount.textContent =
    count === 1 ? "1 selected" : count + " selected";
  if (autosyncSyncSelectedBtn) {
    autosyncSyncSelectedBtn.classList.toggle("is-active", count > 0);
  }
  if (autosyncSyncAllBtn) {
    autosyncSyncAllBtn.classList.toggle("is-active", count === 0);
  }
}

function toggleAutosyncSelection(id, checked) {
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) return;
  if (checked) {
    selectedAutosyncIds.add(jobId);
  } else {
    selectedAutosyncIds.delete(jobId);
  }
  updateAutosyncSelectionToolbar();
}

function selectAllAutosyncJobs() {
  currentJobs.forEach((job) => selectedAutosyncIds.add(Number(job.id)));
  renderJobs(currentJobs);
}

function clearAutosyncSelection() {
  selectedAutosyncIds.clear();
  renderJobs(currentJobs);
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

function detectAutosyncSource(seriesUrl) {
  const value = String(seriesUrl || "").toLowerCase();
  if (value.includes("aniworld.to")) return "AniWorld";
  if (value.includes("s.to") || value.includes("serienstream")) {
    return "SerienStream";
  }
  if (value.includes("filmpalast.to")) return "FilmPalast";
  return "Source";
}

function renderAutosyncMetaPill(label, value, modifier = "") {
  if (!value || value === "-") return "";
  const nextModifier = modifier ? " queue-meta-pill-" + modifier : "";
  return (
    '<span class="queue-meta-pill autosync-meta-pill' +
    nextModifier +
    '">' +
    '<span class="queue-meta-label">' +
    esc(label) +
    "</span>" +
    '<span class="queue-meta-value">' +
    esc(value) +
    "</span>" +
    "</span>"
  );
}

function renderJobs(jobs) {
  syncAutosyncSelectionState();
  updateAutosyncSelectionToolbar();
  if (!jobs.length) {
    autosyncList.innerHTML =
      '<div class="queue-empty">No sync jobs yet. Add a series via the search page.</div>';
    return;
  }

  let html = '<div class="autosync-grid">';

  for (const job of jobs) {
    const isSelected = selectedAutosyncIds.has(Number(job.id));
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

    const sourceLabel = detectAutosyncSource(job.series_url);
    const sourceMeta = renderAutosyncMetaPill("Source", sourceLabel, "sync");
    const languageMeta = renderAutosyncMetaPill(
      "Lang",
      job.language || "German Dub",
      "language",
    );
    const providerMeta = renderAutosyncMetaPill(
      "Provider",
      job.provider || "VOE",
      "provider",
    );
    const pathMeta = renderAutosyncMetaPill("Path", dlPath, "path");
    const userMeta = renderAutosyncMetaPill("User", job.added_by || "-", "user");
    let diffPreview = [];
    let queuedPreview = [];
    let skippedPreview = [];
    try {
      diffPreview = JSON.parse(job.last_diff_json || "[]");
    } catch (e) {
      diffPreview = [];
    }
    try {
      queuedPreview = JSON.parse(job.last_queued_json || "[]");
    } catch (e) {
      queuedPreview = [];
    }
    try {
      skippedPreview = JSON.parse(job.last_skipped_json || "[]");
    } catch (e) {
      skippedPreview = [];
    }
    const diffSections = [];
    if (diffPreview.length) {
      diffSections.push(
        '<div class="autosync-preview-block"><span class="autosync-preview-label">Last Diff</span><div class="autosync-preview-chips">' +
          diffPreview
            .map(function (entry) {
              const sample = Array.isArray(entry.missing_sample)
                ? entry.missing_sample.slice(0, 4).join(", ")
                : "";
              return (
                '<span class="autosync-preview-chip">' +
                esc(entry.language || "Language") +
                ": " +
                Number(entry.missing_count || 0) +
                " missing" +
                (sample ? " · " + esc(sample) : "") +
                "</span>"
              );
            })
            .join("") +
          "</div></div>",
      );
    }
    if (queuedPreview.length) {
      diffSections.push(
        '<div class="autosync-preview-block"><span class="autosync-preview-label">Last Queued</span><div class="autosync-preview-chips">' +
          queuedPreview
            .map(function (entry) {
              return (
                '<span class="autosync-preview-chip autosync-preview-chip-success">' +
                esc(entry.language || "Language") +
                ": " +
                (Array.isArray(entry.labels) ? esc(entry.labels.slice(0, 4).join(", ")) : Number(entry.queued_count || 0) + " queued") +
                "</span>"
              );
            })
            .join("") +
          "</div></div>",
      );
    }
    if (skippedPreview.length || job.last_error) {
      const skippedHtml = skippedPreview
        .map(function (entry) {
          return (
            '<span class="autosync-preview-chip autosync-preview-chip-warn">' +
            esc(entry.language || "Language") +
            ": " +
            esc(entry.reason || "Skipped") +
            "</span>"
          );
        })
        .join("");
      diffSections.push(
        '<div class="autosync-preview-block"><span class="autosync-preview-label">Skipped / Error</span><div class="autosync-preview-chips">' +
          skippedHtml +
          (job.last_error
            ? '<span class="autosync-preview-chip autosync-preview-chip-error">' +
              esc(job.last_error) +
              "</span>"
            : "") +
          "</div></div>",
      );
    }

    html +=
      '<article class="autosync-card' +
      (isSelected ? " is-selected" : "") +
      '">' +
      '<label class="autosync-select-toggle" title="Select sync job">' +
      '<input type="checkbox" class="autosync-select-checkbox" ' +
      (isSelected ? "checked " : "") +
      'onchange="toggleAutosyncSelection(' +
      job.id +
      ', this.checked)" />' +
      '<span class="autosync-select-box"></span>' +
      "</label>" +
      '<div class="autosync-card-body">' +
      '<div class="autosync-card-head">' +
      '<div class="autosync-card-copy">' +
      '<div class="autosync-card-title" title="' +
      esc(job.series_url) +
      '">' +
      esc(job.title) +
      "</div>" +
      '<div class="autosync-card-subline">' +
      '<span class="queue-status ' +
      statusClass +
      '">' +
      statusLabel +
      "</span>" +
      '<span class="autosync-card-series-url">' +
      esc(sourceLabel) +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="autosync-card-actions">' +
      '<button class="btn-secondary btn-small autosync-action-btn" onclick="openEditModal(' +
      job.id +
      ')" title="Edit" type="button">Edit</button>' +
      '<button class="btn-secondary btn-small autosync-action-btn autosync-action-sync" onclick="syncNow(' +
      job.id +
      ')" title="Sync Now" type="button">Sync Now</button>' +
      '<button class="btn-secondary btn-small autosync-action-btn autosync-action-remove" onclick="removeJob(' +
      job.id +
      ')" title="Remove" type="button">Remove</button>' +
      "</div>" +
      "</div>" +
      '<div class="autosync-card-stats">' +
      '<div class="autosync-stat"><span>Last Check</span><strong>' +
      lastCheck +
      "</strong></div>" +
      '<div class="autosync-stat"><span>Next Check</span><strong>' +
      nextCheck +
      "</strong></div>" +
      '<div class="autosync-stat"><span>Last New</span><strong>' +
      lastNew +
      "</strong></div>" +
      '<div class="autosync-stat"><span>Episodes Found</span><strong>' +
      job.episodes_found +
      "</strong></div>" +
      "</div>" +
      '<div class="autosync-card-meta">' +
      sourceMeta +
      languageMeta +
      providerMeta +
      pathMeta +
      userMeta +
      "</div>" +
      (diffSections.length
        ? '<div class="autosync-card-preview">' + diffSections.join("") + "</div>"
        : "") +
      "</div>" +
      "</article>";
  }

  html += "</div>";
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

async function syncSelectedNow() {
  if (!selectedAutosyncIds.size) {
    showToast("No sync jobs selected");
    return;
  }
  try {
    const res = await fetch("/api/autosync/sync-selected", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedAutosyncIds) }),
    });
    const data = await res.json();
    if (data.ok) {
      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      if (data.started && skipped) {
        showToast("Started " + data.started + " selected job(s), skipped " + skipped);
      } else if (data.started) {
        showToast("Started " + data.started + " selected job(s)");
      } else {
        showToast(skipped ? "Selected jobs were skipped" : "No selected jobs were started");
      }
      setTimeout(loadAutosyncJobs, 1200);
    } else {
      showToast(data.error || "Failed to start selected sync jobs");
    }
  } catch (e) {
    showToast("Failed to start selected sync jobs");
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

async function openEditModal(id) {
  try {
    if (!currentJobs.length) {
      const res = await fetch("/api/autosync");
      const data = await res.json();
      currentJobs = data.jobs || [];
      syncAutosyncSelectionState();
    }
    const job = currentJobs.find((entry) => entry.id === id);
    if (!job) {
      showToast("Job not found");
      return;
    }

    document.getElementById("editJobId").value = id;
    document.getElementById("editJobTitle").textContent =
      job.title || "Unknown";

    const langSelect = document.getElementById("editLanguage");
    const providerSelect = document.getElementById("editProvider");
    let optionPayload = null;
    try {
      const optionResponse = await fetch("/api/autosync/" + id + "/options");
      optionPayload = await optionResponse.json();
    } catch (e) {
      optionPayload = null;
    }

    currentEditProvidersByLanguage =
      (optionPayload && optionPayload.providers_by_language) || {
        [job.language || "German Dub"]: [job.provider || "VOE"],
      };
    currentEditAllLanguageProviders =
      (optionPayload && optionPayload.all_language_providers) ||
      (job.language === "All Languages" ? [job.provider || "VOE"] : []);
    currentEditAllowsAllLanguages = Boolean(
      (optionPayload && optionPayload.allow_all_languages) ||
        (langSepEnabled && Object.keys(currentEditProvidersByLanguage).length > 1) ||
        job.language === "All Languages",
    );

    const languages =
      (optionPayload && optionPayload.languages) ||
      Object.keys(currentEditProvidersByLanguage);
    const languageOptions = currentEditAllowsAllLanguages
      ? ["All Languages"].concat(languages)
      : languages;
    const preferredLanguage =
      (optionPayload && optionPayload.selected_language) ||
      job.language ||
      "German Dub";
    setSelectOptions(
      langSelect,
      languageOptions,
      preferredLanguage,
      "No languages available",
    );
    refreshEditProviderSelect(
      (optionPayload && optionPayload.selected_provider) || job.provider || "VOE",
    );

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
      refreshEditCustomSelect(langSelect);
      refreshEditCustomSelect(providerSelect);
      refreshEditCustomSelect(enabledSelect);
      refreshEditCustomSelect(pathSelect);
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
  const providerSelect = document.getElementById("editProvider");
  if (providerSelect && providerSelect.disabled) {
    showToast("No valid providers available for this selection");
    return;
  }
  const body = {
    language: document.getElementById("editLanguage").value,
    provider: providerSelect.value,
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
  if (
    window.AniworldNotifications &&
    typeof window.AniworldNotifications.add === "function"
  ) {
    window.AniworldNotifications.add(msg, { source: "Auto-Sync" });
  }
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

const editLanguageSelect = document.getElementById("editLanguage");
if (editLanguageSelect) {
  editLanguageSelect.addEventListener("change", function () {
    refreshEditProviderSelect();
  });
}

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
