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
const searchGenreInput = document.getElementById("searchGenreInput");
const searchGenreOptions = document.getElementById("searchGenreOptions");
const searchYearFrom = document.getElementById("searchYearFrom");
const searchYearTo = document.getElementById("searchYearTo");
const searchSortBy = document.getElementById("searchSortBy");
const searchFavoritesOnly = document.getElementById("searchFavoritesOnly");
const searchDownloadedOnly = document.getElementById("searchDownloadedOnly");
const searchFilterSummary = document.getElementById("searchFilterSummary");
const resetSearchFiltersBtn = document.getElementById("resetSearchFiltersBtn");
const searchGenrePresetChips = document.getElementById(
  "searchGenrePresetChips",
);
const statsGrid = document.getElementById("statsGrid");
const statsDetailGrid = document.getElementById("statsDetailGrid");
const favoritesList = document.getElementById("favoritesList");
const activityList = document.getElementById("activityList");
const providerQualityList = document.getElementById("providerQualityList");
const activityChart = document.getElementById("activityChart");
const releaseList = document.getElementById("releaseList");
const favoriteToggleBtn = document.getElementById("favoriteToggleBtn");
const providerAvailability = document.getElementById("providerAvailability");
const modalPoster = document.getElementById("modalPoster");
const modalTitle = document.getElementById("modalTitle");
const modalGenres = document.getElementById("modalGenres");
const modalYear = document.getElementById("modalYear");
const modalDesc = document.getElementById("modalDesc");
const modalDescToggle = document.getElementById("modalDescToggle");
const modalSiteBadge = document.getElementById("modalSiteBadge");
const modalDetailsSource = document.getElementById("modalDetailsSource");
const modalDetailsYear = document.getElementById("modalDetailsYear");
const modalQuickStats = document.getElementById("modalQuickStats");
const modalSelectionSummary = document.getElementById("modalSelectionSummary");
const autoSyncLabel = autoSyncCheck
  ? autoSyncCheck.closest(".select-all-label") || autoSyncCheck.closest("label")
  : null;
