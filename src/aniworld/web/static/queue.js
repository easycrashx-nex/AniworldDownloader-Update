let queueModalOpen = false;
let queuePollTimer = null;
let badgePollTimer = null;
let queueCustomPaths = [];
let queueErrorsOnly = false;
let queueAverageSecondsPerEpisode = null;
let queueRequest = null;
let queuePollIntervalMs = 0;
let queueStatsFetchedAt = 0;
let queueHasRunningWork = false;

const ACTIVE_QUEUE_POLL_MS = 1800;
const IDLE_QUEUE_POLL_MS = 6000;
const QUEUE_STATS_REFRESH_MS = 45000;

(async function loadQueueCustomPaths() {
  try {
    const resp = await fetch("/api/custom-paths");
    const data = await resp.json();
    queueCustomPaths = data.paths || [];
  } catch (e) {
    /* ignore */
  }
})();

function openQueueModal() {
  queueModalOpen = true;
  document.getElementById("queueOverlay").style.display = "block";
  queueHasRunningWork = true;
  refreshQueuePolling();
  loadQueue({ includeStats: true, forceStats: true });
}

function closeQueueModal() {
  queueModalOpen = false;
  document.getElementById("queueOverlay").style.display = "none";
  if (queuePollTimer) {
    clearInterval(queuePollTimer);
    queuePollTimer = null;
  }
  queuePollIntervalMs = 0;
}

function refreshQueuePolling() {
  if (!queueModalOpen) return;
  const nextInterval = queueHasRunningWork
    ? ACTIVE_QUEUE_POLL_MS
    : IDLE_QUEUE_POLL_MS;

  if (queuePollTimer && queuePollIntervalMs === nextInterval) return;
  if (queuePollTimer) clearInterval(queuePollTimer);

  queuePollIntervalMs = nextInterval;
  queuePollTimer = setInterval(() => {
    loadQueue({ includeStats: true });
  }, nextInterval);
}

let lastFfmpegProgress = {};

function formatBandwidth(bwStr) {
  if (!bwStr) return "";
  const trimmed = String(bwStr).trim();
  if (/B\/s$/i.test(trimmed)) return trimmed;
  const m = trimmed.match(/^\s*([\d.]+)\s*([kmg])?bits\/s\s*$/i);
  if (!m) return bwStr;
  const value = parseFloat(m[1]);
  if (Number.isNaN(value)) return bwStr;
  const unit = (m[2] || "").toLowerCase();
  let mbps = value;
  if (unit === "k") mbps = value / 1000;
  else if (unit === "g") mbps = value * 1000;
  const mbytes = mbps / 8;
  return mbytes.toFixed(1) + " MB/s";
}

async function loadQueue(options = {}) {
  const includeStats = options.includeStats ?? queueModalOpen;
  const shouldFetchStats =
    includeStats &&
    (options.forceStats ||
      queueAverageSecondsPerEpisode == null ||
      Date.now() - queueStatsFetchedAt >= QUEUE_STATS_REFRESH_MS);
  if (queueRequest) return queueRequest;

  queueRequest = (async () => {
    try {
      const queueResp = await fetch("/api/queue");
      const data = await queueResp.json();
      const items = data.items || [];
      lastFfmpegProgress = data.ffmpeg_progress || {};
      queueHasRunningWork = items.some(
        (item) => item.status === "running" || !!item.current_url,
      );
      if (queueModalOpen) refreshQueuePolling();
      if (shouldFetchStats) {
        const statsResp = await fetch("/api/stats/general");
        const stats = await statsResp.json();
        queueAverageSecondsPerEpisode =
          stats.average_seconds_per_episode || null;
        queueStatsFetchedAt = Date.now();
      }
      renderQueue(items);
      updateBadge(items);
    } catch (e) {
      /* ignore */
    } finally {
      queueRequest = null;
    }
  })();

  return queueRequest;
}

