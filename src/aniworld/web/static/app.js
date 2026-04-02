const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const searchSpinner = document.getElementById("searchSpinner");
const resultsDiv = document.getElementById("results");
const overlay = document.getElementById("overlay");
const languageSelect = document.getElementById("languageSelect");
const providerSelect = document.getElementById("providerSelect");
const seasonAccordion = document.getElementById("seasonAccordion");
const episodeSpinner = document.getElementById("episodeSpinner");
const selectAllCb = document.getElementById("selectAll");
const autoSyncCheck = document.getElementById("autoSyncCheck");
const statusBar = document.getElementById("statusBar");
const statusText = document.getElementById("statusText");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const downloadSelectedBtn = document.getElementById("downloadSelectedBtn");
const randomBtn = document.getElementById("randomBtn");
const browseDiv = document.getElementById("browse");
const newAnimesGrid = document.getElementById("newAnimesGrid");
const popularAnimesGrid = document.getElementById("popularAnimesGrid");
const newAnimesSection = document.getElementById("newAnimesSection");
const popularAnimesSection = document.getElementById("popularAnimesSection");
const newSeriesGrid = document.getElementById("newSeriesGrid");
const popularSeriesGrid = document.getElementById("popularSeriesGrid");
const newSeriesSection = document.getElementById("newSeriesSection");
const popularSeriesSection = document.getElementById("popularSeriesSection");
const pageSubheading = document.getElementById("pageSubheading");
const searchHints = document.getElementById("searchHints");
const searchSuggestions = document.getElementById("searchSuggestions");
const statsGrid = document.getElementById("statsGrid");
const statsDetailGrid = document.getElementById("statsDetailGrid");
const favoritesList = document.getElementById("favoritesList");
const activityList = document.getElementById("activityList");
const providerQualityList = document.getElementById("providerQualityList");
const activityChart = document.getElementById("activityChart");
const releaseList = document.getElementById("releaseList");
const favoriteToggleBtn = document.getElementById("favoriteToggleBtn");
const isHomePage = Boolean(
  searchInput &&
    searchBtn &&
    resultsDiv &&
    overlay &&
    languageSelect &&
    providerSelect &&
    seasonAccordion &&
    browseDiv,
);
const isStatsPage = Boolean(
  statsGrid || statsDetailGrid || providerQualityList || activityChart,
);
const isTimelinePage = Boolean(
  activityList && !isStatsPage && !releaseList && !favoritesList,
);
const isRadarPage = Boolean(
  releaseList && !isStatsPage && !activityList && !favoritesList,
);
const isStandaloneFavoritesPage = Boolean(
  favoritesList &&
    !isHomePage &&
    !isStatsPage &&
    !isTimelinePage &&
    !isRadarPage,
);
const hasFavoritesSurface = Boolean(favoritesList && (isHomePage || isStandaloneFavoritesPage));

let currentSeasons = [];
let currentSeriesTitle = "";
let currentSeriesUrl = "";
// Provider data per language label
let availableProviders = null;
let langSeparationEnabled = false;
// Static list of providers rendered into the template
const staticProviders = providerSelect
  ? Array.from(providerSelect.options).map((o) => o.value)
  : [];

// Site toggle state
let currentSite = "aniworld";

// Downloaded folders cache
let downloadedFolders = [];
let dashboardData = null;
let favoriteMap = new Map();
let dashboardInitialized = false;
let lastNotificationState = { recentId: null, syncStamp: null };
let searchSuggestTimer = null;
let dashboardFallbackTimer = null;
let statsRequest = null;
let favoritesRequest = null;
let timelineRequest = null;
let radarRequest = null;

// Custom paths select
const customPathSelect = document.getElementById("customPathSelect");

async function loadCustomPaths() {
  if (!customPathSelect) return;
  try {
    const resp = await fetch("/api/custom-paths");
    const data = await resp.json();
    const paths = data.paths || [];
    // Remove old custom options (keep "Default")
    while (customPathSelect.options.length > 1) customPathSelect.remove(1);
    if (paths.length) {
      paths.forEach(function (p) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        customPathSelect.appendChild(opt);
      });
      customPathSelect.style.display = "";
    } else {
      customPathSelect.style.display = "none";
    }
    if (window.refreshCustomSelect) window.refreshCustomSelect(customPathSelect);
  } catch (e) {
    /* best-effort */
  }
}

async function loadDownloadedFolders() {
  try {
    const resp = await fetch("/api/downloaded-folders");
    const data = await resp.json();
    downloadedFolders = data.folders || [];
  } catch (e) {
    /* best-effort */
  }
}

function formatStatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatStatDate(value) {
  if (!value) return "Never";
  const iso = value.replace(" ", "T");
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "No completed jobs yet";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatShortDate(value) {
  if (!value) return "Never";
  const dt = new Date(value.replace(" ", "T"));
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
}

function formatRelativeDate(value) {
  if (!value) return "Just now";
  const dt = new Date(value.replace(" ", "T"));
  if (Number.isNaN(dt.getTime())) return value;
  const diffMs = Date.now() - dt.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} d ago`;
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function isDirectSeriesUrl(keyword) {
  return /^https?:\/\/(?:www\.)?(?:aniworld\.to\/anime\/stream\/|s\.to\/(?:serie\/)?(?:stream\/)?)/i.test(
    keyword,
  );
}

function releaseKey(item) {
  return item.url || `${item.title}-${item.season}-${item.episode}`;
}

function getReleaseSeenMap() {
  try {
    return JSON.parse(localStorage.getItem("releaseSeenMap") || "{}");
  } catch (e) {
    return {};
  }
}

function saveReleaseSeenMap(map) {
  localStorage.setItem("releaseSeenMap", JSON.stringify(map));
}

function getFavoritePosterHtml(item) {
  if (item.poster_url) {
    return `<img class="favorite-poster" src="${esc(item.poster_url)}" alt="${esc(item.title)}">`;
  }
  return `<div class="favorite-poster favorite-poster-placeholder">${esc(
    (item.title || "?").slice(0, 2).toUpperCase(),
  )}</div>`;
}

function updateFavoriteButton(forceFavoriteState) {
  if (!favoriteToggleBtn) return;
  const isFavorite =
    typeof forceFavoriteState === "boolean"
      ? forceFavoriteState
      : favoriteMap.has(currentSeriesUrl);
  favoriteToggleBtn.textContent = isFavorite
    ? "Remove Favorite"
    : "Add To Favorites";
}

function renderDashboardStats(general, queue, sync, storage) {
  if (!statsGrid || !statsDetailGrid) return;

  const queuedNow =
    Number(queue?.by_status?.queued || 0) + Number(queue?.by_status?.running || 0);
  const successRate =
    general?.total_downloads > 0
      ? Math.round((Number(general.completed || 0) / general.total_downloads) * 100)
      : 0;
  const topTitle = general?.top_titles?.[0];
  const topLanguage = general?.by_language?.[0];
  const running = queue?.currently_running;

  statsGrid.innerHTML = `
    <div class="stats-card">
      <span class="stats-label">Completed Downloads</span>
      <span class="stats-value">${formatStatNumber(general?.completed)}</span>
      <span class="stats-meta">${successRate}% success rate</span>
    </div>
    <div class="stats-card">
      <span class="stats-label">Downloaded Episodes</span>
      <span class="stats-value">${formatStatNumber(general?.total_episodes)}</span>
      <span class="stats-meta">${formatStatNumber(general?.last_24h_completed)} completed in the last 24h</span>
    </div>
    <div class="stats-card">
      <span class="stats-label">Queue Activity</span>
      <span class="stats-value">${formatStatNumber(queuedNow)}</span>
      <span class="stats-meta">${formatStatNumber(queue?.by_status?.queued || 0)} queued, ${formatStatNumber(queue?.by_status?.running || 0)} running</span>
    </div>
    <div class="stats-card">
      <span class="stats-label">Auto-Sync Active</span>
      <span class="stats-value">${formatStatNumber(sync?.enabled)}</span>
      <span class="stats-meta">${formatStatNumber(sync?.total_jobs)} total jobs</span>
    </div>
  `;

  statsDetailGrid.innerHTML = `
    <div class="stats-detail-card">
      <span class="stats-detail-title">Highlights</span>
      <div class="stats-detail-list">
        <div class="stats-detail-row">
          <span>Top title</span>
          <strong>${topTitle ? esc(topTitle.title) + ` <span class="stats-inline-badge">${formatStatNumber(topTitle.count)}x</span>` : "No completed downloads yet"}</strong>
        </div>
        <div class="stats-detail-row">
          <span>Top language</span>
          <strong>${topLanguage ? `${esc(topLanguage.language)} (${formatStatNumber(topLanguage.episodes)} eps)` : "No language data yet"}</strong>
        </div>
        <div class="stats-detail-row">
          <span>Anime vs. series</span>
          <strong>${formatStatNumber(general?.anime_downloads)} / ${formatStatNumber(general?.series_downloads)}</strong>
        </div>
      </div>
    </div>
    <div class="stats-detail-card">
      <span class="stats-detail-title">Live Status</span>
      <div class="stats-detail-list">
        <div class="stats-detail-row">
          <span>Currently running</span>
          <strong>${running ? `${esc(running.title)} (${formatStatNumber(running.current_episode || 0)}/${formatStatNumber(running.total_episodes || 0)})` : "No active download"}</strong>
        </div>
        <div class="stats-detail-row">
          <span>Last sync check</span>
          <strong>${formatStatDate(sync?.last_check)}</strong>
        </div>
        <div class="stats-detail-row">
          <span>Average completion time</span>
          <strong>${formatDuration(general?.average_duration_seconds)}</strong>
        </div>
        <div class="stats-detail-row">
          <span>Storage used</span>
          <strong>${formatBytes(storage?.total_size)}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderFavorites(items) {
  if (!favoritesList) return;
  if (!items.length) {
    favoritesList.innerHTML =
      '<div class="stats-empty">No favorites yet. Open a series and pin it.</div>';
    return;
  }
  favoritesList.innerHTML = items
    .map((item) => {
      const siteLabel = item.site
        ? item.site === "sto"
          ? "SerienStream"
          : "AniWorld"
        : (item.series_url || "").includes("s.to")
          ? "SerienStream"
          : "AniWorld";
      return `
        <div class="favorite-card">
          ${getFavoritePosterHtml(item)}
          <div class="favorite-content">
            <div class="favorite-title">${esc(item.title)}</div>
            <div class="favorite-meta">${esc(siteLabel)}</div>
            <div class="favorite-actions">
              <button class="btn-secondary btn-small" onclick="openFavoriteSeries('${esc(
                item.series_url,
              )}')">Open</button>
              <button class="btn-secondary btn-small" onclick="removeFavorite('${esc(
                item.series_url,
              )}')">Remove</button>
            </div>
          </div>
        </div>`;
    })
    .join("");
}

function activityStatusClass(status) {
  return `activity-status activity-status-${status || "queued"}`;
}

function renderActivity(items) {
  if (!activityList) return;
  if (!items.length) {
    activityList.innerHTML =
      '<div class="stats-empty">No recent activity yet.</div>';
    return;
  }

  activityList.innerHTML = items
    .map((item) => {
      const timeLabel = formatRelativeDate(item.completed_at || item.created_at);
      const retryBtn =
        item.status === "failed" || item.status === "cancelled"
          ? `<button class="btn-secondary btn-small" onclick="retryQueueItemFromDashboard(${item.id})">Retry</button>`
          : "";
      return `
        <div class="activity-item">
          <div class="activity-row">
            <div class="activity-title">${esc(item.title)}</div>
            <span class="${activityStatusClass(item.status)}">${esc(
              item.status,
            )}</span>
          </div>
          <div class="activity-meta">
            ${formatStatNumber(item.total_episodes)} episodes, ${esc(
              item.language || "Unknown",
            )}, ${esc(item.provider || "Unknown")} - ${timeLabel}
          </div>
          ${
            retryBtn
              ? `<div class="activity-actions">${retryBtn}</div>`
              : ""
          }
        </div>`;
    })
    .join("");
}

function renderActivityChart(items) {
  if (!activityChart) return;
  if (!items.length) {
    activityChart.innerHTML =
      '<div class="stats-empty">No chart data yet.</div>';
    return;
  }
  const maxValue = Math.max(...items.map((item) => Number(item.completed || 0)), 1);
  activityChart.innerHTML = items
    .map((item) => {
      const height = Math.max(12, Math.round((Number(item.completed || 0) / maxValue) * 120));
      return `
        <div class="chart-bar-wrap">
          <span class="chart-bar-value">${formatStatNumber(item.completed)}</span>
          <div class="chart-bar" style="height:${height}px"></div>
          <span class="chart-bar-label">${formatShortDate(item.day)}</span>
        </div>`;
    })
    .join("");
}

function renderProviderQuality(items) {
  if (!providerQualityList) return;
  if (!items.length) {
    providerQualityList.innerHTML =
      '<div class="stats-empty">No provider data yet.</div>';
    return;
  }
  providerQualityList.innerHTML = items
    .map((item) => {
      const total = Number(item.completed || 0) + Number(item.failed || 0);
      const rate = total ? Math.round((Number(item.completed || 0) / total) * 100) : 0;
      return `
        <div class="provider-quality-item">
          <div class="provider-quality-row">
            <strong>${esc(item.provider || "Unknown")}</strong>
            <span class="provider-quality-rate">${rate}%</span>
          </div>
          <div class="provider-quality-meta">
            ${formatStatNumber(item.completed)} completed, ${formatStatNumber(
              item.failed,
            )} failed, ${formatStatNumber(item.episodes)} eps delivered
          </div>
        </div>`;
    })
    .join("");
}

function renderReleases(items) {
  if (!releaseList) return;
  if (!items.length) {
    releaseList.innerHTML =
      '<div class="stats-empty">No release data available.</div>';
    return;
  }
  const seenMap = getReleaseSeenMap();
  releaseList.innerHTML = items
    .map((item) => {
      const key = releaseKey(item);
      const isNew = !seenMap[key];
      const languages = (item.languages || [])
        .map((lang) => `<span class="release-badge">${esc(lang)}</span>`)
        .join("");
      return `
        <div class="release-item">
          <div class="release-title">${esc(item.title || "Unknown")}</div>
          <div class="release-meta">
            Season ${formatStatNumber(item.season)} - Episode ${formatStatNumber(
              item.episode,
            )} - ${esc(item.date || "")}
          </div>
          <div class="release-badges">
            ${isNew ? '<span class="release-badge release-badge-new">New</span>' : ""}
            ${languages}
          </div>
        </div>`;
    })
    .join("");
}

function syncFavoriteMap(items) {
  favoriteMap = new Map(items.map((item) => [item.series_url, item]));
  updateFavoriteButton();
}

function maybeNotifyDashboard(data) {
  const recent = data?.recent_activity?.[0];
  const recentStamp = recent ? `${recent.id}:${recent.status}` : null;
  const syncStamp = data?.sync?.last_new_found || null;

  if (!dashboardInitialized) {
    lastNotificationState = { recentId: recentStamp, syncStamp };
    dashboardInitialized = true;
    return;
  }

  if (
    recent &&
    recentStamp !== lastNotificationState.recentId &&
    recent.status === "completed"
  ) {
    showToast(`Finished: ${recent.title}`);
  }

  if (syncStamp && syncStamp !== lastNotificationState.syncStamp) {
    showToast("Auto-Sync found new episodes");
  }

  lastNotificationState = { recentId: recentStamp, syncStamp };
}

function renderDashboard(data) {
  if (!data) return;
  dashboardData = data;
  renderDashboardStats(data.general, data.queue, data.sync, data.storage);
  renderFavorites(data.favorites || []);
  renderActivity(data.history || data.recent_activity || []);
  renderActivityChart(data.activity_chart || []);
  renderProviderQuality(data.provider_quality || []);
  renderReleases(data.releases || []);
  syncFavoriteMap(data.favorites || []);
  maybeNotifyDashboard(data);
}

function renderStatsError() {
  if (statsGrid) {
    statsGrid.innerHTML =
      '<div class="stats-card stats-empty">Stats could not be loaded.</div>';
  }
  if (statsDetailGrid) statsDetailGrid.innerHTML = "";
  if (favoritesList) {
    favoritesList.innerHTML =
      '<div class="stats-empty">Dashboard data could not be loaded.</div>';
  }
  if (activityList) {
    activityList.innerHTML =
      '<div class="stats-empty">Timeline data could not be loaded.</div>';
  }
  if (providerQualityList) {
    providerQualityList.innerHTML =
      '<div class="stats-empty">Provider data could not be loaded.</div>';
  }
  if (activityChart) {
    activityChart.innerHTML =
      '<div class="stats-empty">Chart data could not be loaded.</div>';
  }
  if (releaseList) {
    releaseList.innerHTML =
      '<div class="stats-empty">Radar data could not be loaded.</div>';
  }
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Request failed for ${url}: ${resp.status}`);
  }
  return resp.json();
}

async function loadStatsPage() {
  if (!isStatsPage) return null;
  if (statsRequest) return statsRequest;

  statsRequest = (async () => {
    try {
      const data = await fetchJson("/api/dashboard/stats");
      dashboardData = { ...(dashboardData || {}), ...data };
      renderDashboardStats(data.general, data.queue, data.sync, data.storage);
      renderActivityChart(data.activity_chart || []);
      renderProviderQuality(data.provider_quality || []);
      return data;
    } catch (e) {
      renderStatsError();
      return null;
    } finally {
      statsRequest = null;
    }
  })();

  return statsRequest;
}

async function loadFavoritesSurface() {
  if (!hasFavoritesSurface) return null;
  if (favoritesRequest) return favoritesRequest;

  favoritesRequest = (async () => {
    try {
      const data = await fetchJson("/api/favorites");
      renderFavorites(data.items || []);
      syncFavoriteMap(data.items || []);
      dashboardData = { ...(dashboardData || {}), favorites: data.items || [] };
      return data.items || [];
    } catch (e) {
      favoritesList.innerHTML =
        '<div class="stats-empty">Favorites could not be loaded.</div>';
      return null;
    } finally {
      favoritesRequest = null;
    }
  })();

  return favoritesRequest;
}

async function loadTimelinePage() {
  if (!isTimelinePage) return null;
  if (timelineRequest) return timelineRequest;

  timelineRequest = (async () => {
    try {
      const data = await fetchJson("/api/history?limit=20");
      const items = data.items || [];
      renderActivity(items);
      dashboardData = { ...(dashboardData || {}), history: items };
      return items;
    } catch (e) {
      if (activityList) {
        activityList.innerHTML =
          '<div class="stats-empty">Timeline data could not be loaded.</div>';
      }
      return null;
    } finally {
      timelineRequest = null;
    }
  })();

  return timelineRequest;
}

async function loadRadarPage() {
  if (!isRadarPage) return null;
  if (radarRequest) return radarRequest;

  radarRequest = (async () => {
    try {
      const data = await fetchJson("/api/new-episodes");
      const releases = data.results || [];
      renderReleases(releases);
      dashboardData = { ...(dashboardData || {}), releases };
      return releases;
    } catch (e) {
      if (releaseList) {
        releaseList.innerHTML =
          '<div class="stats-empty">Radar data could not be loaded.</div>';
      }
      return null;
    } finally {
      radarRequest = null;
    }
  })();

  return radarRequest;
}

async function loadDashboardStats() {
  const tasks = [];
  if (isStatsPage) tasks.push(loadStatsPage());
  if (hasFavoritesSurface) tasks.push(loadFavoritesSurface());
  if (isTimelinePage) tasks.push(loadTimelinePage());
  if (isRadarPage) tasks.push(loadRadarPage());
  return Promise.all(tasks);
}

function hideSearchSuggestions() {
  if (!searchSuggestions) return;
  searchSuggestions.innerHTML = "";
  searchSuggestions.classList.remove("is-visible");
}

function renderSearchHints(items) {
  if (!searchHints) return;
  if (!items.length) {
    searchHints.innerHTML = "";
    return;
  }
  searchHints.innerHTML = items
    .map(
      (item) =>
        `<button class="search-hint-chip" type="button" data-keyword="${encodeURIComponent(
          item.keyword,
        )}" onclick="applySearchSuggestion(decodeURIComponent(this.dataset.keyword))">${esc(item.keyword)}</button>`,
    )
    .join("");
}