const isHomePage = Boolean(
  searchInput &&
    searchBtn &&
    resultsDiv &&
    browseDiv,
);
const hasSeriesModalSurface = Boolean(
  overlay &&
    languageSelect &&
    providerSelect &&
    seasonAccordion &&
    statusBar &&
    downloadAllBtn &&
    downloadSelectedBtn,
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
let currentModalSite = null;
let modalLanguageOptions = null;
let autoSyncSupported = true;
let modalSeasonResults = [];
let modalAvailabilityItems = [];
let modalDescriptionExpanded = false;

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
let currentSearchResults = [];
const searchResultMetaCache = new Map();
const SEARCH_GENRE_PRESETS = {
  aniworld: [
    "Action",
    "Abenteuer",
    "Comedy",
    "Drama",
    "Fantasy",
    "Horror",
    "Mystery",
    "Romanze",
    "Sci-Fi",
    "Shounen",
    "Slice of Life",
    "Thriller",
  ],
  sto: [
    "Action",
    "Abenteuer",
    "Comedy",
    "Crime",
    "Drama",
    "Fantasy",
    "Horror",
    "Mystery",
    "Romantik",
    "Sci-Fi",
    "Thriller",
    "Western",
  ],
  filmpalast: [
    "Action",
    "Abenteuer",
    "Animation",
    "Comedy",
    "Drama",
    "Fantasy",
    "Horror",
    "Krimi",
    "Romanze",
    "Sci-Fi",
    "Thriller",
    "War",
  ],
};

// Custom paths select
const customPathSelect = document.getElementById("customPathSelect");
const experimentalConfig = window.ANIWORLD_EXPERIMENTAL || {};
const bootSettings = window.ANIWORLD_BOOT_SETTINGS || {};
const SITE_CONFIG = {
  aniworld: {
    label: "AniWorld",
    heading: "AniWorld",
    placeholder: {
      default: "Search for anime...",
      extended: "Search for anime or paste a FilmPalast movie URL...",
    },
    subheading: {
      default:
        "Search AniWorld titles, inspect seasons, and queue downloads from a cleaner control surface.",
      extended:
        "Search AniWorld titles, inspect seasons, and queue downloads. FilmPalast movie links can be pasted directly into search.",
    },
    providerPreference: ["VOE"],
    showRandom: true,
  },
  sto: {
    label: "SerienStream",
    heading: "SerienStream",
    placeholder: {
      default: "Search for series...",
      extended: "Search for series or paste a FilmPalast movie URL...",
    },
    subheading: {
      default:
        "Browse SerienStream titles, inspect seasons, and queue episodes from the same control surface.",
      extended:
        "Browse SerienStream titles, inspect seasons, and queue episodes. FilmPalast movie links can be pasted directly into search.",
    },
    providerPreference: ["VOE"],
    showRandom: false,
  },
  filmpalast: {
    label: "FilmPalast",
    heading: "FilmPalast Movie Downloader",
    placeholder: {
      default: "Search for movies on FilmPalast...",
      extended: "Search for movies on FilmPalast...",
    },
    subheading: {
      default:
        "Search FilmPalast movie titles and open them as direct movie downloads with the same queue workflow.",
      extended:
        "Search FilmPalast movie titles and open them as direct movie downloads with the same queue workflow.",
    },
    providerPreference: ["Vidhide", "Vidara", "VOE"],
    modalLanguages: ["German Dub"],
    showRandom: false,
    experimental: true,
  },
};
const DIRECT_URL_PATTERN = /^https?:\/\/(?:www\.)?(?:aniworld\.to\/anime\/stream\/|s\.to\/(?:serie\/)?(?:stream\/)?|serienstream\.to\/(?:serie\/)?(?:stream\/)?|filmpalast\.to\/stream\/)/i;
const DIRECT_URL_PATTERN_NO_FILMPALAST = /^https?:\/\/(?:www\.)?(?:aniworld\.to\/anime\/stream\/|s\.to\/(?:serie\/)?(?:stream\/)?|serienstream\.to\/(?:serie\/)?(?:stream\/)?)/i;
const SEARCH_DEFAULT_STATE = {
  genreInput: "",
  yearFrom: "",
  yearTo: "",
  sortBy: "source",
  favoritesOnly: false,
  downloadedOnly: false,
};
let configuredSearchDefaults = { ...SEARCH_DEFAULT_STATE };

function isFilmPalastEnabled() {
  return experimentalConfig.filmpalast === true;
}

function normalizeSite(site) {
  if (site === "sto") return "sto";
  if (site === "filmpalast" && isFilmPalastEnabled()) return "filmpalast";
  return "aniworld";
}

function getSiteConfig(site) {
  const normalized = normalizeSite(site);
  return SITE_CONFIG[normalized] || SITE_CONFIG.aniworld;
}

function getSiteText(site, key) {
  const config = getSiteConfig(site);
  const entry = config[key];
  if (!entry || typeof entry !== "object") {
    return entry;
  }
  return isFilmPalastEnabled() ? entry.extended : entry.default;
}

function getPreferredProviders(site) {
  return getSiteConfig(site).providerPreference || ["VOE"];
}

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
    updateModalSelectionState();
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

function parseServerDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(iso) ? iso : `${iso}Z`;
  const dt = new Date(normalized);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatStatDate(value) {
  if (!value) return "Never";
  const dt = parseServerDate(value);
  if (!dt) return value;
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
  const dt = parseServerDate(value);
  if (!dt) return value;
  return dt.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
}

function formatRelativeDate(value) {
  if (!value) return "Just now";
  const dt = parseServerDate(value);
  if (!dt) return value;
  const diffMs = Math.max(0, Date.now() - dt.getTime());
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} d ago`;
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function normalizeSearchFilterValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeSearchDefaultSortValue(value) {
  return ["source", "year-desc", "year-asc", "title-asc", "title-desc"].includes(
    value,
  )
    ? value
    : "source";
}

function readConfiguredSearchDefaults() {
  const defaults = bootSettings.searchDefaults || {};
  configuredSearchDefaults = {
    genreInput: String(defaults.genres || ""),
    yearFrom: String(defaults.yearFrom || ""),
    yearTo: String(defaults.yearTo || ""),
    sortBy: normalizeSearchDefaultSortValue(defaults.sort || "source"),
    favoritesOnly:
      defaults.favoritesOnly === true || defaults.favoritesOnly === "1",
    downloadedOnly:
      defaults.downloadedOnly === true || defaults.downloadedOnly === "1",
  };
}

function applyConfiguredSearchDefaults(updateResults = true) {
  if (searchGenreInput) searchGenreInput.value = configuredSearchDefaults.genreInput;
  if (searchYearFrom) searchYearFrom.value = configuredSearchDefaults.yearFrom;
  if (searchYearTo) searchYearTo.value = configuredSearchDefaults.yearTo;
  if (searchSortBy) {
    searchSortBy.value = configuredSearchDefaults.sortBy;
    if (window.refreshCustomSelect) window.refreshCustomSelect(searchSortBy);
  }
  if (searchFavoritesOnly) {
    searchFavoritesOnly.checked = configuredSearchDefaults.favoritesOnly;
  }
  if (searchDownloadedOnly) {
    searchDownloadedOnly.checked = configuredSearchDefaults.downloadedOnly;
  }
  renderPresetGenreChips();
  if (updateResults) applySearchFilters();
}

function parseGenreFilterTerms(value) {
  return String(value || "")
    .split(",")
    .map((item) => normalizeSearchFilterValue(item))
    .filter(Boolean);
}

function parseGenreFilterEntries(value) {
  return String(value || "")
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function parseYearFilterValue(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseReleaseYearBounds(value) {
  const years = (String(value || "").match(/\d{4}/g) || [])
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item));

  if (!years.length) {
    return { start: null, end: null };
  }

  return {
    start: Math.min(...years),
    end: Math.max(...years),
  };
}

function getSearchFilters() {
  return {
    genreTerms: parseGenreFilterTerms(searchGenreInput?.value),
    yearFrom: parseYearFilterValue(searchYearFrom?.value),
    yearTo: parseYearFilterValue(searchYearTo?.value),
    favoritesOnly: Boolean(searchFavoritesOnly?.checked),
    downloadedOnly: Boolean(searchDownloadedOnly?.checked),
    sortBy: searchSortBy?.value || "source",
  };
}

function hasActiveSearchFilters(filters = getSearchFilters()) {
  return Boolean(
      filters.genreTerms.length ||
      filters.yearFrom ||
      filters.yearTo ||
      filters.favoritesOnly ||
      filters.downloadedOnly,
  );
}

function getSearchResultMeta(result) {
  return result?.meta || searchResultMetaCache.get(result?.url) || null;
}

function matchesGenreFilter(meta, genreTerms) {
  if (!genreTerms.length) return true;
  const genres = (meta?.genres || []).map((genre) =>
    normalizeSearchFilterValue(genre),
  );
  return genreTerms.every((term) =>
    genres.some((genre) => genre.includes(term)),
  );
}

function matchesYearFilter(meta, yearFrom, yearTo) {
  if (!yearFrom && !yearTo) return true;
  const { start, end } = parseReleaseYearBounds(meta?.release_year);
  if (!start && !end) return false;
  const minYear = start || end;
  const maxYear = end || start;
  if (yearFrom && maxYear < yearFrom) return false;
  if (yearTo && minYear > yearTo) return false;
  return true;
}

function resultMatchesSearchFilters(result, filters = getSearchFilters()) {
  if (!hasActiveSearchFilters(filters)) return true;
  const meta = getSearchResultMeta(result);
  if (!meta) return true;
  if (filters.favoritesOnly && !meta.is_favorite) return false;
  if (filters.downloadedOnly && !isDownloaded(result.title)) return false;
  if (!matchesGenreFilter(meta, filters.genreTerms)) return false;
  if (!matchesYearFilter(meta, filters.yearFrom, filters.yearTo)) return false;
  return true;
}

function compareSearchResults(a, b, sortBy) {
  if (sortBy === "title-asc" || sortBy === "title-desc") {
    const direction = sortBy === "title-desc" ? -1 : 1;
    return (
      String(a.title || "").localeCompare(String(b.title || ""), undefined, {
        sensitivity: "base",
      }) * direction
    );
  }

  if (sortBy === "year-desc" || sortBy === "year-asc") {
    const direction = sortBy === "year-desc" ? -1 : 1;
    const aBounds = parseReleaseYearBounds(getSearchResultMeta(a)?.release_year);
    const bBounds = parseReleaseYearBounds(getSearchResultMeta(b)?.release_year);
    const aYear = aBounds.end || aBounds.start || 0;
    const bYear = bBounds.end || bBounds.start || 0;
    if (aYear !== bYear) return (aYear - bYear) * direction;
  }

  return (a.originalIndex || 0) - (b.originalIndex || 0);
}

function setGenreFilterEntries(entries) {
  if (!searchGenreInput) return;
  const normalizedEntries = [];
  const seen = new Set();

  entries.forEach((entry) => {
    const cleanEntry = String(entry || "").trim();
    const normalizedEntry = normalizeSearchFilterValue(cleanEntry);
    if (!normalizedEntry || seen.has(normalizedEntry)) return;
    seen.add(normalizedEntry);
    normalizedEntries.push(cleanEntry);
  });

  searchGenreInput.value = normalizedEntries.join(", ");
}

function getPresetGenresForCurrentSite() {
  const siteKey = normalizeSite(currentSite);
  const presetGenres = SEARCH_GENRE_PRESETS[siteKey] || SEARCH_GENRE_PRESETS.aniworld;
  const mergedGenres = [...presetGenres];
  const seen = new Set(mergedGenres.map((genre) => normalizeSearchFilterValue(genre)));

  currentSearchResults.forEach((result) => {
    const meta = getSearchResultMeta(result);
    (meta?.genres || []).forEach((genre) => {
      const cleanGenre = String(genre || "").trim();
      const normalizedGenre = normalizeSearchFilterValue(cleanGenre);
      if (!normalizedGenre || seen.has(normalizedGenre)) return;
      seen.add(normalizedGenre);
      mergedGenres.push(cleanGenre);
    });
  });

  return mergedGenres.slice(0, 18);
}

function togglePresetGenre(genre) {
  const selectedGenres = parseGenreFilterEntries(searchGenreInput?.value);
  const normalizedGenre = normalizeSearchFilterValue(genre);
  const nextGenres = selectedGenres.filter(
    (entry) => normalizeSearchFilterValue(entry) !== normalizedGenre,
  );

  if (nextGenres.length === selectedGenres.length) {
    nextGenres.push(genre);
  }

  setGenreFilterEntries(nextGenres);
  applySearchFilters();
}

function renderPresetGenreChips() {
  if (!searchGenrePresetChips) return;
  const activeGenres = new Set(parseGenreFilterTerms(searchGenreInput?.value));
  const presetGenres = getPresetGenresForCurrentSite();

  searchGenrePresetChips.replaceChildren(
    ...presetGenres.map((genre) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-preset-genre-chip";
      if (activeGenres.has(normalizeSearchFilterValue(genre))) {
        button.classList.add("active");
      }
      button.textContent = genre;
      button.addEventListener("click", () => togglePresetGenre(genre));
      return button;
    }),
  );
}

function updateSearchGenreOptions() {
  if (!searchGenreOptions) return;
  const genreValues = new Set();
  currentSearchResults.forEach((result) => {
    const meta = getSearchResultMeta(result);
    (meta?.genres || []).forEach((genre) => {
      const value = String(genre || "").trim();
      if (value) genreValues.add(value);
    });
  });

  searchGenreOptions.replaceChildren(
    ...Array.from(genreValues)
      .sort((a, b) => a.localeCompare(b))
      .map((genre) => {
        const option = document.createElement("option");
        option.value = genre;
        return option;
      }),
  );
}

function updateSearchFilterSummary(filters = getSearchFilters()) {
  if (!searchFilterSummary) return;
  const total = currentSearchResults.length;
  if (!total) {
    searchFilterSummary.textContent = "";
    searchFilterSummary.classList.remove("is-empty");
    return;
  }

  const visible = currentSearchResults.filter(
    (result) => result.card && result.card.style.display !== "none",
  ).length;

  if (!hasActiveSearchFilters(filters)) {
    searchFilterSummary.textContent = `${total} results`;
    searchFilterSummary.classList.remove("is-empty");
    return;
  }

  if (!visible) {
    searchFilterSummary.textContent = "No matches for the current filters.";
    searchFilterSummary.classList.add("is-empty");
    return;
  }

  searchFilterSummary.textContent = `${visible} / ${total} results match the filters`;
  searchFilterSummary.classList.remove("is-empty");
}

function applySearchFilters() {
  const filters = getSearchFilters();
  currentSearchResults.forEach((result) => {
    if (!result.card) return;
    result.card.style.display = resultMatchesSearchFilters(result, filters)
      ? ""
      : "none";
  });

  const orderedResults = currentSearchResults
    .slice()
    .sort((a, b) => compareSearchResults(a, b, filters.sortBy));
  orderedResults.forEach((result) => {
    if (result.card) resultsDiv.appendChild(result.card);
  });
  renderPresetGenreChips();
  updateSearchFilterSummary(filters);
}

function resetSearchFilters() {
  applyConfiguredSearchDefaults();
}

function getSiteKeyFromUrl(url) {
  const value = (url || "").toLowerCase();
  if (value.includes("filmpalast.to")) return "filmpalast";
  if (value.includes("s.to") || value.includes("serienstream.to")) return "sto";
  return "aniworld";
}

function getSiteLabel(site) {
  return getSiteConfig(site).label;
}

function getSearchPlaceholder(site) {
  return getSiteText(site, "placeholder");
}

function getPageHeading(site) {
  return getSiteConfig(site).heading;
}

function getPageSubheading(site) {
  return getSiteText(site, "subheading");
}

const MODAL_LANGUAGE_FLAGS = {
  "German Dub": {
    icon: "🇩🇪",
    shortLabel: "German Dub",
    className: "flag-de",
  },
  "German Sub": {
    icon: "🇯🇵🇩🇪",
    shortLabel: "German Sub",
    className: "flag-de-sub",
  },
  "English Dub": {
    icon: "🇬🇧",
    shortLabel: "English Dub",
    className: "flag-en",
  },
  "English Sub": {
    icon: "🇯🇵🇬🇧",
    shortLabel: "English Sub",
    className: "flag-en-sub",
  },
};

function renderModalGenres(genres) {
  if (!modalGenres) return;
  const list = Array.isArray(genres)
    ? genres.filter(Boolean)
    : genres
      ? [genres]
      : [];
  modalGenres.innerHTML = list
    .map(
      (genre) => `<span class="modal-genre-pill">${esc(String(genre))}</span>`,
    )
    .join("");
}

function renderModalDescription(text) {
  if (!modalDesc) return;
  const value = String(text || "").trim();
  const wrap = modalDesc.parentElement;
  modalDesc.dataset.fullText = value;
  modalDesc.textContent = value;
  if (wrap) {
    wrap.hidden = !value;
  }

  if (!modalDescToggle) return;

  const canExpand = value.length > 240;
  if (!canExpand) {
    modalDescriptionExpanded = false;
  }
  modalDesc.classList.toggle("is-collapsed", canExpand && !modalDescriptionExpanded);
  modalDesc.classList.toggle("is-expanded", !canExpand || modalDescriptionExpanded);
  modalDescToggle.hidden = !canExpand;
  modalDescToggle.textContent = modalDescriptionExpanded
    ? "Show Less"
    : "Show More";
}

function toggleModalDescription() {
  modalDescriptionExpanded = !modalDescriptionExpanded;
  renderModalDescription(modalDesc?.dataset.fullText || "");
}

function getModalEpisodeCheckboxes() {
  return Array.from(
    seasonAccordion?.querySelectorAll(".episode-selector") || [],
  );
}

function getModalEpisodeStats() {
  const uniqueLanguages = new Set();
  let totalEpisodes = 0;
  let downloadedEpisodes = 0;

  modalSeasonResults.forEach(({ episodes }) => {
    totalEpisodes += episodes.length;
    episodes.forEach((episode) => {
      if (episode.downloaded) {
        downloadedEpisodes += 1;
      }
      (episode.languages || []).forEach((label) => uniqueLanguages.add(label));
    });
  });

  return {
    seasonCount: modalSeasonResults.length,
    totalEpisodes,
    downloadedEpisodes,
    selectedEpisodes: getSelectedEpisodeUrls().length,
    languageCount: uniqueLanguages.size,
    isMovieCollection: modalSeasonResults.some(({ season }) => season?.are_movies),
  };
}

function renderModalQuickStats() {
  if (!modalQuickStats) return;

  const stats = getModalEpisodeStats();
  const readyHosts = modalAvailabilityItems.filter(
    (item) => item && item.supported !== false,
  ).length;
  const items = [
    {
      label: stats.isMovieCollection ? "Collections" : "Seasons",
      value: formatStatNumber(stats.seasonCount),
    },
    {
      label: stats.isMovieCollection ? "Entries" : "Episodes",
      value: formatStatNumber(stats.totalEpisodes),
    },
    {
      label: "On Disk",
      value: formatStatNumber(stats.downloadedEpisodes),
    },
  ];
  if (readyHosts > 0) {
    items.push({
      label: "Ready Hosts",
      value: formatStatNumber(readyHosts),
    });
  }

  modalQuickStats.innerHTML = items
    .map(
      (item) => `
        <div class="modal-quick-stat">
          <span class="modal-quick-stat-value">${esc(item.value)}</span>
          <span class="modal-quick-stat-label">${esc(item.label)}</span>
        </div>
      `,
    )
    .join("");
}

function renderEpisodeLanguageFlags(labels) {
  if (!Array.isArray(labels) || !labels.length) return "";
  return `
    <div class="episode-language-flags">
      ${Array.from(new Set(labels))
        .map((label) => {
          const meta = MODAL_LANGUAGE_FLAGS[label] || {
            icon: "🌐",
            shortLabel: label,
            className: "flag-generic",
          };
          return `
            <span
              class="episode-language-flag ${esc(meta.className)}"
              title="${esc(label)}"
              aria-label="${esc(label)}"
            >
              <span class="episode-language-icon">${meta.icon}</span>
            </span>
          `;
        })
        .join("")}
    </div>
  `;
}

function updateSeasonSelectionState() {
  seasonAccordion?.querySelectorAll(".season-section").forEach((section) => {
    const checkboxes = Array.from(
      section.querySelectorAll(".episode-selector"),
    );
    const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
    const selectedBadge = section.querySelector("[data-season-selected-count]");
    const seasonToggle = section.querySelector(".season-all-label input");
    if (selectedBadge) {
      selectedBadge.textContent = selectedCount
        ? `${selectedCount} selected`
        : "None selected";
    }
    if (seasonToggle) {
      seasonToggle.checked =
        checkboxes.length > 0 && selectedCount === checkboxes.length;
    }
  });
}

function updateModalSelectionState() {
  const all = getModalEpisodeCheckboxes();
  const checked = all.filter((checkbox) => checkbox.checked);
  if (selectAllCb) {
    selectAllCb.checked = all.length > 0 && all.length === checked.length;
  }

  updateSeasonSelectionState();
  renderModalQuickStats();

  if (downloadSelectedBtn && !downloadSelectedBtn.dataset.busy) {
    downloadSelectedBtn.disabled = checked.length === 0 || providerSelect.disabled;
  }
  if (downloadAllBtn && !downloadAllBtn.dataset.busy) {
    downloadAllBtn.disabled = all.length === 0 || providerSelect.disabled;
  }
  if (downloadAllLangsBtn && !downloadAllLangsBtn.dataset.busy) {
    downloadAllLangsBtn.disabled = all.length === 0 || providerSelect.disabled;
  }

  if (!modalSelectionSummary) return;

  const total = all.length;
  const selected = checked.length;
  const currentPathLabel =
    customPathSelect?.selectedOptions?.[0]?.textContent?.trim() || "Default";
  const providerLabel = providerSelect?.value || "Provider";
  const languageLabel = languageSelect?.value || "Language";

  modalSelectionSummary.innerHTML = `
    <span class="modal-selection-kicker">Ready To Queue</span>
    <strong>${selected} of ${total} ${total === 1 ? "entry" : "episodes"} selected</strong>
    <span class="modal-selection-meta">${esc(languageLabel)} · ${esc(providerLabel)} · ${esc(currentPathLabel)}</span>
  `;
}

function updateSiteButtons() {
  document.querySelectorAll(".site-switch-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.site === currentSite);
  });
}

function syncDownloadAllLangsVisibility() {
  if (!downloadAllLangsBtn) return;
  const languageCount = availableProviders
    ? Object.keys(availableProviders).length
    : 0;
  downloadAllLangsBtn.style.display =
    langSeparationEnabled && languageCount > 1 ? "" : "none";
}

function renderProviderAvailability(items) {
  if (!providerAvailability) return;
  modalAvailabilityItems = Array.isArray(items) ? items : [];
  if (!items || !items.length) {
    providerAvailability.innerHTML = "";
    providerAvailability.classList.remove("is-visible");
    renderModalQuickStats();
    return;
  }

  providerAvailability.innerHTML = `
    <span class="provider-availability-title">Available For This Source</span>
    <div class="provider-availability-list">
      ${items
        .map((item) => {
          const ready = item.supported !== false;
          return `
            <div class="provider-chip ${ready ? "provider-chip-ready" : "provider-chip-detected"}">
              <span class="provider-chip-name">${esc(item.name || "Unknown")}</span>
              <span class="provider-chip-state">${ready ? "Ready" : "Detected"}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
  providerAvailability.classList.add("is-visible");
  renderModalQuickStats();
}

function syncAutoSyncAvailability() {
  if (!autoSyncCheck) return;
  autoSyncCheck.disabled = !autoSyncSupported;
  if (!autoSyncSupported) {
    autoSyncCheck.checked = false;
  }
  if (autoSyncLabel) {
    autoSyncLabel.style.display = autoSyncSupported ? "" : "none";
  }
}

function syncHomeSiteFromSource(site) {
  if (!isHomePage) return;
  setSite(normalizeSite(site), false);
}

function isDirectSeriesUrl(keyword) {
  const pattern = isFilmPalastEnabled()
    ? DIRECT_URL_PATTERN
    : DIRECT_URL_PATTERN_NO_FILMPALAST;
  return pattern.test(keyword);
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

function syncSearchResultFavoriteState(seriesUrl, isFavorite) {
  if (!seriesUrl) return;
  const result = currentSearchResults.find((entry) => entry.url === seriesUrl);
  if (!result) return;
  const meta = {
    ...(getSearchResultMeta(result) || {}),
    is_favorite: Boolean(isFavorite),
  };
  result.meta = meta;
  searchResultMetaCache.set(seriesUrl, meta);
  renderSearchResultMeta(result);
  applySearchFilters();
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
      const siteLabel = getSiteLabel(
        item.site || getSiteKeyFromUrl(item.series_url),
      );
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

function parseActivityErrors(value) {
  if (!value) return [];
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch (e) {
    return [];
  }
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
      const errors = parseActivityErrors(item.errors);
      const retryBtn =
        item.status === "failed" || item.status === "cancelled"
          ? `<button class="btn-secondary btn-small" onclick="retryQueueItemFromDashboard(${item.id})">Retry</button>`
          : "";
      const deleteBtn = isTimelinePage
        ? `<button class="btn-secondary btn-small btn-danger-soft" onclick="deleteHistoryItem(${item.id})">Delete</button>`
        : "";
      const errorHtml = errors.length
        ? `<div class="activity-error-list">${errors
            .slice(0, 2)
            .map((err) => {
              const providers = Array.isArray(err.providers_tried) && err.providers_tried.length
                ? ` · Tried: ${err.providers_tried.join(", ")}`
                : "";
              return `<div class="activity-error-item">${esc(err.error || "Unknown error")}${esc(providers)}</div>`;
            })
            .join("")}</div>`
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
          ${errorHtml}
          ${
            retryBtn || deleteBtn
              ? `<div class="activity-actions">${retryBtn}${deleteBtn}</div>`
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
  const chips = items
    .map(
      (item) =>
        `<button class="search-hint-chip" type="button" data-keyword="${encodeURIComponent(
          item.keyword,
        )}" onclick="applySearchSuggestion(decodeURIComponent(this.dataset.keyword))">${esc(item.keyword)}</button>`,
    )
    .join("");
  searchHints.innerHTML =
    '<div class="search-hints-caption">Search History</div>' +
    '<div class="search-hints-note">Your recent searches for this source are shown below.</div>' +
    chips;
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
  if (!hasSeriesModalSurface) {
    const target = new URL("/", window.location.href);
    target.searchParams.set("openSeries", url);
    window.location.href = target.toString();
    return;
  }
  syncHomeSiteFromSource(getSiteKeyFromUrl(url));
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
      syncSearchResultFavoriteState(currentSeriesUrl, false);
      showToast("Removed from favorites");
    } else {
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: currentSeriesTitle,
          series_url: currentSeriesUrl,
          poster_url: document.getElementById("modalPoster").src || "",
          site: getSiteKeyFromUrl(currentSeriesUrl),
        }),
      });
      favoriteMap.set(currentSeriesUrl, {
        title: currentSeriesTitle,
        series_url: currentSeriesUrl,
        poster_url: modalPoster?.src || "",
        site: getSiteKeyFromUrl(currentSeriesUrl),
      });
      syncSearchResultFavoriteState(currentSeriesUrl, true);
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