function formatEta(seconds) {
  if (!seconds || seconds < 1) return "";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m remaining`;
  if (minutes) return `${minutes}m remaining`;
  return `${rounded}s remaining`;
}

function queueActionButton(className, label, onClick, title, iconOnly = false) {
  return (
    '<button class="' +
    className +
    '" onclick="' +
    onClick +
    '" title="' +
    escQ(title || label) +
    '" type="button"' +
    (iconOnly ? ' aria-label="' + escQ(title || label) + '"' : "") +
    ">" +
    label +
    "</button>"
  );
}

function queueMetaPill(label, value, modifier = "") {
  if (!value) return "";
  const nextModifier = modifier ? " queue-meta-pill-" + modifier : "";
  return (
    '<span class="queue-meta-pill' +
    nextModifier +
    '">' +
    '<span class="queue-meta-label">' +
    escQ(label) +
    "</span>" +
    '<span class="queue-meta-value">' +
    escQ(value) +
    "</span>" +
    "</span>"
  );
}

function getQueueEpisodeMarker(item) {
  const parsed = parseSeasonEpisode(item.current_url || "");
  if (parsed) return parsed;
  if (item.total_episodes === 1) return "Movie";
  if (item.current_episode && item.total_episodes) {
    return item.current_episode + "/" + item.total_episodes;
  }
  if (item.total_episodes) return item.total_episodes + " total";
  return "";
}

function toggleQueueErrorsOnly() {
  queueErrorsOnly = !queueErrorsOnly;
  const btn = document.getElementById("queueErrorsToggleBtn");
  if (btn) btn.textContent = queueErrorsOnly ? "Show All" : "Errors Only";
  loadQueue();
}

function updateBadge(items) {
  const active = items.filter(
    (i) => i.status === "queued" || i.status === "running",
  ).length;
  const badge = document.getElementById("queueBadge");
  if (active > 0) {
    badge.textContent = active;
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }
}

function renderQueue(items) {
  const list = document.getElementById("queueList");

  // Show active items on top, then last 3 finished (newest first)
  const running = items.filter((i) => i.status === "running");
  const queued = items.filter((i) => i.status === "queued");
  const done = items
    .filter(
      (i) =>
        i.status === "completed" ||
        i.status === "failed" ||
        i.status === "cancelled",
    )
    .slice(-3)
    .reverse();
  let visible = running.concat(queued, done);

  if (queueErrorsOnly) {
    visible = items.filter((item) => {
      if (item.status === "failed") return true;
      if (typeof item.errors === "string") {
        try {
          return JSON.parse(item.errors || "[]").length > 0;
        } catch (e) {
          return false;
        }
      }
      return Array.isArray(item.errors) && item.errors.length > 0;
    });
  }

  if (!visible.length) {
    list.innerHTML = queueErrorsOnly
      ? '<div class="queue-empty">No queue items with errors</div>'
      : '<div class="queue-empty">Queue is empty</div>';
    return;
  }

  // Remember which error panels are expanded before re-render
  const expandedErrors = new Set();
  list.querySelectorAll(".queue-error-details.expanded").forEach((el) => {
    expandedErrors.add(el.id);
  });

  let html = "";
  visible.forEach((item) => {
    const isRunning = item.status === "running";
    const isActive =
      isRunning || (item.status === "cancelled" && item.current_url);
    const cls = isActive ? "queue-item queue-item-active" : "queue-item";

    const isCancelling = item.status === "cancelled" && item.current_url;

    let statusBadge = "";
    if (item.status === "running")
      statusBadge =
        '<span class="queue-status queue-status-running">In Progress</span>';
    else if (item.status === "queued")
      statusBadge =
        '<span class="queue-status queue-status-queued">Queued</span>';
    else if (item.status === "completed")
      statusBadge =
        '<span class="queue-status queue-status-completed">Completed</span>';
    else if (item.status === "failed")
      statusBadge =
        '<span class="queue-status queue-status-failed">Failed</span>';
    else if (isCancelling)
      statusBadge =
        '<span class="queue-status queue-status-cancelling">Cancelling...</span>';
    else if (item.status === "cancelled")
      statusBadge =
        '<span class="queue-status queue-status-cancelled">Cancelled</span>';
    // Captcha badge shown on top of the running badge when captcha_url is set
    const captchaBadge = (isRunning && item.captcha_url)
      ? ' <span class="queue-status queue-status-captcha">CAPTCHA</span>'
      : '';
    let progressHtml = "";
    if (isRunning || isCancelling || item.status === "cancelled") {
      const epPct =
        item.total_episodes > 0
          ? (item.current_episode / item.total_episodes) * 100
          : 0;
      const seInfo = item.current_url
        ? parseSeasonEpisode(item.current_url)
        : "";

      // Combine episode progress with in-episode ffmpeg progress
      let ffPct = 0;
      if (isRunning && lastFfmpegProgress.active && item.total_episodes > 0) {
        ffPct = (lastFfmpegProgress.percent || 0) / item.total_episodes;
      }
      const combinedPct = Math.min(Math.round(epPct + ffPct), 100);

      let label;
      if (isCancelling) {
        label =
          item.current_episode +
          "/" +
          item.total_episodes +
          " episodes - finishing current episode...";
      } else if (item.status === "cancelled") {
        label =
          item.current_episode +
          "/" +
          item.total_episodes +
          " episodes (stopped)";
      } else {
        let epDetail = item.current_episode + "/" + item.total_episodes + " episodes";
        if (seInfo) epDetail += " - " + seInfo;
        if (lastFfmpegProgress.active && lastFfmpegProgress.percent > 0) {
          const bw = formatBandwidth(lastFfmpegProgress.bandwidth || "");
          epDetail +=
            " (" +
            lastFfmpegProgress.percent +
            "%" +
            (bw ? " @ " + bw : "") +
            ")";
        }
        if (queueAverageSecondsPerEpisode) {
          const remainingEpisodes = Math.max(
            0,
            item.total_episodes - item.current_episode,
          );
          const etaText = formatEta(
            remainingEpisodes * queueAverageSecondsPerEpisode,
          );
          if (etaText) epDetail += " - " + etaText;
        }
        label = epDetail;
      }
      progressHtml =
        '<div class="queue-progress">' +
        '<div class="queue-progress-info">' +
        "<span>" +
        label +
        "</span>" +
        "<span>" +
        combinedPct +
        "%</span>" +
        "</div>" +
        '<div class="queue-progress-bar"><div class="queue-progress-fill" style="width:' +
        combinedPct +
        '%"></div></div>' +
        "</div>";
    }

    let errorsHtml = "";
    if (item.errors) {
      let errors = [];
      try {
        errors =
          typeof item.errors === "string"
            ? JSON.parse(item.errors)
            : item.errors;
      } catch (e) {}
      if (errors.length) {
        const errId = "qerr-" + item.id;
        let details = "";
        errors.forEach(function (err) {
          var ep = err.url ? parseSeasonEpisode(err.url) : "";
          var label = ep ? ep + ": " : "";
          var providersTried =
            Array.isArray(err.providers_tried) && err.providers_tried.length
              ? " Providers tried: " + err.providers_tried.join(", ")
              : "";
          details +=
            '<div class="queue-error-detail">' +
            escQ(label + (err.error || "") + providersTried) +
            "</div>";
        });
        errorsHtml =
          "<div class=\"queue-errors queue-errors-expandable\" onclick=\"this.classList.toggle('expanded');document.getElementById('" +
          errId +
          "').classList.toggle('expanded')\">" +
          errors.length +
          ' error(s) <span class="queue-errors-toggle">&#9654;</span>' +
          "</div>" +
          '<div class="queue-error-details" id="' +
          errId +
          '">' +
          details +
          "</div>";
      }
    }

    const actionButtons = [];
    if (item.status === "queued") {
      actionButtons.push(
        queueActionButton(
          "queue-icon-btn queue-icon-btn-neutral",
          "▲",
          "moveQueueItem(" + item.id + ",'up')",
          "Move up",
          true,
        ),
      );
      actionButtons.push(
        queueActionButton(
          "queue-icon-btn queue-icon-btn-neutral",
          "▼",
          "moveQueueItem(" + item.id + ",'down')",
          "Move down",
          true,
        ),
      );
      actionButtons.push(
        queueActionButton(
          "queue-action-btn queue-action-danger",
          "Remove",
          "removeQueueItem(" + item.id + ")",
          "Remove",
        ),
      );
    } else if (item.status === "running") {
      if (item.captcha_url) {
        actionButtons.push(
          queueActionButton(
            "queue-action-btn queue-action-secondary",
            "Solve Captcha",
            "openCaptchaModal(" + item.id + ")",
            "Solve captcha",
          ),
        );
      }
      actionButtons.push(
        queueActionButton(
          "queue-action-btn queue-action-warning",
          "Cancel",
          "cancelQueueItem(" + item.id + ")",
          "Cancel after current episode",
        ),
      );
    } else if (item.status === "failed" || item.status === "cancelled") {
      actionButtons.push(
        queueActionButton(
          "queue-action-btn queue-action-primary queue-action-retry",
          "Retry Now",
          "retryQueueItem(" + item.id + ")",
          "Retry",
        ),
      );
    }

    let pathHtml = "";
    if (item.custom_path_id) {
      const cp = queueCustomPaths.find((p) => p.id === item.custom_path_id);
      const pathName = cp ? cp.name : "Custom #" + item.custom_path_id;
      pathHtml = queueMetaPill("Path", pathName, "path");
    }

    const syncMeta = (item.source || "").startsWith("sync")
      ? queueMetaPill("Source", "Auto-Sync", "sync")
      : "";
    const episodeMeta = queueMetaPill(
      "Episode",
      getQueueEpisodeMarker(item),
      "episode",
    );
    const languageMeta = queueMetaPill("Lang", item.language, "language");
    const providerMeta = queueMetaPill("Provider", item.provider, "provider");
    const userMeta = item.username
      ? queueMetaPill("User", item.username, "user")
      : "";
    const actionsHtml = actionButtons.length
      ? '<div class="queue-actions">' + actionButtons.join("") + "</div>"
      : "";

    html +=
      '<div class="' +
      cls +
      '">' +
      '<div class="queue-item-header">' +
      '<div class="queue-item-title">' +
      escQ(item.title) +
      "</div>" +
      '<div class="queue-item-right">' +
      statusBadge +
      captchaBadge +
      actionsHtml +
      "</div>" +
      "</div>" +
      '<div class="queue-item-meta">' +
      episodeMeta +
      languageMeta +
      providerMeta +
      pathHtml +
      userMeta +
      syncMeta +
      "</div>" +
      progressHtml +
      errorsHtml +
      "</div>";
  });

  list.innerHTML = html;

  // Restore expanded state (both the details panel and its sibling header)
  expandedErrors.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add("expanded");
      const header = el.previousElementSibling;
      if (header) header.classList.add("expanded");
    }
  });
}

function parseSeasonEpisode(url) {
  const m = url.match(/staffel-(\d+)\/episode-(\d+)/i);
  if (m) return "S" + m[1] + "E" + m[2];
  const f = url.match(/filme\/film-(\d+)/i);
  if (f) return "Film " + f[1];
  return "";
}

async function cancelQueueItem(id) {
  try {
    const resp = await fetch("/api/queue/" + id + "/cancel", {
      method: "POST",
    });
    const data = await resp.json();
    if (data.error) {
      if (typeof showToast === "function") showToast(data.error);
    } else {
      if (typeof showToast === "function")
        showToast("Cancelling after current episode...");
    }
    loadQueue();
  } catch (e) {
    /* ignore */
  }
}

async function moveQueueItem(id, direction) {
  try {
    const resp = await fetch("/api/queue/" + id + "/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    const data = await resp.json();
    if (data.error && typeof showToast === "function") showToast(data.error);
    loadQueue();
  } catch (e) {
    /* ignore */
  }
}

async function removeQueueItem(id) {
  try {
    const resp = await fetch("/api/queue/" + id, { method: "DELETE" });
    const data = await resp.json();
    if (data.error) {
      if (typeof showToast === "function") showToast(data.error);
    }
    loadQueue();
  } catch (e) {
    /* ignore */
  }
}

async function retryQueueItem(id) {
  try {
    const resp = await fetch("/api/queue/" + id + "/retry", {
      method: "POST",
    });
    const data = await resp.json();
    if (data.error) {
      if (typeof showToast === "function") showToast(data.error);
    } else if (typeof showToast === "function") {
      showToast(
        data.provider ? "Retry queued with " + data.provider : "Retry queued",
      );
    }
    loadQueue({ includeStats: queueModalOpen });
    if (typeof window.loadDashboardStats === "function") window.loadDashboardStats();
  } catch (e) {
    if (typeof showToast === "function") showToast("Retry failed");
  }
}

async function retryFailedQueueItems() {
  try {
    const resp = await fetch("/api/queue/retry-failed", { method: "POST" });
    const data = await resp.json();
    if (typeof showToast === "function") {
      showToast(
        data.created
          ? "Re-queued " + data.created + " failed item(s)"
          : "No failed items to retry",
      );
    }
    loadQueue({ includeStats: queueModalOpen });
    if (typeof window.loadDashboardStats === "function") window.loadDashboardStats();
  } catch (e) {
    if (typeof showToast === "function") showToast("Retry failed");
  }
}

async function clearFinishedQueueItems() {
  try {
    await fetch("/api/queue/completed", { method: "DELETE" });
    if (typeof showToast === "function") showToast("Finished items cleared");
    loadQueue({ includeStats: queueModalOpen });
    if (typeof window.loadDashboardStats === "function") window.loadDashboardStats();
  } catch (e) {
    if (typeof showToast === "function") showToast("Failed to clear finished items");
  }
}

function escQ(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

// ESC key closes queue modal
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && queueModalOpen) closeQueueModal();
  if (e.key === "Escape" && captchaModalOpen) closeCaptchaModal();
});

// ===== Captcha Modal =====

let captchaModalOpen = false;
let captchaQueueId = null;
let captchaRefreshTimer = null;
let captchaStatusTimer = null;

function openCaptchaModal(queueId) {
  captchaQueueId = queueId;
  captchaModalOpen = true;
  const overlay = document.getElementById("captchaOverlay");
  const img = document.getElementById("captchaScreenshot");
  const hint = document.getElementById("captchaHint");
  if (!overlay || !img) return;

  img.src = "";
  if (hint) hint.textContent = "Loading browser screenshot...";
  overlay.style.display = "block";

  // Start screenshot polling
  captchaRefreshTimer = setInterval(function () {
    img.src = "/api/captcha/" + queueId + "/screenshot?t=" + Date.now();
    img.onload = function () {
      if (hint) hint.textContent = "Click anywhere in the screenshot to interact with the captcha.";
    };
    img.onerror = function () {
      if (hint) hint.textContent = "Waiting for captcha browser...";
    };
  }, 800);

  // Poll for solved status
  captchaStatusTimer = setInterval(async function () {
    try {
      const resp = await fetch("/api/captcha/" + queueId + "/status");
      const data = await resp.json();
      if (!data.active || data.done) {
        closeCaptchaModal();
        if (typeof showToast === "function")
          showToast("Captcha solved! Download resuming...");
        loadQueue();
      }
    } catch (e) {
      /* ignore */
    }
  }, 1500);
}

function closeCaptchaModal() {
  captchaModalOpen = false;
  captchaQueueId = null;
  const overlay = document.getElementById("captchaOverlay");
  if (overlay) overlay.style.display = "none";
  if (captchaRefreshTimer) {
    clearInterval(captchaRefreshTimer);
    captchaRefreshTimer = null;
  }
  if (captchaStatusTimer) {
    clearInterval(captchaStatusTimer);
    captchaStatusTimer = null;
  }
}

(function attachCaptchaClickHandler() {
  document.addEventListener("click", function (e) {
    const img = document.getElementById("captchaScreenshot");
    if (!img || e.target !== img || !captchaQueueId) return;
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    fetch("/api/captcha/" + captchaQueueId + "/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y }),
    }).catch(function () {});
  });
})();

// Live queue refresh with slow fallback polling
(function startBadgePoll() {
  if (window.LiveUpdates && typeof window.LiveUpdates.subscribe === "function") {
    window.LiveUpdates.subscribe(["queue"], function () {
      loadQueue({ includeStats: queueModalOpen });
    });
  }
  badgePollTimer = setInterval(function () {
    if (queueModalOpen && (!window.LiveUpdates || !window.LiveUpdates.isConnected())) {
      loadQueue({ includeStats: true });
    }
  }, 60000);
})();

function showToast(msg) {
  if (
    window.AniworldNotifications &&
    typeof window.AniworldNotifications.add === "function"
  ) {
    window.AniworldNotifications.add(msg, { source: "Queue" });
  }
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 4000);
}