function renderSearchSuggestions(items, query) {
  if (!searchSuggestions) return;
  if (!query || query.length < 2 || !items.length) {
    hideSearchSuggestions();
    return;
  }

  searchSuggestions.innerHTML = items
    .map(
      (item) =>
        `<button class="search-suggestion-item" type="button" data-keyword="${encodeURIComponent(
          item.keyword,
        )}" onclick="applySearchSuggestion(decodeURIComponent(this.dataset.keyword))">
          <span class="search-suggestion-title">${esc(item.keyword)}</span>
          <span class="search-suggestion-meta">${formatRelativeDate(item.last_used_at)}</span>
        </button>`,
    )
    .join("");
  searchSuggestions.classList.add("is-visible");
}

async function loadSearchSuggestions(query = "") {
  if (!searchInput || (!searchHints && !searchSuggestions)) return;
  try {
    const resp = await fetch(
      `/api/search/suggestions?site=${encodeURIComponent(
        currentSite,
      )}&q=${encodeURIComponent(query)}`,
    );
    const data = await resp.json();
    renderSearchHints(data.recent || []);
    const normalizedQuery = query.trim().toLowerCase();
    renderSearchSuggestions(
      (data.suggestions || []).filter(
        (item) => (item.keyword || "").trim().toLowerCase() !== normalizedQuery,
      ),
      query,
    );
  } catch (e) {
    hideSearchSuggestions();
  }
}