async function deleteHistoryItem(id) {
  try {
    const resp = await fetch("/api/history/" + id, { method: "DELETE" });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      showToast(data.error || "Delete failed");
      return;
    }
    showToast("History item deleted");
    if (isTimelinePage) {
      loadTimelinePage();
    } else {
      loadDashboard();
    }
  } catch (e) {
    showToast("Delete failed");
  }
}

async function retryFailedFromDashboard() {
  if (typeof retryFailedQueueItems === "function") {
    await retryFailedQueueItems();
    return;
  }
  try {
    const resp = await fetch("/api/queue/retry-failed", { method: "POST" });
    const data = await resp.json();
    showToast(
      data.created
        ? "Re-queued " + data.created + " failed item(s)"
        : "No failed items to retry",
    );
    loadDashboardStats();
    if (isTimelinePage) loadTimelinePage();
  } catch (e) {
    showToast("Retry failed");
  }
}

async function clearFinishedFromDashboard() {
  if (typeof clearFinishedQueueItems === "function") {
    await clearFinishedQueueItems();
    return;
  }
  try {
    await fetch("/api/queue/completed", { method: "DELETE" });
    showToast("Finished items cleared");
    loadDashboardStats();
    if (isTimelinePage) loadTimelinePage();
  } catch (e) {
    showToast("Failed to clear finished items");
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
  if (!hasSeriesModalSurface) return;
  const params = new URLSearchParams(window.location.search);
  const url = params.get("openSeries");
  if (!url) return;
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("openSeries");
  window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search);

  syncHomeSiteFromSource(getSiteKeyFromUrl(url));
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
  if (currentSite === "filmpalast") {
    browseDiv.style.display = "none";
    newAnimesSection.style.display = "none";
    popularAnimesSection.style.display = "none";
    newSeriesSection.style.display = "none";
    popularSeriesSection.style.display = "none";
    return;
  }
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

function setSite(site, persist = true) {
  if (!isHomePage) return;
  const nextSite = normalizeSite(site);
  const nextSiteConfig = getSiteConfig(nextSite);
  currentSite = nextSite;
  currentModalSite = null;
  modalLanguageOptions = null;
  if (persist) {
    localStorage.setItem("selectedSite", currentSite);
  }
  updateSiteButtons();

  // Update heading
  const heading = document.getElementById("pageHeading");
  if (heading) {
    heading.textContent = getPageHeading(currentSite);
  }
  if (pageSubheading) {
    pageSubheading.textContent = getPageSubheading(currentSite);
  }

  // Update search placeholder
  searchInput.placeholder = getSearchPlaceholder(currentSite);

  // Clear search results
  resultsDiv.innerHTML = "";
  searchInput.value = "";
  currentSearchResults = [];

  // Toggle browse sections per site
  showBrowseSections();

  // Toggle Random button
  randomBtn.style.display = nextSiteConfig.showRandom ? "" : "none";

  // Update language dropdown
  rebuildLanguageSelect();

  // Reset providers
  availableProviders = null;
  updateSearchGenreOptions();
  renderPresetGenreChips();
  updateSearchFilterSummary();
  loadSearchSuggestions("");
}

window.setSite = setSite;

function rebuildLanguageSelect() {
  if (!languageSelect) return;
  const activeSite = currentModalSite || currentSite;
  const activeSiteConfig = getSiteConfig(activeSite);
  const isFilmPalast = activeSite === "filmpalast";
  const langs =
    activeSite === "sto"
      ? window.STO_LANGS || {}
      : isFilmPalast
        ? { german_dub: "German Dub" }
        : window.ANIWORLD_LANGS || {};
  const allowAllLanguages = langSeparationEnabled && !isFilmPalast;
  languageSelect.innerHTML = "";

  if (allowAllLanguages) {
    const opt = document.createElement("option");
    opt.value = "All Languages";
    opt.textContent = "All Languages";
    languageSelect.appendChild(opt);
  }

  const preferredModalLanguages =
    modalLanguageOptions ||
    (activeSiteConfig.modalLanguages && activeSiteConfig.modalLanguages.length
      ? activeSiteConfig.modalLanguages
      : null);

  if (preferredModalLanguages && preferredModalLanguages.length) {
    preferredModalLanguages.forEach((label) => {
      const opt = document.createElement("option");
      opt.value = label;
      opt.textContent = label;
      languageSelect.appendChild(opt);
    });
  } else {
    for (const label of Object.values(langs)) {
      const opt = document.createElement("option");
      opt.value = label;
      opt.textContent = label;
      languageSelect.appendChild(opt);
    }
  }
  if (window.refreshCustomSelect) window.refreshCustomSelect(languageSelect);
}

// Restore site toggle state from localStorage
(function syncSiteToggle() {
  if (!isHomePage) return;
  readConfiguredSearchDefaults();
  const saved = localStorage.getItem("selectedSite");
  setSite(normalizeSite(saved || "aniworld"), false);
  applyConfiguredSearchDefaults(false);
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
      currentSearchResults = [];
      updateSearchGenreOptions();
      renderPresetGenreChips();
      updateSearchFilterSummary();
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

[
  searchGenreInput,
  searchYearFrom,
  searchYearTo,
  searchSortBy,
].forEach((element) => {
  if (element) {
    element.addEventListener("input", applySearchFilters);
    element.addEventListener("change", applySearchFilters);
  }
});

if (searchFavoritesOnly) {
  searchFavoritesOnly.addEventListener("change", applySearchFilters);
}

if (searchDownloadedOnly) {
  searchDownloadedOnly.addEventListener("change", applySearchFilters);
}

if (resetSearchFiltersBtn) {
  resetSearchFiltersBtn.addEventListener("click", resetSearchFilters);
}

if (languageSelect) {
  languageSelect.addEventListener("change", updateProviderDropdown);
}

if (providerSelect) {
  providerSelect.addEventListener("change", updateModalSelectionState);
}

if (customPathSelect) {
  customPathSelect.addEventListener("change", updateModalSelectionState);
}

if (modalDescToggle) {
  modalDescToggle.addEventListener("click", toggleModalDescription);
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
  loadSearchSuggestions("");
}
if (hasSeriesModalSurface) {
  autoOpenSeriesFromQuery();
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
  if (currentSite !== "aniworld") {
    showToast("Random is only available for AniWorld");
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
  currentSearchResults = [];
  updateSearchGenreOptions();
  updateSearchFilterSummary();

  if (!results.length) {
    resultsDiv.innerHTML =
      '<div style="width:100%;text-align:center;color:#888;padding:40px">No results found.</div>';
    return;
  }

  currentSearchResults = results.map((result, index) => ({
    ...result,
    originalIndex: index,
    meta: searchResultMetaCache.get(result.url) || null,
    card: null,
  }));

  currentSearchResults.forEach((result) => {
    const card = document.createElement("div");
    card.className = "card";
    card.onclick = () => openSeries(result.url);
    const posterUrl = result.poster_url ? esc(result.poster_url) : "";
    card.innerHTML =
      `<img src="${posterUrl}" alt="" data-url="${esc(result.url)}">` +
      `<div class="info">` +
      `<div class="title">${esc(result.title)}</div>` +
      `<div class="search-card-meta" hidden></div>` +
      `<div class="search-card-tags" hidden></div>` +
      `</div>`;
    addDownloadedBadge(card, result.title);
    resultsDiv.appendChild(card);
    result.card = card;
    renderSearchResultMeta(result);
    hydrateSearchResultMeta(result);
  });

  applySearchFilters();
}

function renderSearchResultMeta(result) {
  const card = result.card;
  const meta = getSearchResultMeta(result);
  if (!card || !meta) return;

  const image = card.querySelector("img");
  if (image && meta.poster_url) {
    image.src = meta.poster_url;
  }

  const metaRow = card.querySelector(".search-card-meta");
  if (metaRow) {
    metaRow.textContent = String(meta.release_year || "").trim();
    metaRow.hidden = !metaRow.textContent;
  }

  const tagsRow = card.querySelector(".search-card-tags");
  if (!tagsRow) return;

  const chips = [];
  if (meta.is_favorite) {
    chips.push(
      '<span class="search-card-chip search-card-chip-favorite">Favorite</span>',
    );
  }
  (meta.genres || [])
    .filter(Boolean)
    .slice(0, 3)
    .forEach((genre) => {
      chips.push(`<span class="search-card-chip">${esc(String(genre))}</span>`);
    });

  tagsRow.innerHTML = chips.join("");
  tagsRow.hidden = chips.length === 0;
}

async function hydrateSearchResultMeta(result) {
  if (!result?.url) return;
  const cached = searchResultMetaCache.get(result.url);
  if (cached) {
    result.meta = cached;
    renderSearchResultMeta(result);
    updateSearchGenreOptions();
    applySearchFilters();
    return;
  }

  try {
    const resp = await fetch(
      "/api/series?url=" + encodeURIComponent(result.url),
    );
    const data = await resp.json();
    result.meta = {
      poster_url: data.poster_url || result.poster_url || "",
      genres: Array.isArray(data.genres) ? data.genres : [],
      release_year: String(data.release_year || "").trim(),
      is_favorite: Boolean(data.is_favorite),
    };
  } catch (e) {
    result.meta = {
      poster_url: result.poster_url || "",
      genres: [],
      release_year: "",
      is_favorite: false,
    };
  }

  searchResultMetaCache.set(result.url, result.meta);
  renderSearchResultMeta(result);
  updateSearchGenreOptions();
  applySearchFilters();
}

async function openSeries(url) {
  if (!hasSeriesModalSurface) return;
  const sourceSite = getSiteKeyFromUrl(url);
  const sourceSiteConfig = getSiteConfig(sourceSite);
  if (sourceSite === "filmpalast" && !isFilmPalastEnabled()) {
    showToast(
      "FilmPalast ist aktuell ausgeblendet. Du kannst es unter Settings > Entwicklungsumgebung wieder aktivieren.",
    );
    return;
  }
  overlay.style.display = "block";
  if (modalPoster) modalPoster.src = "";
  if (modalTitle) modalTitle.textContent = "Loading...";
  renderModalGenres([]);
  if (modalYear) modalYear.textContent = "";
  if (modalDetailsYear) modalDetailsYear.textContent = "";
  if (modalSiteBadge) modalSiteBadge.textContent = getSiteLabel(sourceSite);
  if (modalDetailsSource) modalDetailsSource.textContent = getSiteLabel(sourceSite);
  modalDescriptionExpanded = false;
  renderModalDescription("");
  seasonAccordion.innerHTML = "";
  statusBar.classList.remove("active");
  availableProviders = null;
  currentModalSite = sourceSite;
  modalLanguageOptions = sourceSiteConfig.modalLanguages || null;
  autoSyncSupported = currentModalSite !== "filmpalast";
  currentSeriesUrl = url;
  currentSeriesTitle = "";
  modalSeasonResults = [];
  updateFavoriteButton(false);
  renderProviderAvailability([]);
  syncAutoSyncAvailability();
  updateModalSelectionState();
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
    if (modalTitle) modalTitle.textContent = currentSeriesTitle;
    if (seriesData.poster_url && modalPoster) modalPoster.src = seriesData.poster_url;
    renderModalGenres(seriesData.genres || []);
    if (modalYear) modalYear.textContent = seriesData.release_year || "";
    if (modalDetailsYear) modalDetailsYear.textContent = seriesData.release_year || "Unknown";
    renderModalDescription(seriesData.description || "");
    if (seriesData.is_favorite) {
      favoriteMap.set(currentSeriesUrl, {
        title: currentSeriesTitle,
        series_url: currentSeriesUrl,
        poster_url: seriesData.poster_url || "",
        site: sourceSite,
      });
    } else {
      favoriteMap.delete(currentSeriesUrl);
    }
    syncSearchResultFavoriteState(currentSeriesUrl, !!seriesData.is_favorite);
    updateFavoriteButton(!!seriesData.is_favorite);
    autoSyncSupported = seriesData.auto_sync_supported !== false;
    syncAutoSyncAvailability();

    currentSeasons = seasonsData.seasons || [];
    buildAccordion(currentSeasons);

    // Check if auto-sync exists for this series
    if (autoSyncCheck && autoSyncSupported) {
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
  modalSeasonResults = [];
  updateModalSelectionState();

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
    modalSeasonResults = results.map(({ index, episodes }) => ({
      season: seasons[index],
      episodes,
    }));

    results.forEach(({ index, episodes }) => {
      const season = seasons[index];
      const section = document.createElement("div");
      section.className = "season-section";
      section.dataset.seasonIndex = index;

      const title = season.are_movies
        ? episodes.length === 1
          ? "Movie"
          : "Movies"
        : `Season ${season.season_number}`;
      const downloadedCount = episodes.filter((episode) => episode.downloaded).length;
      const uniqueLanguages = Array.from(
        new Set(episodes.flatMap((episode) => episode.languages || [])),
      );
      const compactMeta = [
        `${formatStatNumber(episodes.length)} ${episodes.length === 1 ? "entry" : "episodes"}`,
      ];
      if (uniqueLanguages.length) {
        compactMeta.push(
          `${formatStatNumber(uniqueLanguages.length)} ${uniqueLanguages.length === 1 ? "language" : "languages"}`,
        );
      }
      if (downloadedCount) {
        compactMeta.push(`${formatStatNumber(downloadedCount)} on disk`);
      }
      const header = document.createElement("div");
      header.className = "season-header" + (index === 0 ? " expanded" : "");
      header.innerHTML = `
        <div class="season-label">
          <span class="season-arrow">&#9654;</span>
          <div class="season-label-stack">
            <span class="season-title">${esc(title)}</span>
            <span class="season-subline">${esc(compactMeta.join(" · "))}</span>
          </div>
        </div>
      `;
      header.addEventListener("click", () => toggleSeason(index));

      // Body
      const body = document.createElement("div");
      body.className = "season-body" + (index === 0 ? " expanded" : "");
      body.id = "seasonBody-" + index;
      body.innerHTML = `
        <div class="season-toolbar">
          <div class="season-toolbar-meta">
            <span class="season-selected-count" data-season-selected-count>None selected</span>
          </div>
          <label class="season-all-label" onclick="event.stopPropagation()">
            <input type="checkbox" onchange="toggleSeasonAll(this, ${index})">
            Select season
          </label>
        </div>
      `;

      episodes.forEach((ep, episodeIndex) => {
        const div = document.createElement("div");
        div.className = "episode-item";
        const primaryTitle =
          ep.title_de || ep.title_en || `${season.are_movies ? "Movie" : "Episode"} ${ep.episode_number || episodeIndex + 1}`;
        const secondaryTitle =
          ep.title_en && ep.title_en !== ep.title_de ? ep.title_en : "";
        const episodeLabel = season.are_movies
          ? `M${ep.episode_number || episodeIndex + 1}`
          : `E${ep.episode_number}`;
        const stateChip = ep.downloaded
          ? '<span class="episode-state-chip is-downloaded">Downloaded</span>'
          : '<span class="episode-state-chip">Available</span>';
        div.innerHTML = `
          <label class="episode-checkbox" aria-label="Select ${esc(primaryTitle)}">
            <input
              class="episode-selector"
              type="checkbox"
              value="${esc(ep.url)}"
              data-season="${index}"
              onchange="syncSelectAll()"
            >
          </label>
          <div class="episode-main">
            <div class="episode-topline">
              <span class="ep-num">${esc(episodeLabel)}</span>
              <div class="episode-title-stack">
                <span class="ep-title">${esc(primaryTitle)}</span>
                ${
                  secondaryTitle
                    ? `<span class="ep-subtitle">${esc(secondaryTitle)}</span>`
                    : ""
                }
              </div>
            </div>
            <div class="episode-meta-row">
              ${renderEpisodeLanguageFlags(ep.languages || [])}
              ${stateChip}
            </div>
          </div>
        `;
        body.appendChild(div);
      });

      if (!firstProviderUrl && episodes.length) {
        firstProviderUrl = episodes[0].url;
      }

      section.appendChild(header);
      section.appendChild(body);
      seasonAccordion.appendChild(section);
    });

    if (!seasonAccordion.children.length) {
      seasonAccordion.innerHTML =
        '<div class="episode-empty-state">No episodes available for this source yet.</div>';
    }

    updateModalSelectionState();

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
  const willExpand = !header.classList.contains("expanded");
  seasonAccordion.querySelectorAll(".season-section").forEach((entry) => {
    entry.querySelector(".season-header")?.classList.remove("expanded");
    entry.querySelector(".season-body")?.classList.remove("expanded");
  });
  if (willExpand) {
    header.classList.add("expanded");
    body.classList.add("expanded");
  }
}

function toggleSeasonAll(checkbox, seasonIndex) {
  const body = document.getElementById("seasonBody-" + seasonIndex);
  if (!body) return;
  body
    .querySelectorAll(".episode-selector")
    .forEach((cb) => (cb.checked = checkbox.checked));
  syncSelectAll();
}

function toggleSelectAll() {
  const checked = selectAllCb.checked;
  getModalEpisodeCheckboxes().forEach((checkbox) => {
    checkbox.checked = checked;
  });
  updateModalSelectionState();
}

function syncSelectAll() {
  updateModalSelectionState();
}

function getAllEpisodeUrls() {
  return getModalEpisodeCheckboxes().map((checkbox) => checkbox.value);
}

function getSelectedEpisodeUrls() {
  return getModalEpisodeCheckboxes()
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);
}

async function fetchProviders(episodeUrl) {
  try {
    const resp = await fetch(
      "/api/providers?url=" + encodeURIComponent(episodeUrl),
    );
    const data = await resp.json();
    if (data.providers) {
      availableProviders = data.providers;
      renderProviderAvailability(data.availability || []);
      const hasSupportedProviders = Object.values(availableProviders).some(
        (providers) => Array.isArray(providers) && providers.length,
      );
      if (Array.isArray(data.languages) && data.languages.length) {
        modalLanguageOptions = data.languages;
        rebuildLanguageSelect();
      }
      if (
        data.default_language &&
        Array.from(languageSelect.options).some(
          (option) => option.value === data.default_language,
        )
      ) {
        languageSelect.value = data.default_language;
        if (window.refreshCustomSelect) window.refreshCustomSelect(languageSelect);
      }
      syncDownloadAllLangsVisibility();
      if (hasSupportedProviders) {
        providerSelect.disabled = false;
        downloadAllBtn.disabled = false;
        downloadSelectedBtn.disabled = false;
        updateProviderDropdown();
      } else {
        providerSelect.disabled = true;
        providerSelect.innerHTML =
          '<option value="">No supported providers available</option>';
        if (window.refreshCustomSelect) window.refreshCustomSelect(providerSelect);
        downloadAllBtn.disabled = true;
        downloadSelectedBtn.disabled = true;
        if (downloadAllLangsBtn) downloadAllLangsBtn.disabled = true;
      }
      updateModalSelectionState();
    }
  } catch (e) {
    // If provider fetch fails, keep the static list
  }
}

function resetProviderDropdown() {
  providerSelect.disabled = false;
  downloadAllBtn.disabled = false;
  downloadSelectedBtn.disabled = false;
  if (downloadAllLangsBtn) downloadAllLangsBtn.disabled = false;
  providerSelect.innerHTML = "";
  staticProviders.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    providerSelect.appendChild(opt);
  });
  selectDefaultProvider();
  syncDownloadAllLangsVisibility();
  if (window.refreshCustomSelect) window.refreshCustomSelect(providerSelect);
  updateModalSelectionState();
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
  updateModalSelectionState();
}

function selectDefaultProvider() {
  const preferredProviders = getPreferredProviders(currentModalSite || currentSite);

  for (const preferred of preferredProviders) {
    for (const opt of providerSelect.options) {
      if (opt.value === preferred) {
        providerSelect.value = preferred;
        return;
      }
    }
  }

  if (providerSelect.options.length) {
    providerSelect.selectedIndex = 0;
  }
}

function pickBatchProvider(providers) {
  const preferredProviders = getPreferredProviders(currentModalSite || currentSite);

  for (const preferred of preferredProviders) {
    if (providers.includes(preferred)) {
      return preferred;
    }
  }

  if (providers.length) {
    return providers[0];
  }

  return "";
}

async function startDownload(all) {
  const episodes = all ? getAllEpisodeUrls() : getSelectedEpisodeUrls();
  if (!episodes.length) {
    showToast(all ? "No episodes available." : "No episodes selected.");
    return;
  }

  const language = languageSelect.value;
  const provider = providerSelect.value;

  downloadAllBtn.dataset.busy = "1";
  downloadSelectedBtn.dataset.busy = "1";
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

    if (data.skipped_conflicts > 0) {
      showToast(
        "Added to queue, skipped " +
          data.skipped_conflicts +
          " episode(s) that were already queued or running.",
      );
    } else {
      showToast("Added to download queue");
    }
    if (typeof loadQueue === "function") loadQueue();
    loadDashboardStats();
  } catch (e) {
    showToast("Download request failed: " + e.message);
  } finally {
    delete downloadAllBtn.dataset.busy;
    delete downloadSelectedBtn.dataset.busy;
    downloadAllBtn.disabled = false;
    downloadSelectedBtn.disabled = false;
    updateModalSelectionState();
  }
}

function closeModal() {
  if (!overlay) return;
  overlay.style.display = "none";
  currentModalSite = null;
  modalLanguageOptions = null;
  availableProviders = null;
  autoSyncSupported = true;
  modalSeasonResults = [];
  modalAvailabilityItems = [];
  modalDescriptionExpanded = false;
  renderProviderAvailability([]);
  renderModalDescription("");
  renderModalGenres([]);
  if (modalYear) modalYear.textContent = "";
  if (modalDetailsYear) modalDetailsYear.textContent = "";
  if (modalSiteBadge) modalSiteBadge.textContent = getSiteLabel(currentSite);
  if (modalDetailsSource) modalDetailsSource.textContent = getSiteLabel(currentSite);
  syncDownloadAllLangsVisibility();
  syncAutoSyncAvailability();
  if (autoSyncCheck) autoSyncCheck.checked = false;
  updateModalSelectionState();
}
function closeModalOutside(e) {
  if (e.target === overlay) closeModal();
}

// Auto-Sync toggle from modal checkbox
async function toggleAutoSync() {
  if (!autoSyncCheck) return;
  if (!autoSyncSupported) {
    autoSyncCheck.checked = false;
    showToast("Auto-Sync is not available for direct movie sources.");
    return;
  }
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
  if (
    window.AniworldNotifications &&
    typeof window.AniworldNotifications.add === "function"
  ) {
    window.AniworldNotifications.add(msg, { source: "Browse" });
  }
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
    syncDownloadAllLangsVisibility();
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

  downloadAllLangsBtn.dataset.busy = "1";
  downloadAllBtn.dataset.busy = "1";
  downloadSelectedBtn.dataset.busy = "1";
  downloadAllLangsBtn.disabled = true;
  downloadAllBtn.disabled = true;
  downloadSelectedBtn.disabled = true;

  let queued = 0;
  try {
    for (const [lang, providers] of Object.entries(availableProviders)) {
      if (!providers.length) continue;
      const provider = pickBatchProvider(providers);
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
    delete downloadAllLangsBtn.dataset.busy;
    delete downloadAllBtn.dataset.busy;
    delete downloadSelectedBtn.dataset.busy;
    downloadAllLangsBtn.disabled = false;
    downloadAllBtn.disabled = false;
    downloadSelectedBtn.disabled = false;
    updateModalSelectionState();
  }
}