function applySearchSuggestion(keyword) {
  if (!searchInput) return;
  searchInput.value = keyword || "";
  hideSearchSuggestions();
  doSearch();
}

const scheduleSearchSuggestions = debounce(() => {
  if (!searchInput) return;
  loadSearchSuggestions(searchInput.value.trim());
}, 180);

async function openFavoriteSeries(url) {
  if (!url) return;
  if (!isHomePage) {
    const target = new URL("/", window.location.href);
    target.searchParams.set("openSeries", url);
    window.location.href = target.toString();
    return;
  }
  currentSite = url.includes("s.to") ? "sto" : "aniworld";
  const toggle = document.getElementById("siteToggle");
  if (toggle) {
    toggle.checked = currentSite === "sto";
    toggleSite();
  }
  await openSeries(url);
}

async function removeFavorite(url) {
  if (!url) return;
  try {
    await fetch("/api/favorites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ series_url: url }),
    });
    favoriteMap.delete(url);
    updateFavoriteButton();
    loadDashboardStats();
  } catch (e) {
    showToast("Failed to remove favorite");
  }
}

async function toggleFavorite() {
  if (!currentSeriesUrl || !currentSeriesTitle) return;
  const isFavorite = favoriteMap.has(currentSeriesUrl);
  try {
    if (isFavorite) {
      await fetch("/api/favorites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ series_url: currentSeriesUrl }),
      });
      favoriteMap.delete(currentSeriesUrl);
      showToast("Removed from favorites");
    } else {
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: currentSeriesTitle,
          series_url: currentSeriesUrl,
          poster_url: document.getElementById("modalPoster").src || "",
          site: currentSite,
        }),
      });
      showToast("Added to favorites");
    }
    updateFavoriteButton(!isFavorite);
    loadDashboardStats();
  } catch (e) {
    showToast("Favorite update failed");
  }
}

async function retryQueueItemFromDashboard(id) {
  try {
    const resp = await fetch("/api/queue/" + id + "/retry", { method: "POST" });
    const data = await resp.json();
    if (data.error) {
      showToast(data.error);
    } else {
      showToast("Retry queued");
      if (typeof loadQueue === "function") loadQueue();
      loadDashboardStats();
    }
  } catch (e) {
    showToast("Retry failed");
  }
}

async function retryFailedFromDashboard() {
  if (typeof retryFailedQueueItems === "function") {
    await retryFailedQueueItems();
  }
}

async function clearFinishedFromDashboard() {
  if (typeof clearFinishedQueueItems === "function") {
    await clearFinishedQueueItems();
  }
}

function markReleasesSeen() {
  const seenMap = getReleaseSeenMap();
  (dashboardData?.releases || []).forEach((item) => {
    seenMap[releaseKey(item)] = true;
  });
  saveReleaseSeenMap(seenMap);
  renderReleases(dashboardData?.releases || []);
}

async function autoOpenSeriesFromQuery() {
  if (!isHomePage) return;
  const params = new URLSearchParams(window.location.search);
  const url = params.get("openSeries");
  if (!url) return;
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("openSeries");
  window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search);

  currentSite = url.includes("s.to") ? "sto" : "aniworld";
  const toggle = document.getElementById("siteToggle");
  if (toggle) {
    toggle.checked = currentSite === "sto";
    toggleSite();
  }
  await openSeries(url);
}

let stoLoadedAt = 0;
async function loadStoBrowse() {
  if (stoLoadedAt && Date.now() - stoLoadedAt < 3600000) return;
  stoLoadedAt = Date.now();
  try {
    const [newResp, popResp] = await Promise.all([
      fetch("/api/new-series"),
      fetch("/api/popular-series"),
    ]);
    await loadDownloadedFolders();
    const newData = await newResp.json();
    const popData = await popResp.json();
    if (newData.results) renderBrowseCards(newSeriesGrid, newData.results);
    if (popData.results) renderBrowseCards(popularSeriesGrid, popData.results);
  } catch (e) {
    stoLoadedAt = 0;
  }
}

function showBrowseSections() {
  if (!isHomePage) return;
  const isAniworld = currentSite === "aniworld";
  browseDiv.style.display = "";
  newAnimesSection.style.display = isAniworld ? "" : "none";
  popularAnimesSection.style.display = isAniworld ? "" : "none";
  newSeriesSection.style.display = isAniworld ? "none" : "";
  popularSeriesSection.style.display = isAniworld ? "none" : "";
  if (isAniworld) loadAniworldBrowse();
  else loadStoBrowse();
}

function normalizeQuotes(s) {
  return s
    .replace(/[\u2018\u2019\u2032\u0060]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"');
}

function isDownloaded(title) {
  if (!downloadedFolders.length || !title) return false;
  const clean = normalizeQuotes(
    unesc(title)
      .replace(/\s*\(.*$/, "")
      .trim()
      .toLowerCase(),
  );
  return downloadedFolders.some((f) =>
    normalizeQuotes(f.toLowerCase()).startsWith(clean),
  );
}

function addDownloadedBadge(card, title) {
  if (isDownloaded(title)) {
    const badge = document.createElement("div");
    badge.className = "downloaded-badge";
    card.style.position = "relative";
    card.appendChild(badge);
  }
}

function toggleSite() {
  if (!isHomePage) return;
  const toggle = document.getElementById("siteToggle");
  currentSite = toggle.checked ? "sto" : "aniworld";
  localStorage.setItem("selectedSite", currentSite);

  // Update labels
  document
    .getElementById("labelAniworld")
    .classList.toggle("active", !toggle.checked);
  document
    .getElementById("labelSto")
    .classList.toggle("active", toggle.checked);

  // Update heading
  const heading = document.getElementById("pageHeading");
  if (heading)
    heading.textContent = toggle.checked
      ? "SerienStream Downloader"
      : "AniWorld Downloader";
  if (pageSubheading) {
    pageSubheading.textContent = toggle.checked
      ? "Browse SerienStream titles, inspect seasons, and queue episodes with the same streamlined workflow."
      : "Search AniWorld titles, inspect seasons, and queue downloads with a cleaner control surface.";
  }

  // Update search placeholder
  searchInput.placeholder = toggle.checked
    ? "Search for series..."
    : "Search for anime...";

  // Clear search results
  resultsDiv.innerHTML = "";
  searchInput.value = "";

  // Toggle browse sections per site
  showBrowseSections();

  // Toggle Random button
  randomBtn.style.display = toggle.checked ? "none" : "";

  // Update language dropdown
  rebuildLanguageSelect();

  // Reset providers
  availableProviders = null;
  loadSearchSuggestions("");
}

function rebuildLanguageSelect() {
  if (!languageSelect) return;
  const langs =
    currentSite === "sto"
      ? window.STO_LANGS || {}
      : window.ANIWORLD_LANGS || {};
  languageSelect.innerHTML = "";

  if (langSeparationEnabled) {
    const opt = document.createElement("option");
    opt.value = "All Languages";
    opt.textContent = "All Languages";
    languageSelect.appendChild(opt);
  }

  for (const [key, label] of Object.entries(langs)) {
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    languageSelect.appendChild(opt);
  }
  if (window.refreshCustomSelect) window.refreshCustomSelect(languageSelect);
}

// Restore site toggle state from localStorage
(function syncSiteToggle() {
  if (!isHomePage) return;
  const toggle = document.getElementById("siteToggle");
  const saved = localStorage.getItem("selectedSite");
  if (saved === "sto") toggle.checked = true;
  if (toggle && toggle.checked) {
    currentSite = "sto";
    document.getElementById("labelAniworld").classList.remove("active");
    document.getElementById("labelSto").classList.add("active");
    const heading = document.getElementById("pageHeading");
    if (heading) heading.textContent = "SerienStream Downloader";
    if (pageSubheading) {
      pageSubheading.textContent =
        "Browse SerienStream titles, inspect seasons, and queue episodes with the same streamlined workflow.";
    }
    searchInput.placeholder = "Search for series...";
    randomBtn.style.display = "none";
    rebuildLanguageSelect();
  }
})();

if (searchInput) {
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });
  searchInput.addEventListener("focus", () => {
    loadSearchSuggestions(searchInput.value.trim());
  });
  searchInput.addEventListener("input", () => {
    if (!searchInput.value.trim() && resultsDiv) {
      resultsDiv.innerHTML = "";
      showBrowseSections();
      hideSearchSuggestions();
      loadSearchSuggestions("");
      return;
    }
    scheduleSearchSuggestions();
  });
}

document.addEventListener("click", (event) => {
  if (!searchInput || !searchSuggestions) return;
  const insideSearch =
    event.target === searchInput ||
    searchSuggestions.contains(event.target) ||
    (searchHints && searchHints.contains(event.target));
  if (!insideSearch) hideSearchSuggestions();
});

if (languageSelect) {
  languageSelect.addEventListener("change", updateProviderDropdown);
}

function renderBrowseCards(grid, items) {
  grid.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "browse-card";
    card.onclick = () => openSeries(item.url);
    card.innerHTML =
      `<img src="${esc(item.poster_url)}" alt="">` +
      `<div class="browse-info">` +
      `<div class="browse-title">${esc(item.title)}</div>` +
      `<div class="browse-genre">${esc(item.genre)}</div>` +
      `</div>`;
    addDownloadedBadge(card, item.title);
    grid.appendChild(card);
  });
}

let aniLoadedAt = 0;
async function loadAniworldBrowse() {
  if (aniLoadedAt && Date.now() - aniLoadedAt < 3600000) return;
  aniLoadedAt = Date.now();
  try {
    const [newResp, popResp] = await Promise.all([
      fetch("/api/new-animes"),
      fetch("/api/popular-animes"),
    ]);
    await loadDownloadedFolders();
    const newData = await newResp.json();
    const popData = await popResp.json();
    if (newData.results) renderBrowseCards(newAnimesGrid, newData.results);
    if (popData.results) renderBrowseCards(popularAnimesGrid, popData.results);
  } catch (e) {
    aniLoadedAt = 0;
  }
}
window.loadDashboardStats = loadDashboardStats;
if (isHomePage) {
  showBrowseSections();
  autoOpenSeriesFromQuery();
  loadSearchSuggestions("");
}

if (hasFavoritesSurface || isStatsPage || isTimelinePage || isRadarPage) {
  loadDashboardStats();
}

if (window.LiveUpdates && typeof window.LiveUpdates.subscribe === "function") {
  if (hasFavoritesSurface) {
    window.LiveUpdates.subscribe(["favorites"], () => {
      loadFavoritesSurface();
    });
  }

  if (isStatsPage) {
    const refreshStatsFromLive = debounce(() => {
      loadStatsPage();
    }, 250);
    window.LiveUpdates.subscribe(
      ["dashboard", "queue", "autosync", "library", "settings"],
      refreshStatsFromLive,
    );
  }

  if (isTimelinePage) {
    const refreshTimelineFromLive = debounce(() => {
      loadTimelinePage();
    }, 250);
    window.LiveUpdates.subscribe(["queue", "dashboard"], refreshTimelineFromLive);
  }
}

if (hasFavoritesSurface || isStatsPage || isTimelinePage || isRadarPage) {
  const fallbackMs = isRadarPage ? 180000 : 90000;
  dashboardFallbackTimer = setInterval(() => {
    if (!window.LiveUpdates || !window.LiveUpdates.isConnected()) {
      loadDashboardStats();
    }
  }, fallbackMs);
}

async function doSearch() {
  const keyword = searchInput.value.trim();
  if (!keyword) return;
  hideSearchSuggestions();

  if (isDirectSeriesUrl(keyword)) {
    openSeries(keyword);
    return;
  }

  searchBtn.disabled = true;
  searchSpinner.style.display = "block";
  resultsDiv.innerHTML = "";
  browseDiv.style.display = "none";
  try {
    const resp = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, site: currentSite }),
    });
    const data = await resp.json();
    if (data.error) {
      showToast(data.error);
      return;
    }
    renderResults(data.results || []);
    loadSearchSuggestions("");
  } catch (e) {
    showToast("Search failed: " + e.message);
  } finally {
    searchBtn.disabled = false;
    searchSpinner.style.display = "none";
  }
}

async function doRandom() {
  if (currentSite === "sto") {
    showToast("Random is not available for S.TO");
    return;
  }
  randomBtn.disabled = true;
  try {
    const resp = await fetch("/api/random");
    const data = await resp.json();
    if (data.error) {
      showToast(data.error);
      return;
    }
    openSeries(data.url);
  } catch (e) {
    showToast("Failed to fetch random anime: " + e.message);
  } finally {
    randomBtn.disabled = false;
  }
}

function renderResults(results) {
  resultsDiv.innerHTML = "";
  if (!results.length) {
    resultsDiv.innerHTML =
      '<div style="width:100%;text-align:center;color:#888;padding:40px">No results found.</div>';
    return;
  }
  results.forEach((r) => {
    const card = document.createElement("div");
    card.className = "card";
    card.onclick = () => openSeries(r.url);
    card.innerHTML = `<img src="" alt="" data-url="${esc(r.url)}"><div class="info"><div class="title">${esc(r.title)}</div></div>`;
    addDownloadedBadge(card, r.title);
    resultsDiv.appendChild(card);
    loadPoster(r.url, card.querySelector("img"));
  });
}

async function loadPoster(url, imgEl) {
  try {
    const resp = await fetch("/api/series?url=" + encodeURIComponent(url));
    const data = await resp.json();
    if (data.poster_url) imgEl.src = data.poster_url;
  } catch (e) {
    /* ignore poster load failure */
  }
}

async function openSeries(url) {
  if (!isHomePage) return;
  overlay.style.display = "block";
  document.getElementById("modalPoster").src = "";
  document.getElementById("modalTitle").textContent = "Loading...";
  document.getElementById("modalGenres").textContent = "";
  document.getElementById("modalYear").textContent = "";
  document.getElementById("modalDesc").textContent = "";
  seasonAccordion.innerHTML = "";
  statusBar.classList.remove("active");
  availableProviders = null;
  currentSeriesUrl = url;
  currentSeriesTitle = "";
  updateFavoriteButton(false);
  await checkLangSeparation();
  rebuildLanguageSelect();
  resetProviderDropdown();
  loadCustomPaths();

  try {
    const [seriesResp, seasonsResp] = await Promise.all([
      fetch("/api/series?url=" + encodeURIComponent(url)),
      fetch("/api/seasons?url=" + encodeURIComponent(url)),
    ]);
    const seriesData = await seriesResp.json();
    const seasonsData = await seasonsResp.json();

    currentSeriesTitle = seriesData.title || "Unknown";
    document.getElementById("modalTitle").textContent = currentSeriesTitle;
    if (seriesData.poster_url)
      document.getElementById("modalPoster").src = seriesData.poster_url;
    document.getElementById("modalGenres").textContent = (
      seriesData.genres || []
    ).join(", ");
    document.getElementById("modalYear").textContent =
      seriesData.release_year || "";
    document.getElementById("modalDesc").textContent =
      seriesData.description || "";
    updateFavoriteButton(!!seriesData.is_favorite);

    currentSeasons = seasonsData.seasons || [];
    buildAccordion(currentSeasons);

    // Check if auto-sync exists for this series
    if (autoSyncCheck) {
      autoSyncCheck.checked = false;
      try {
        const syncResp = await fetch(
          "/api/autosync/check?url=" + encodeURIComponent(url),
        );
        const syncData = await syncResp.json();
        autoSyncCheck.checked = !!syncData.exists;
      } catch (e) {
        /* ignore */
      }
    }
  } catch (e) {
    showToast("Failed to load series: " + e.message);
  }
}

function buildAccordion(seasons) {
  seasonAccordion.innerHTML = "";
  episodeSpinner.style.display = "block";
  selectAllCb.checked = false;

  // Fetch all seasons' episodes in parallel
  const fetches = seasons.map((s, i) =>
    fetch("/api/episodes?url=" + encodeURIComponent(s.url))
      .then((r) => r.json())
      .then((data) => ({ index: i, episodes: data.episodes || [] }))
      .catch(() => ({ index: i, episodes: [] })),
  );

  Promise.all(fetches).then((results) => {
    episodeSpinner.style.display = "none";
    let firstProviderUrl = null;

    results.sort((a, b) => a.index - b.index);
    results.forEach(({ index, episodes }) => {
      const season = seasons[index];
      const section = document.createElement("div");
      section.className = "season-section";
      section.dataset.seasonIndex = index;

      const label = season.are_movies
        ? `Movies (${episodes.length} episodes)`
        : `Season ${season.season_number} (${episodes.length} episodes)`;

      // Header
      const allDownloaded =
        episodes.length > 0 && episodes.every((ep) => ep.downloaded);
      const seasonDlIcon = allDownloaded
        ? '<span class="season-downloaded" title="All episodes downloaded">&#10003;</span>'
        : "";
      const header = document.createElement("div");
      header.className = "season-header" + (index === 0 ? " expanded" : "");
      header.innerHTML =
        `<div class="season-label"><span class="season-arrow">&#9654;</span> ${esc(label)}${seasonDlIcon}</div>` +
        `<label class="season-all-label" onclick="event.stopPropagation()"><input type="checkbox" onchange="toggleSeasonAll(this, ${index})"> All</label>`;
      header.addEventListener("click", () => toggleSeason(index));

      // Body
      const body = document.createElement("div");
      body.className = "season-body" + (index === 0 ? " expanded" : "");
      body.id = "seasonBody-" + index;

      episodes.forEach((ep) => {
        const div = document.createElement("div");
        div.className = "episode-item";
        const title = ep.title_en || ep.title_de || "";
        const dlIcon = ep.downloaded
          ? '<span class="ep-downloaded" title="Downloaded">&#10003;</span>'
          : "";
        div.innerHTML = `<input type="checkbox" value="${esc(ep.url)}" data-season="${index}"><span class="ep-num">E${ep.episode_number}</span>${dlIcon}<span class="ep-title">${esc(title)}</span>`;
        body.appendChild(div);
      });

      if (!firstProviderUrl && episodes.length) {
        firstProviderUrl = episodes[0].url;
      }

      section.appendChild(header);
      section.appendChild(body);
      seasonAccordion.appendChild(section);
    });

    // Fetch providers from first episode
    if (firstProviderUrl) {
      fetchProviders(firstProviderUrl);
    }
  });
}

function toggleSeason(index) {
  const section = seasonAccordion.querySelector(
    `[data-season-index="${index}"]`,
  );
  if (!section) return;
  const header = section.querySelector(".season-header");
  const body = section.querySelector(".season-body");
  header.classList.toggle("expanded");
  body.classList.toggle("expanded");
}

function toggleSeasonAll(checkbox, seasonIndex) {
  const body = document.getElementById("seasonBody-" + seasonIndex);
  if (!body) return;
  body
    .querySelectorAll("input[type=checkbox]")
    .forEach((cb) => (cb.checked = checkbox.checked));
  syncSelectAll();
}

function toggleSelectAll() {
  const checked = selectAllCb.checked;
  seasonAccordion
    .querySelectorAll("input[type=checkbox]")
    .forEach((cb) => (cb.checked = checked));
}

function syncSelectAll() {
  const all = seasonAccordion.querySelectorAll(
    ".episode-item input[type=checkbox]",
  );
  const checked = seasonAccordion.querySelectorAll(
    ".episode-item input[type=checkbox]:checked",
  );
  selectAllCb.checked = all.length > 0 && all.length === checked.length;
}

function getAllEpisodeUrls() {
  return Array.from(
    seasonAccordion.querySelectorAll(".episode-item input[type=checkbox]"),
  ).map((cb) => cb.value);
}

function getSelectedEpisodeUrls() {
  return Array.from(
    seasonAccordion.querySelectorAll(
      ".episode-item input[type=checkbox]:checked",
    ),
  ).map((cb) => cb.value);
}

async function fetchProviders(episodeUrl) {
  try {
    const resp = await fetch(
      "/api/providers?url=" + encodeURIComponent(episodeUrl),
    );
    const data = await resp.json();
    if (data.providers) {
      availableProviders = data.providers;
      updateProviderDropdown();
    }
  } catch (e) {
    // If provider fetch fails, keep the static list
  }
}

function resetProviderDropdown() {
  providerSelect.innerHTML = "";
  staticProviders.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    providerSelect.appendChild(opt);
  });
  selectDefaultProvider();
  if (window.refreshCustomSelect) window.refreshCustomSelect(providerSelect);
}

function updateProviderDropdown() {
  if (!availableProviders) return;

  const lang = languageSelect.value;
  const providers = availableProviders[lang];

  providerSelect.innerHTML = "";
  if (providers && providers.length) {
    providers.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      providerSelect.appendChild(opt);
    });
  } else {
    staticProviders.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      providerSelect.appendChild(opt);
    });
  }
  selectDefaultProvider();
  if (window.refreshCustomSelect) window.refreshCustomSelect(providerSelect);
}

function selectDefaultProvider() {
  for (const opt of providerSelect.options) {
    if (opt.value === "VOE") {
      providerSelect.value = "VOE";
      return;
    }
  }
}

async function startDownload(all) {
  const episodes = all ? getAllEpisodeUrls() : getSelectedEpisodeUrls();
  if (!episodes.length) {
    showToast(all ? "No episodes available." : "No episodes selected.");
    return;
  }

  const language = languageSelect.value;
  const provider = providerSelect.value;

  downloadAllBtn.disabled = true;
  downloadSelectedBtn.disabled = true;
  try {
    const dlBody = {
      episodes,
      language,
      provider,
      title: currentSeriesTitle,
      series_url: currentSeriesUrl,
    };
    if (customPathSelect && customPathSelect.value) {
      dlBody.custom_path_id = parseInt(customPathSelect.value);
    }
    const resp = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dlBody),
    });
    const data = await resp.json();
    if (data.error) {
      showToast(data.error);
      return;
    }

    showToast("Added to download queue");
    if (typeof loadQueue === "function") loadQueue();
    loadDashboardStats();
  } catch (e) {
    showToast("Download request failed: " + e.message);
  } finally {
    downloadAllBtn.disabled = false;
    downloadSelectedBtn.disabled = false;
  }
}

function closeModal() {
  if (!overlay) return;
  overlay.style.display = "none";
  if (autoSyncCheck) autoSyncCheck.checked = false;
}
function closeModalOutside(e) {
  if (e.target === overlay) closeModal();
}

// Auto-Sync toggle from modal checkbox
async function toggleAutoSync() {
  if (!autoSyncCheck) return;
  if (autoSyncCheck.checked) {
    // Select all episodes
    selectAllCb.checked = true;
    toggleSelectAll();
    // Create sync job
    try {
      const body = {
        title: currentSeriesTitle,
        series_url: currentSeriesUrl,
        language: languageSelect.value,
        provider: providerSelect.value,
      };
      if (customPathSelect && customPathSelect.value) {
        body.custom_path_id = parseInt(customPathSelect.value);
      }
      const resp = await fetch("/api/autosync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (data.ok) {
        showToast('Auto-Sync enabled for "' + currentSeriesTitle + '"');
      } else if (resp.status === 409 && data.job) {
        // Job already exists - update it with current modal settings
        const updateBody = {
          language: languageSelect.value,
          provider: providerSelect.value,
          custom_path_id:
            customPathSelect && customPathSelect.value
              ? parseInt(customPathSelect.value)
              : null,
        };
        const putResp = await fetch("/api/autosync/" + data.job.id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateBody),
        });
        const putData = await putResp.json();
        if (putData.ok) {
          showToast('Auto-Sync updated for "' + currentSeriesTitle + '"');
        } else {
          showToast(putData.error || "Failed to update sync job");
        }
      } else if (data.error) {
        showToast(data.error);
      }
    } catch (e) {
      showToast("Failed to create sync job");
      autoSyncCheck.checked = false;
    }
  } else {
    // Remove sync job
    try {
      const resp = await fetch(
        "/api/autosync/check?url=" + encodeURIComponent(currentSeriesUrl),
      );
      const data = await resp.json();
      if (data.exists && data.job) {
        const delResp = await fetch("/api/autosync/" + data.job.id, {
          method: "DELETE",
        });
        const delData = await delResp.json();
        if (delData.ok) {
          showToast('Auto-Sync disabled for "' + currentSeriesTitle + '"');
        } else {
          showToast(delData.error || "Failed to remove sync job");
          autoSyncCheck.checked = true;
        }
      }
    } catch (e) {
      showToast("Failed to remove sync job");
      autoSyncCheck.checked = true;
    }
  }
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 4000);
}

function unesc(s) {
  const d = document.createElement("textarea");
  d.innerHTML = s || "";
  return d.value;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = unesc(s);
  return d.innerHTML;
}

const downloadAllLangsBtn = document.getElementById("downloadAllLangsBtn");
let defaultSyncLanguage = "German Dub";

async function checkLangSeparation() {
  try {
    const resp = await fetch("/api/settings");
    const data = await resp.json();
    langSeparationEnabled = data.lang_separation === "1";
    if (data.sync_language) {
      defaultSyncLanguage = data.sync_language;
    }
    if (downloadAllLangsBtn) {
      downloadAllLangsBtn.style.display = langSeparationEnabled ? "" : "none";
    }
    if (window.refreshCustomSelect) window.refreshCustomSelect(languageSelect);
  } catch (e) {
    /* ignore */
  }
}

async function startDownloadAllLangs() {
  const episodes = getAllEpisodeUrls();
  if (!episodes.length) {
    showToast("No episodes available.");
    return;
  }
  if (!availableProviders) {
    showToast("Provider data not loaded yet.");
    return;
  }

  downloadAllLangsBtn.disabled = true;
  downloadAllBtn.disabled = true;
  downloadSelectedBtn.disabled = true;

  let queued = 0;
  try {
    for (const [lang, providers] of Object.entries(availableProviders)) {
      if (!providers.length) continue;
      const provider = providers.includes("VOE") ? "VOE" : providers[0];
      const dlBody = {
        episodes,
        language: lang,
        provider,
        title: currentSeriesTitle,
        series_url: currentSeriesUrl,
      };
      if (customPathSelect && customPathSelect.value) {
        dlBody.custom_path_id = parseInt(customPathSelect.value);
      }
      const resp = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dlBody),
      });
      const data = await resp.json();
      if (!data.error) queued++;
    }
    showToast("Queued downloads for " + queued + " language(s)");
    if (typeof loadQueue === "function") loadQueue();
    loadDashboardStats();
  } catch (e) {
    showToast("Failed to queue downloads: " + e.message);
  } finally {
    downloadAllLangsBtn.disabled = false;
    downloadAllBtn.disabled = false;
    downloadSelectedBtn.disabled = false;
  }
}
