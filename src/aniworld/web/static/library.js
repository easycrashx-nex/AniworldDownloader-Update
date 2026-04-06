let libraryAllLocations = [];
let libraryLocations = [];
var libraryLangSep = false;
let libraryRequest = null;
let libraryCompareRequest = null;
let libraryCompareLoaded = false;
let libraryCompareMap = new Map();
let libraryCompareSummary = null;
let libraryAutosyncRequest = null;
let libraryAutosyncUrls = new Set();
let librarySelectedSeries = new Set();
let librarySeriesMeta = new Map();
let libraryRenderedTitleMap = new Map();

const librarySearchInput = document.getElementById("librarySearchInput");
const libraryLocationFilter = document.getElementById("libraryLocationFilter");
const libraryLanguageFilter = document.getElementById("libraryLanguageFilter");
const librarySortFilter = document.getElementById("librarySortFilter");
const libraryIssueFilter = document.getElementById("libraryIssueFilter");
const librarySummary = document.getElementById("librarySummary");
const libraryCompareStatus = document.getElementById("libraryCompareStatus");
const libraryCompareBtn = document.getElementById("libraryCompareBtn");
const libraryRepairBtn = document.getElementById("libraryRepairBtn");
const librarySelectionBadge = document.getElementById("librarySelectionBadge");
const libraryAddToAutosyncBtn = document.getElementById("libraryAddToAutosyncBtn");
const librarySelectVisibleBtn = document.getElementById("librarySelectVisibleBtn");
const libraryClearSelectionBtn = document.getElementById("libraryClearSelectionBtn");

function rebuildLibrarySeriesMeta() {
  const nextMeta = new Map();
  libraryAllLocations.forEach(function (loc) {
    const pushMeta = function (title, langFolder) {
      if (!title || !title.series_url || nextMeta.has(title.series_url)) return;
      nextMeta.set(title.series_url, {
        title: title.folder || "Unknown Title",
        series_url: title.series_url,
        language: getLibraryLanguageLabel(langFolder),
        custom_path_id: loc.custom_path_id ?? null,
      });
    };

    if (libraryLangSep && Array.isArray(loc.lang_folders)) {
      loc.lang_folders.forEach(function (lf) {
        (lf.titles || []).forEach(function (title) {
          pushMeta(title, lf.name);
        });
      });
      return;
    }

    (loc.titles || []).forEach(function (title) {
      pushMeta(title, null);
    });
  });
  librarySeriesMeta = nextMeta;
}

async function loadLibraryAutosyncState(forceRefresh) {
  if (libraryAutosyncRequest && !forceRefresh) return libraryAutosyncRequest;
  libraryAutosyncRequest = (async function () {
    try {
      const resp = await fetch("/api/autosync");
      const data = await resp.json();
      const nextUrls = new Set(
        (Array.isArray(data.jobs) ? data.jobs : [])
          .map(function (job) {
            return (job && job.series_url) || "";
          })
          .filter(Boolean),
      );
      libraryAutosyncUrls = nextUrls;
      Array.from(librarySelectedSeries).forEach(function (seriesUrl) {
        if (libraryAutosyncUrls.has(seriesUrl)) {
          librarySelectedSeries.delete(seriesUrl);
        }
      });
      syncLibrarySelectionUi();
    } catch (e) {
      libraryAutosyncUrls = new Set();
      syncLibrarySelectionUi();
    } finally {
      libraryAutosyncRequest = null;
    }
  })();
  return libraryAutosyncRequest;
}

function getVisibleSelectableSeriesUrls() {
  return Array.from(document.querySelectorAll(".library-series-checkbox"))
    .filter(function (checkbox) {
      return checkbox && !checkbox.disabled && checkbox.dataset.seriesUrl;
    })
    .map(function (checkbox) {
      return checkbox.dataset.seriesUrl;
    });
}

function syncLibrarySelectionUi() {
  Array.from(librarySelectedSeries).forEach(function (seriesUrl) {
    if (libraryAutosyncUrls.has(seriesUrl)) {
      librarySelectedSeries.delete(seriesUrl);
    }
  });

  const selectedCount = librarySelectedSeries.size;
  if (librarySelectionBadge) {
    librarySelectionBadge.textContent =
      selectedCount === 1 ? "1 selected" : selectedCount + " selected";
  }
  if (libraryAddToAutosyncBtn) {
    libraryAddToAutosyncBtn.disabled = selectedCount === 0;
    libraryAddToAutosyncBtn.textContent =
      selectedCount > 0
        ? "Add " + selectedCount + " To Auto-Sync"
        : "Add Selected To Auto-Sync";
  }

  document.querySelectorAll(".library-series-checkbox").forEach(function (input) {
    const seriesUrl = input.dataset.seriesUrl || "";
    const tracked = libraryAutosyncUrls.has(seriesUrl);
    input.disabled = tracked;
    input.checked = !tracked && librarySelectedSeries.has(seriesUrl);
    const row = input.closest(".library-title-header");
    if (row) row.classList.toggle("selected", input.checked);
  });
}

function toggleLibrarySeriesSelection(input) {
  if (!input) return;
  const seriesUrl = input.dataset.seriesUrl || "";
  if (!seriesUrl || libraryAutosyncUrls.has(seriesUrl)) return;
  if (input.checked) {
    librarySelectedSeries.add(seriesUrl);
  } else {
    librarySelectedSeries.delete(seriesUrl);
  }
  syncLibrarySelectionUi();
}

function selectVisibleLibrarySeries() {
  getVisibleSelectableSeriesUrls().forEach(function (seriesUrl) {
    librarySelectedSeries.add(seriesUrl);
  });
  syncLibrarySelectionUi();
}

function clearLibrarySeriesSelection() {
  librarySelectedSeries.clear();
  syncLibrarySelectionUi();
}

async function addSelectedLibrarySeriesToAutosync() {
  const seriesUrls = Array.from(librarySelectedSeries).filter(function (seriesUrl) {
    return !libraryAutosyncUrls.has(seriesUrl);
  });
  if (!seriesUrls.length) {
    showToast("No selectable series are currently selected");
    syncLibrarySelectionUi();
    return;
  }

  if (libraryAddToAutosyncBtn) {
    libraryAddToAutosyncBtn.disabled = true;
  }

  let added = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const seriesUrl of seriesUrls) {
      const meta = librarySeriesMeta.get(seriesUrl);
      if (!meta) {
        failed += 1;
        continue;
      }
      try {
        const resp = await fetch("/api/autosync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: meta.title,
            series_url: meta.series_url,
            language: meta.language,
            custom_path_id: meta.custom_path_id,
          }),
        });
        const data = await resp.json();
        if (resp.ok && !data.error) {
          added += 1;
          libraryAutosyncUrls.add(seriesUrl);
          librarySelectedSeries.delete(seriesUrl);
        } else if (resp.status === 409) {
          skipped += 1;
          libraryAutosyncUrls.add(seriesUrl);
          librarySelectedSeries.delete(seriesUrl);
        } else {
          failed += 1;
        }
      } catch (e) {
        failed += 1;
      }
    }

    if (added > 0 || skipped > 0) {
      if (window.LiveUpdates && typeof window.LiveUpdates.refresh === "function") {
        window.LiveUpdates.refresh(["autosync", "library", "dashboard", "nav", "settings"]);
      }
    }
    if (added > 0) {
      showToast(
        failed > 0
          ? "Added " +
              added +
              " series to Auto-Sync, skipped " +
              skipped +
              ", failed " +
              failed
          : skipped > 0
            ? "Added " + added + " series to Auto-Sync, skipped " + skipped
            : "Added " + added + " series to Auto-Sync",
      );
    } else if (skipped > 0 && failed === 0) {
      showToast("Selected series were already tracked");
    } else {
      showToast("Selected series could not be added to Auto-Sync");
    }
  } finally {
    syncLibrarySelectionUi();
    await loadLibraryAutosyncState(true);
    applyLibraryFilters();
  }
}

function formatLibraryRelativeDate(value) {
  if (!value) return "Never";
  const normalized = String(value).includes("T")
    ? String(value)
    : String(value).replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  const diffMinutes = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 60000),
  );
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} d ago`;
  return date.toLocaleDateString();
}

function getExpandedState() {
  var state = { locations: {}, langFolders: {}, titles: {}, seasons: {} };
  libraryLocations.forEach(function (loc, li) {
    var locBody = document.getElementById("libraryLocBody" + li);
    if (locBody && locBody.classList.contains("expanded")) {
      state.locations[loc.label] = true;
    }
    if (libraryLangSep && loc.lang_folders) {
      loc.lang_folders.forEach(function (lf, lfi) {
        var lfId = "L" + li + "LF" + lfi;
        var lfBody = document.getElementById("libraryLfBody" + lfId);
        if (lfBody && lfBody.classList.contains("expanded")) {
          state.langFolders[loc.label + "::" + lf.name] = true;
        }
        lf.titles.forEach(function (title, ti) {
          var globalTi = lfId + "T" + ti;
          var titleBody = document.getElementById(
            "libraryTitleBody" + globalTi,
          );
          if (titleBody && titleBody.classList.contains("expanded")) {
            state.titles[loc.label + "::" + lf.name + "::" + title.folder] =
              true;
          }
          Object.keys(title.seasons).forEach(function (skey) {
            var sid = "libS" + globalTi + "_" + skey;
            var seasonBody = document.getElementById(sid + "Body");
            if (seasonBody && seasonBody.classList.contains("expanded")) {
              state.seasons[
                loc.label + "::" + lf.name + "::" + title.folder + "::" + skey
              ] = true;
            }
          });
        });
      });
    } else if (loc.titles) {
      loc.titles.forEach(function (title, ti) {
        var globalTi = "L" + li + "T" + ti;
        var titleBody = document.getElementById("libraryTitleBody" + globalTi);
        if (titleBody && titleBody.classList.contains("expanded")) {
          state.titles[loc.label + "::" + title.folder] = true;
        }
        Object.keys(title.seasons).forEach(function (skey) {
          var sid = "libS" + globalTi + "_" + skey;
          var seasonBody = document.getElementById(sid + "Body");
          if (seasonBody && seasonBody.classList.contains("expanded")) {
            state.seasons[loc.label + "::" + title.folder + "::" + skey] = true;
          }
        });
      });
    }
  });
  return state;
}

function restoreExpandedState(state) {
  libraryLocations.forEach(function (loc, li) {
    if (state.locations[loc.label]) {
      var body = document.getElementById("libraryLocBody" + li);
      var arrow = document.getElementById("libraryLocArrow" + li);
      if (body) body.classList.add("expanded");
      if (arrow) arrow.classList.add("expanded");
    }
    if (libraryLangSep && loc.lang_folders) {
      loc.lang_folders.forEach(function (lf, lfi) {
        var lfId = "L" + li + "LF" + lfi;
        if (state.langFolders[loc.label + "::" + lf.name]) {
          var body = document.getElementById("libraryLfBody" + lfId);
          var arrow = document.getElementById("libraryLfArrow" + lfId);
          if (body) body.classList.add("expanded");
          if (arrow) arrow.classList.add("expanded");
        }
        lf.titles.forEach(function (title, ti) {
          var globalTi = lfId + "T" + ti;
          if (state.titles[loc.label + "::" + lf.name + "::" + title.folder]) {
            var body = document.getElementById("libraryTitleBody" + globalTi);
            var arrow = document.getElementById("libraryTitleArrow" + globalTi);
            if (body) body.classList.add("expanded");
            if (arrow) arrow.classList.add("expanded");
          }
          Object.keys(title.seasons).forEach(function (skey) {
            var sid = "libS" + globalTi + "_" + skey;
            if (
              state.seasons[
                loc.label + "::" + lf.name + "::" + title.folder + "::" + skey
              ]
            ) {
              var seasonBody = document.getElementById(sid + "Body");
              var seasonArrow = document.getElementById(sid + "Arrow");
              if (seasonBody) seasonBody.classList.add("expanded");
              if (seasonArrow) seasonArrow.classList.add("expanded");
            }
          });
        });
      });
    } else if (loc.titles) {
      loc.titles.forEach(function (title, ti) {
        var globalTi = "L" + li + "T" + ti;
        if (state.titles[loc.label + "::" + title.folder]) {
          var body = document.getElementById("libraryTitleBody" + globalTi);
          var arrow = document.getElementById("libraryTitleArrow" + globalTi);
          if (body) body.classList.add("expanded");
          if (arrow) arrow.classList.add("expanded");
        }
        Object.keys(title.seasons).forEach(function (skey) {
          var sid = "libS" + globalTi + "_" + skey;
          if (state.seasons[loc.label + "::" + title.folder + "::" + skey]) {
            var seasonBody = document.getElementById(sid + "Body");
            var seasonArrow = document.getElementById(sid + "Arrow");
            if (seasonBody) seasonBody.classList.add("expanded");
            if (seasonArrow) seasonArrow.classList.add("expanded");
          }
        });
      });
    }
  });
}

async function loadLibrary() {
  if (libraryRequest) return libraryRequest;
  var list = document.getElementById("libraryList");
  list.innerHTML = '<div class="library-empty">Loading...</div>';
  libraryRequest = (async function () {
    try {
      var resp = await fetch("/api/library");
      var data = await resp.json();
      libraryAllLocations = data.locations || [];
      libraryLangSep = !!data.lang_sep;
      rebuildLibrarySeriesMeta();
      populateLibraryFilters();
      applyLibraryFilters();
      loadLibraryCompare();
      loadLibraryAutosyncState();
    } catch (e) {
      renderLibrarySummary([]);
      list.innerHTML = '<div class="library-empty">Failed to load library</div>';
    } finally {
      libraryRequest = null;
    }
  })();
  return libraryRequest;
}

function populateLibraryFilters() {
  if (libraryLocationFilter) {
    libraryLocationFilter.innerHTML = '<option value="">All Locations</option>';
    libraryAllLocations.forEach(function (loc) {
      var opt = document.createElement("option");
      opt.value = loc.label;
      opt.textContent = loc.label;
      libraryLocationFilter.appendChild(opt);
    });
  }

  if (libraryLanguageFilter) {
    libraryLanguageFilter.innerHTML = '<option value="">All Languages</option>';
    var seen = {};
    libraryAllLocations.forEach(function (loc) {
      (loc.lang_folders || []).forEach(function (lf) {
        if (seen[lf.name]) return;
        seen[lf.name] = true;
        var opt = document.createElement("option");
        opt.value = lf.name;
        opt.textContent = lf.name;
        libraryLanguageFilter.appendChild(opt);
      });
    });
    libraryLanguageFilter.disabled = !libraryLangSep;
  }

  if (window.refreshCustomSelect) {
    if (libraryLocationFilter) window.refreshCustomSelect(libraryLocationFilter);
    if (libraryLanguageFilter) window.refreshCustomSelect(libraryLanguageFilter);
    if (librarySortFilter) window.refreshCustomSelect(librarySortFilter);
    if (libraryIssueFilter) window.refreshCustomSelect(libraryIssueFilter);
  }
}

function matchesTitleQuery(title, query) {
  if (!query) return true;
  var q = query.toLowerCase();
  if ((title.folder || "").toLowerCase().includes(q)) return true;
  return Object.values(title.seasons || {}).some(function (episodes) {
    return episodes.some(function (ep) {
      return (
        String(ep.episode).includes(q) ||
        (ep.file || "").toLowerCase().includes(q)
      );
    });
  });
}

function buildTitleInsights(title) {
  var missingCount = 0;
  var duplicateCount = 0;
  var seasonCount = 0;
  var sourceMissingCount = 0;
  var localMissing = [];
  var compare = title.compare || null;

  Object.keys(title.seasons || {}).forEach(function (seasonKey) {
    seasonCount += 1;
    var episodes = title.seasons[seasonKey] || [];
    var seen = {};
    var numbers = [];
    episodes.forEach(function (ep) {
      var number = Number(ep.episode || 0);
      if (!number) return;
      seen[number] = (seen[number] || 0) + 1;
      numbers.push(number);
    });

    Object.keys(seen).forEach(function (numberKey) {
      if (seen[numberKey] > 1) {
        duplicateCount += seen[numberKey] - 1;
      }
    });

    if (!numbers.length) return;
    numbers.sort(function (a, b) {
      return a - b;
    });
    var uniqueNumbers = numbers.filter(function (value, index) {
      return index === 0 || value !== numbers[index - 1];
    });
    for (var i = 1; i < uniqueNumbers.length; i += 1) {
      var gap = uniqueNumbers[i] - uniqueNumbers[i - 1] - 1;
      if (gap > 0) {
        missingCount += gap;
        for (var missingEpisode = uniqueNumbers[i - 1] + 1; missingEpisode < uniqueNumbers[i]; missingEpisode += 1) {
          localMissing.push(
            "S" +
              String(seasonKey).padStart(2, "0") +
              "E" +
              String(missingEpisode).padStart(3, "0"),
          );
        }
      }
    }
  });

  if (compare && compare.available) {
    sourceMissingCount = Number(compare.missing_count || 0);
  }

  return {
    missingCount: missingCount,
    localMissing: localMissing,
    duplicateCount: duplicateCount,
    sourceMissingCount: sourceMissingCount,
    seasonCount: seasonCount,
    issueLevel:
      duplicateCount > 0
        ? "duplicates"
        : missingCount > 0 || sourceMissingCount > 0
          ? "missing"
          : "healthy",
  };
}

function getLibraryVideoFiles(title) {
  return (Array.isArray(title?.files) ? title.files : []).filter(function (file) {
    const ext = String(file?.ext || "").toLowerCase();
    return ext !== "xml" && Number(file?.episode || 0) > 0;
  });
}

function getLibraryDuplicateGroups(title) {
  const grouped = new Map();
  getLibraryVideoFiles(title).forEach(function (file) {
    const season = Number(file.season || 0);
    const episode = Number(file.episode || 0);
    if (!season || !episode) return;
    const label =
      "S" + String(season).padStart(2, "0") + "E" + String(episode).padStart(3, "0");
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(file);
  });
  return Array.from(grouped.entries())
    .filter(function (entry) {
      return entry[1].length > 1;
    })
    .map(function (entry) {
      const files = entry[1].slice().sort(function (a, b) {
        return Number(b.size || 0) - Number(a.size || 0);
      });
      return {
        label: entry[0],
        files: files,
      };
    });
}

function buildLibraryFileInspectorHtml(title, titleKey) {
  const files = getLibraryVideoFiles(title);
  const duplicates = getLibraryDuplicateGroups(title);
  const largestFiles = (Array.isArray(title?.largest_files) ? title.largest_files : [])
    .filter(function (file) {
      return String(file?.ext || "").toLowerCase() !== "xml";
    })
    .slice(0, 4);

  if (!files.length && !duplicates.length && !largestFiles.length) {
    return "";
  }

  let html = '<div class="library-file-inspector">';
  html += '<div class="library-file-inspector-head">';
  html += '<span class="library-missing-heading">Library File Inspector</span>';
  html += '<div class="library-file-inspector-meta">';
  html +=
    '<span class="library-file-chip">' +
    escLib(String(title.file_count || files.length) + " files") +
    "</span>";
  if (largestFiles.length) {
    html +=
      '<span class="library-file-chip">' +
      escLib("Largest " + formatSize(largestFiles[0].size || 0)) +
      "</span>";
  }
  if (duplicates.length) {
    html +=
      '<span class="library-file-chip library-file-chip-warning">' +
      escLib(String(duplicates.length) + " duplicate groups") +
      "</span>";
  }
  html += "</div></div>";

  if (largestFiles.length) {
    html += '<div class="library-file-list">';
    largestFiles.forEach(function (file) {
      html +=
        '<div class="library-file-row">' +
        '<span class="library-file-row-main">' +
        escLib(file.relative_path || file.file || "Unknown file") +
        "</span>" +
        '<span class="library-file-row-meta">' +
        escLib(formatSize(file.size || 0)) +
        (file.modified_at ? " · " + escLib(formatLibraryRelativeDate(file.modified_at)) : "") +
        "</span>" +
        "</div>";
    });
    html += "</div>";
  }

  if (duplicates.length) {
    html += '<div class="library-duplicate-box">';
    html += '<div class="library-duplicate-head">';
    html += '<span class="library-missing-heading">Duplicate Resolver</span>';
    html +=
      '<button class="btn-secondary btn-small library-duplicate-action" ' +
      'data-title-key="' + escLib(titleKey) + '" ' +
      'onclick="event.stopPropagation();resolveLibraryDuplicatesFromButton(this)">Resolve Duplicates</button>';
    html += "</div>";
    duplicates.forEach(function (group) {
      html += '<div class="library-duplicate-group">';
      html += '<strong>' + escLib(group.label) + "</strong>";
      html += '<div class="library-duplicate-files">';
      group.files.forEach(function (file, index) {
        html +=
          '<span class="library-duplicate-file' +
          (index === 0 ? " is-keep" : "") +
          '">' +
          escLib((file.relative_path || file.file || "Unknown file") + " · " + formatSize(file.size || 0)) +
          (index === 0 ? " (keep)" : "") +
          "</span>";
      });
      html += "</div></div>";
    });
    html += "</div>";
  }

  html += "</div>";
  return html;
}

async function resolveLibraryDuplicatesFromButton(button) {
  if (!button) return;
  const titleKey = button.dataset.titleKey || "";
  const entry = libraryRenderedTitleMap.get(titleKey);
  const title = entry?.title;
  const duplicateGroups = getLibraryDuplicateGroups(title);
  const duplicateFiles = duplicateGroups.flatMap(function (group) {
    return group.files.map(function (file) {
      return String(file.path || "").trim();
    });
  });
  if (!duplicateFiles.length) {
    showToast("No duplicate files were found");
    return;
  }
  if (!confirm("Resolve duplicate files for this title? The largest file per episode will be kept.")) {
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Resolving...";
  try {
    const resp = await fetch("/api/library/resolve-duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duplicate_files: duplicateFiles }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      showToast(data.error || "Duplicates could not be resolved");
      return;
    }
    showToast(
      Number(data.deleted || 0) > 0
        ? `Removed ${Number(data.deleted || 0)} duplicate file(s)`
        : "No duplicate files were removed",
    );
    loadLibrary();
  } catch (e) {
    showToast("Duplicates could not be resolved");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function getLibraryLanguageLabel(langFolder) {
  if (!langFolder) return "German Dub";
  const map = {
    "german-dub": "German Dub",
    "english-sub": "English Sub",
    "german-sub": "German Sub",
    "english-dub": "English Dub",
  };
  return map[String(langFolder).toLowerCase()] || "German Dub";
}

async function queueMissingLibraryEpisodes(seriesUrl, title, langFolder, missingLabels) {
  const labels = Array.isArray(missingLabels)
    ? missingLabels.filter(Boolean)
    : [];
  if (!seriesUrl || !labels.length) {
    showToast("No missing episodes available");
    return;
  }

  try {
    const resp = await fetch("/api/library/queue-missing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        series_url: seriesUrl,
        title: title,
        language: getLibraryLanguageLabel(langFolder),
        missing_labels: labels,
      }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      showToast(data.error || "Missing episodes could not be queued");
      return;
    }
    const skipped = Number(data.skipped_conflicts || 0) + Number(data.skipped_unavailable || 0);
    showToast(
      skipped > 0
        ? `Queued ${data.queued_episodes} missing episode(s), skipped ${skipped}`
        : `Queued ${data.queued_episodes} missing episode(s)`,
    );
    if (window.LiveUpdates && typeof window.LiveUpdates.refresh === "function") {
      window.LiveUpdates.refresh(["queue", "library", "dashboard", "nav"]);
    }
  } catch (e) {
    showToast("Missing episodes could not be queued");
  }
}

function queueMissingLibraryEpisodesFromButton(button) {
  if (!button) return;
  let missingLabels = [];
  try {
    missingLabels = JSON.parse(button.dataset.missing || "[]");
  } catch (e) {
    missingLabels = [];
  }
  queueMissingLibraryEpisodes(
    button.dataset.seriesUrl || "",
    button.dataset.title || "",
    button.dataset.languageFolder || "",
    missingLabels,
  );
}

async function repairMissingLibraryEpisodes() {
  if (!libraryRepairBtn) return;
  const originalLabel = libraryRepairBtn.textContent;
  libraryRepairBtn.disabled = true;
  libraryRepairBtn.textContent = "Repairing...";
  try {
    const resp = await fetch("/api/library/repair-missing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      showToast(data.error || "Library repair could not be started");
      return;
    }
    const created = Number(data.created || 0);
    const skipped = Number(data.skipped || 0);
    showToast(
      created > 0
        ? skipped > 0
          ? `Queued ${created} missing episode(s), skipped ${skipped}`
          : `Queued ${created} missing episode(s)`
        : "No missing episodes needed repair",
    );
    if (window.LiveUpdates && typeof window.LiveUpdates.refresh === "function") {
      window.LiveUpdates.refresh(["queue", "library", "dashboard", "nav"]);
    }
  } catch (e) {
    showToast("Library repair could not be started");
  } finally {
    libraryRepairBtn.disabled = false;
    libraryRepairBtn.textContent = originalLabel;
  }
}

function matchesIssueFilter(title, issueValue) {
  if (!issueValue) return true;
  var insights = title.insights || buildTitleInsights(title);
  if (issueValue === "missing") {
    return insights.missingCount > 0 || insights.sourceMissingCount > 0;
  }
  if (issueValue === "duplicates") return insights.duplicateCount > 0;
  if (issueValue === "healthy") {
    return (
      insights.missingCount === 0 &&
      insights.sourceMissingCount === 0 &&
      insights.duplicateCount === 0
    );
  }
  return true;
}

function sortTitles(titles, sortValue) {
  var nextTitles = titles.slice();
  nextTitles.sort(function (a, b) {
    if (sortValue === "size-desc") {
      return (b.total_size || 0) - (a.total_size || 0);
    }
    if (sortValue === "episodes-desc") {
      return (b.total_episodes || 0) - (a.total_episodes || 0);
    }
    return String(a.folder || "").localeCompare(String(b.folder || ""), undefined, {
      sensitivity: "base",
    });
  });
  return nextTitles;
}

function renderLibrarySummary(locations) {
  if (!librarySummary) return;
  var titleCount = 0;
  var episodeCount = 0;
  var totalSize = 0;
  var missingTitles = 0;
  var duplicateTitles = 0;
  var sourceMissingTitles = 0;
  var sourceMissingEpisodes = 0;

  locations.forEach(function (loc) {
    var titleGroups;
    if (libraryLangSep && loc.lang_folders) {
      titleGroups = [];
      loc.lang_folders.forEach(function (lf) {
        titleGroups = titleGroups.concat(lf.titles || []);
      });
    } else {
      titleGroups = loc.titles || [];
    }

    titleGroups.forEach(function (title) {
      titleCount += 1;
      episodeCount += Number(title.total_episodes || 0);
      totalSize += Number(title.total_size || 0);
      var insights = title.insights || buildTitleInsights(title);
      if (insights.missingCount > 0 || insights.sourceMissingCount > 0) {
        missingTitles += 1;
      }
      if (insights.sourceMissingCount > 0) {
        sourceMissingTitles += 1;
        sourceMissingEpisodes += insights.sourceMissingCount;
      }
      if (insights.duplicateCount > 0) duplicateTitles += 1;
    });
  });

  librarySummary.innerHTML = `
    <div class="library-summary-card">
      <span class="library-summary-label">Titles</span>
      <strong>${titleCount}</strong>
    </div>
    <div class="library-summary-card">
      <span class="library-summary-label">Episodes</span>
      <strong>${episodeCount}</strong>
    </div>
    <div class="library-summary-card">
      <span class="library-summary-label">Storage</span>
      <strong>${formatSize(totalSize)}</strong>
    </div>
    <div class="library-summary-card">
      <span class="library-summary-label">Need Attention</span>
      <strong>${missingTitles + duplicateTitles}</strong>
      <span class="library-summary-note">${missingTitles} gaps · ${duplicateTitles} duplicates</span>
    </div>`;
  librarySummary.innerHTML = `
    <div class="library-summary-card">
      <span class="library-summary-label">Titles</span>
      <strong>${titleCount}</strong>
    </div>
    <div class="library-summary-card">
      <span class="library-summary-label">Episodes</span>
      <strong>${episodeCount}</strong>
    </div>
    <div class="library-summary-card">
      <span class="library-summary-label">Storage</span>
      <strong>${formatSize(totalSize)}</strong>
    </div>
    <div class="library-summary-card">
      <span class="library-summary-label">Need Attention</span>
      <strong>${missingTitles + duplicateTitles}</strong>
      <span class="library-summary-note">${missingTitles} gaps · ${duplicateTitles} duplicates</span>
    </div>
    <div class="library-summary-card">
      <span class="library-summary-label">Source Compare</span>
      <strong>${sourceMissingTitles}</strong>
      <span class="library-summary-note">${
        libraryCompareLoaded
          ? sourceMissingEpisodes
            ? sourceMissingEpisodes + " source episodes missing locally"
            : "No missing episodes found against linked sources"
          : "Checking linked titles in the background"
      }</span>
    </div>`;
}

function setLibraryCompareStatus(message, loading) {
  if (libraryCompareStatus) {
    libraryCompareStatus.textContent = message;
  }
  if (libraryCompareBtn) {
    libraryCompareBtn.disabled = !!loading;
    libraryCompareBtn.textContent = loading ? "Comparing..." : "Refresh Compare";
  }
  if (libraryRepairBtn) {
    libraryRepairBtn.disabled = !!loading;
  }
}

async function loadLibraryCompare(forceRefresh) {
  if (libraryCompareRequest) return libraryCompareRequest;
  setLibraryCompareStatus("Checking linked titles against the source...", true);
  libraryCompareRequest = (async function () {
    try {
      var resp = await fetch("/api/library/compare" + (forceRefresh ? "?refresh=1" : ""));
      var data = await resp.json();
      libraryCompareSummary = data.summary || null;
      libraryCompareMap = new Map(Object.entries(data.items || {}));
      libraryCompareLoaded = true;
      if (libraryCompareSummary) {
        if (libraryCompareSummary.out_of_sync > 0) {
          setLibraryCompareStatus(
            libraryCompareSummary.out_of_sync +
              " linked title(s) are behind the source right now.",
            false,
          );
        } else if (libraryCompareSummary.compared > 0) {
          setLibraryCompareStatus(
            "Linked library titles are in sync with their source pages.",
            false,
          );
        } else {
          setLibraryCompareStatus(
            "No linked source titles were available for comparison.",
            false,
          );
        }
      } else {
        setLibraryCompareStatus("Source compare finished.", false);
      }
      if (data.auto_repair) {
        const created = Number(data.auto_repair.created || 0);
        const skipped = Number(data.auto_repair.skipped || 0);
        if (created > 0) {
          showToast(
            skipped > 0
              ? `Auto-repair queued ${created} episode(s), skipped ${skipped}`
              : `Auto-repair queued ${created} episode(s)`,
          );
        }
      }
      applyLibraryFilters();
    } catch (e) {
      setLibraryCompareStatus("Source compare could not be loaded.", false);
    } finally {
      libraryCompareRequest = null;
    }
  })();
  return libraryCompareRequest;
}

function applyLibraryFilters() {
  var prevState = getExpandedState();
  var search = (librarySearchInput && librarySearchInput.value.trim().toLowerCase()) || "";
  var locationValue = (libraryLocationFilter && libraryLocationFilter.value) || "";
  var languageValue = (libraryLanguageFilter && libraryLanguageFilter.value) || "";
  var sortValue = (librarySortFilter && librarySortFilter.value) || "name-asc";
  var issueValue = (libraryIssueFilter && libraryIssueFilter.value) || "";

  libraryLocations = libraryAllLocations
    .filter(function (loc) {
      return !locationValue || loc.label === locationValue;
    })
    .map(function (loc) {
      if (libraryLangSep && loc.lang_folders) {
        var langFolders = loc.lang_folders
          .filter(function (lf) {
            return !languageValue || lf.name === languageValue;
          })
          .map(function (lf) {
            var filteredTitles = (lf.titles || [])
              .map(function (title) {
                var nextTitle = Object.assign({}, title);
                nextTitle.compare = nextTitle.series_url
                  ? libraryCompareMap.get(nextTitle.series_url) || null
                  : null;
                nextTitle.insights = buildTitleInsights(nextTitle);
                return nextTitle;
              })
              .filter(function (title) {
                return matchesTitleQuery(title, search) && matchesIssueFilter(title, issueValue);
              });
            return {
              name: lf.name,
              total_episodes: lf.total_episodes,
              total_size: lf.total_size,
              titles: sortTitles(filteredTitles, sortValue),
            };
          })
          .filter(function (lf) {
            return lf.titles.length > 0;
          });
        return {
          label: loc.label,
          custom_path_id: loc.custom_path_id,
          lang_folders: langFolders,
          titles: null,
        };
      }

      return {
        label: loc.label,
        custom_path_id: loc.custom_path_id,
        lang_folders: null,
        titles: sortTitles(
          (loc.titles || [])
            .map(function (title) {
              var nextTitle = Object.assign({}, title);
              nextTitle.compare = nextTitle.series_url
                ? libraryCompareMap.get(nextTitle.series_url) || null
                : null;
              nextTitle.insights = buildTitleInsights(nextTitle);
              return nextTitle;
            })
            .filter(function (title) {
              return matchesTitleQuery(title, search) && matchesIssueFilter(title, issueValue);
            }),
          sortValue,
        ),
      };
    })
    .filter(function (loc) {
      return (loc.lang_folders && loc.lang_folders.length) || (loc.titles && loc.titles.length);
    });

  renderLibrarySummary(libraryLocations);
  renderLibrary(libraryLocations);
  restoreExpandedState(prevState);
}

function renderPoster(title) {
  if (title.poster_url) {
    return (
      '<img class="library-poster" src="' +
      escLib(title.poster_url) +
      '" alt="' +
      escLib(title.folder) +
      '">'
    );
  }

  var initials = escLib((title.folder || "?").slice(0, 2).toUpperCase());
  return (
    '<div class="library-poster library-poster-placeholder">' +
    initials +
    "</div>"
  );
}

function renderTitles(html, titles, idPrefix, padLeft, locIndex, langFolder) {
  titles.forEach(function (title, ti) {
    var globalTi = idPrefix + "T" + ti;
    libraryRenderedTitleMap.set(globalTi, {
      title: title,
      langFolder: langFolder,
    });
    var seasonKeys = Object.keys(title.seasons).sort(function (a, b) {
      return parseInt(a) - parseInt(b);
    });
    var trackedInAutosync = !!(
      title.series_url && libraryAutosyncUrls.has(title.series_url)
    );
    var selectedForAutosync = !!(
      title.series_url && librarySelectedSeries.has(title.series_url)
    );

    html.push('<div class="library-title-section">');
    html.push(
      '<div class="library-title-header" onclick="toggleLibraryTitle(\'' +
        globalTi +
        '\')" style="padding-left:' +
        padLeft +
        'px">',
    );
    html.push('<div class="library-title-left">');
    html.push(
      '<span class="library-arrow" id="libraryTitleArrow' +
        globalTi +
        '">&#9654;</span>',
    );
    html.push('<div class="library-title-main">');
    html.push(renderPoster(title));
    html.push('<div class="library-title-stack">');
    html.push(
      '<span class="library-title-name">' + escLib(title.folder) + "</span>",
    );
    if (title.insights) {
      html.push('<div class="library-title-flags">');
      if (title.insights.missingCount > 0) {
        html.push(
          '<span class="library-issue-chip library-issue-missing">' +
            title.insights.missingCount +
            " missing</span>",
        );
      }
      if (title.insights.sourceMissingCount > 0) {
        html.push(
          '<span class="library-issue-chip library-issue-source-missing">' +
            title.insights.sourceMissingCount +
            " source missing</span>",
        );
      }
      if (title.insights.duplicateCount > 0) {
        html.push(
          '<span class="library-issue-chip library-issue-duplicate">' +
            title.insights.duplicateCount +
            " duplicate</span>",
        );
      }
      if (
        title.insights.missingCount === 0 &&
        title.insights.sourceMissingCount === 0 &&
        title.insights.duplicateCount === 0
      ) {
        html.push(
          '<span class="library-issue-chip library-issue-healthy">Clean</span>',
        );
      }
      html.push("</div>");
    }
    html.push('<div class="library-title-supporting">');
    html.push(
      '<span>Last downloaded: ' +
        escLib(formatLibraryRelativeDate(title.last_downloaded_at)) +
        "</span>",
    );
    html.push(
      '<span>Last synced: ' +
        escLib(formatLibraryRelativeDate(title.last_synced_at)) +
        "</span>",
    );
    html.push("</div>");
    html.push("</div>");
    html.push("</div>");
    html.push("</div>");
    html.push('<div class="library-title-right">');
    html.push(
      '<span class="library-meta">' + title.total_episodes + " ep</span>",
    );
    html.push(
      '<span class="library-meta library-meta-size">' +
        formatSize(title.total_size) +
        "</span>",
    );
    if (title.series_url) {
      if (trackedInAutosync) {
        html.push(
          '<span class="library-meta library-meta-autosync">Tracked</span>',
        );
      } else {
        html.push(
          '<label class="library-title-select" onclick="event.stopPropagation()">' +
            '<input type="checkbox" class="library-series-checkbox" data-series-url="' +
            escLib(title.series_url) +
            '"' +
            (selectedForAutosync ? " checked" : "") +
            ' onchange="toggleLibrarySeriesSelection(this)">' +
            "<span>Select</span>" +
            "</label>",
        );
      }
    }
    if (title.series_url) {
      html.push(
        '<button class="queue-move" data-series-url="' +
          escLib(title.series_url) +
          '" onclick="event.stopPropagation();openLibrarySource(this)" title="Open source" style="font-size:.8rem">Open</button>',
      );
    }
    if (libraryCanDelete) {
      var delArgs =
        locIndex +
        "," +
        ti +
        ",null,null," +
        (langFolder !== null ? "'" + escLib(langFolder) + "'" : "null");
      html.push(
        '<button class="library-delete" onclick="event.stopPropagation();deleteLibraryItem(' +
          delArgs +
          ')" title="Delete title">&times;</button>',
      );
    }
    html.push("</div>");
    html.push("</div>");

    html.push(
      '<div class="library-title-body" id="libraryTitleBody' + globalTi + '">',
    );
    if (title.insights) {
      html.push('<div class="library-title-insights">');
      html.push(
        '<span>' +
          title.insights.seasonCount +
          " seasons · " +
          title.total_episodes +
          " episodes</span>",
      );
      var comparePreview =
        title.compare &&
        Array.isArray(title.compare.missing_sample) &&
        title.compare.missing_sample.length
          ? " Missing: " + title.compare.missing_sample.slice(0, 3).join(", ")
          : "";
      var localMissingList =
        title.insights && Array.isArray(title.insights.localMissing)
          ? title.insights.localMissing
          : [];
      var sourceMissingList =
        title.compare && Array.isArray(title.compare.missing)
          ? title.compare.missing
          : [];
      if (title.insights.missingCount > 0) {
        html.push(
          '<span class="library-title-insight-warning">' +
            title.insights.missingCount +
            " episode gaps detected</span>",
        );
        if (localMissingList.length) {
          html.push('<div class="library-missing-wrap">');
          html.push('<span class="library-missing-heading">Local gaps</span>');
          html.push('<div class="library-missing-list">');
          localMissingList.forEach(function (label) {
            html.push(
              '<span class="library-missing-chip">' + escLib(label) + "</span>",
            );
          });
          html.push("</div>");
          html.push("</div>");
        }
      }
      if (title.insights.sourceMissingCount > 0) {
        html.push(
          '<span class="library-title-insight-warning">' +
            title.insights.sourceMissingCount +
            " episodes missing against source." +
            escLib(comparePreview) +
            "</span>",
        );
        if (sourceMissingList.length) {
          html.push('<div class="library-missing-wrap">');
          html.push(
            '<span class="library-missing-heading">Missing from source compare</span>',
          );
          html.push('<div class="library-missing-list">');
          sourceMissingList.forEach(function (label) {
            html.push(
              '<span class="library-missing-chip">' + escLib(label) + "</span>",
            );
          });
          html.push("</div>");
          html.push(
            '<button class="btn-secondary btn-small library-missing-action" ' +
              'data-series-url="' + escLib(title.series_url || "") + '" ' +
              'data-title="' + escLib(title.folder || "") + '" ' +
              'data-language-folder="' + escLib(langFolder || "") + '" ' +
              'data-missing=\'' + escLib(JSON.stringify(sourceMissingList)) + '\' ' +
              'onclick="event.stopPropagation();queueMissingLibraryEpisodesFromButton(this)">Queue Missing</button>',
          );
          html.push("</div>");
        }
      }
      if (
        title.insights.missingCount === 0 &&
        title.insights.sourceMissingCount === 0 &&
        title.insights.duplicateCount > 0
      ) {
        html.push(
          '<span class="library-title-insight-warning">' +
            title.insights.duplicateCount +
            " duplicates detected</span>",
        );
      } else if (
        title.insights.missingCount === 0 &&
        title.insights.sourceMissingCount === 0 &&
        title.insights.duplicateCount === 0
      ) {
        html.push(
          title.compare && title.compare.available
            ? "<span>Source compare is clean</span>"
            : "<span>Folder looks clean</span>",
        );
      }
      html.push("</div>");
      html.push(buildLibraryFileInspectorHtml(title, globalTi));
    }
    var seasonPad = padLeft + 16;
    var epPad = padLeft + 32;
    seasonKeys.forEach(function (skey) {
      var eps = title.seasons[skey];
      var sid = "libS" + globalTi + "_" + skey;
      var seasonSize = eps.reduce(function (acc, e) {
        return acc + e.size;
      }, 0);

      html.push(
        '<div class="library-season-header" onclick="toggleLibrarySeason(\'' +
          sid +
          '\')" style="padding-left:' +
          seasonPad +
          'px">',
      );
      html.push('<div class="library-season-left">');
      html.push(
        '<span class="library-arrow" id="' + sid + 'Arrow">&#9654;</span>',
      );
      var seasonEpCount = eps.filter(function (e) {
        return e.is_video !== false;
      }).length;
      html.push("<span>Season " + skey + " (" + seasonEpCount + " ep)</span>");
      html.push("</div>");
      html.push('<div class="library-season-right">');
      html.push(
        '<span class="library-meta library-meta-size">' +
          formatSize(seasonSize) +
          "</span>",
      );
      if (libraryCanDelete) {
        var seasonDelArgs =
          locIndex +
          "," +
          ti +
          "," +
          skey +
          ",null," +
          (langFolder !== null ? "'" + escLib(langFolder) + "'" : "null");
        html.push(
          '<button class="library-delete" onclick="event.stopPropagation();deleteLibraryItem(' +
            seasonDelArgs +
            ')" title="Delete season">&times;</button>',
        );
      }
      html.push("</div>");
      html.push("</div>");

      html.push('<div class="library-season-body" id="' + sid + 'Body">');
      eps.forEach(function (ep) {
        html.push(
          '<div class="library-episode" style="padding-left:' + epPad + 'px">',
        );
        html.push(
          '<span class="library-ep-num">E' +
            String(ep.episode).padStart(3, "0") +
            "</span>",
        );
        html.push(
          '<span class="library-ep-file">' + escLib(ep.file) + "</span>",
        );
        html.push(
          '<span class="library-ep-size">' + formatSize(ep.size) + "</span>",
        );
        if (libraryCanDelete) {
          var epDelArgs =
            locIndex +
            "," +
            ti +
            "," +
            skey +
            "," +
            ep.episode +
            "," +
            (langFolder !== null ? "'" + escLib(langFolder) + "'" : "null");
          html.push(
            '<button class="library-delete" onclick="deleteLibraryItem(' +
              epDelArgs +
              ')" title="Delete episode">&times;</button>',
          );
        }
        html.push("</div>");
      });
      html.push("</div>");
    });
    html.push("</div>");
    html.push("</div>");
  });
}

function renderLibrary(locations) {
  var list = document.getElementById("libraryList");
  libraryRenderedTitleMap = new Map();
  if (!locations.length) {
    list.innerHTML =
      '<div class="library-empty">No downloaded content found</div>';
    syncLibrarySelectionUi();
    return;
  }

  var html = [];
  locations.forEach(function (loc, li) {
    var locTotalEps = 0;
    var locTotalSize = 0;

    if (libraryLangSep && loc.lang_folders) {
      loc.lang_folders.forEach(function (lf) {
        lf.titles.forEach(function (title) {
          locTotalEps += title.total_episodes;
          locTotalSize += title.total_size;
        });
      });
    } else if (loc.titles) {
      loc.titles.forEach(function (title) {
        locTotalEps += title.total_episodes;
        locTotalSize += title.total_size;
      });
    }

    html.push('<div class="library-title-section">');
    html.push(
      '<div class="library-location-header" onclick="toggleLibraryLocation(' +
        li +
        ')">',
    );
    html.push('<div class="library-title-left">');
    html.push(
      '<span class="library-arrow" id="libraryLocArrow' +
        li +
        '">&#9654;</span>',
    );
    html.push(
      '<span class="library-title-name" style="font-weight:600;color:#fff">' +
        escLib(loc.label) +
        "</span>",
    );
    html.push("</div>");
    html.push('<div class="library-title-right">');
    html.push('<span class="library-meta">' + locTotalEps + " ep</span>");
    html.push(
      '<span class="library-meta library-meta-size">' +
        formatSize(locTotalSize) +
        "</span>",
    );
    html.push("</div>");
    html.push("</div>");

    html.push('<div class="library-title-body" id="libraryLocBody' + li + '">');

    if (libraryLangSep && loc.lang_folders) {
      loc.lang_folders.forEach(function (lf, lfi) {
        var lfId = "L" + li + "LF" + lfi;
        var lfTotalEps = 0;
        var lfTotalSize = 0;
        lf.titles.forEach(function (title) {
          lfTotalEps += title.total_episodes;
          lfTotalSize += title.total_size;
        });

        html.push('<div class="library-title-section">');
        html.push(
          '<div class="library-season-header" onclick="toggleLibraryLangFolder(\'' +
            lfId +
            '\')" style="padding-left:32px">',
        );
        html.push('<div class="library-season-left">');
        html.push(
          '<span class="library-arrow" id="libraryLfArrow' +
            lfId +
            '">&#9654;</span>',
        );
        html.push('<span style="font-weight:500">' + escLib(lf.name) + "</span>");
        html.push("</div>");
        html.push('<div class="library-season-right">');
        html.push('<span class="library-meta">' + lfTotalEps + " ep</span>");
        html.push(
          '<span class="library-meta library-meta-size">' +
            formatSize(lfTotalSize) +
            "</span>",
        );
        html.push("</div>");
        html.push("</div>");
        html.push(
          '<div class="library-title-body" id="libraryLfBody' + lfId + '">',
        );
        renderTitles(html, lf.titles, lfId, 48, li, lf.name);
        html.push("</div>");
        html.push("</div>");
      });
    } else if (loc.titles) {
      renderTitles(html, loc.titles, "L" + li, 32, li, null);
    }

    html.push("</div>");
    html.push("</div>");
  });

  list.innerHTML = html.join("");
  syncLibrarySelectionUi();
}

function toggleLibraryLocation(index) {
  var body = document.getElementById("libraryLocBody" + index);
  var arrow = document.getElementById("libraryLocArrow" + index);
  if (!body) return;
  var expanded = body.classList.toggle("expanded");
  if (arrow) arrow.classList.toggle("expanded", expanded);
}

function toggleLibraryLangFolder(id) {
  var body = document.getElementById("libraryLfBody" + id);
  var arrow = document.getElementById("libraryLfArrow" + id);
  if (!body) return;
  var expanded = body.classList.toggle("expanded");
  if (arrow) arrow.classList.toggle("expanded", expanded);
}

function toggleLibraryTitle(id) {
  var body = document.getElementById("libraryTitleBody" + id);
  var arrow = document.getElementById("libraryTitleArrow" + id);
  if (!body) return;
  var expanded = body.classList.toggle("expanded");
  if (arrow) arrow.classList.toggle("expanded", expanded);
}

function toggleLibrarySeason(id) {
  var body = document.getElementById(id + "Body");
  var arrow = document.getElementById(id + "Arrow");
  if (!body) return;
  var expanded = body.classList.toggle("expanded");
  if (arrow) arrow.classList.toggle("expanded", expanded);
}

function openLibrarySource(button) {
  var url = button && button.getAttribute("data-series-url");
  if (!url) return;
  window.open(url, "_blank");
}

async function deleteLibraryItem(
  locIndex,
  titleIndex,
  season,
  episode,
  langFolder,
) {
  var loc = libraryLocations[locIndex];
  if (!loc) return;

  var titles;
  if (libraryLangSep && loc.lang_folders && langFolder !== null) {
    var lf = loc.lang_folders.find(function (folder) {
      return folder.name === langFolder;
    });
    if (!lf) return;
    titles = lf.titles;
  } else {
    titles = loc.titles;
  }

  var title = titles[titleIndex];
  if (!title) return;

  var where = loc.label + (langFolder ? "/" + langFolder : "");
  var msg;
  if (season === null && episode === null) {
    msg = 'Delete entire title "' + title.folder + '" from ' + where + "?";
  } else if (episode === null) {
    msg =
      "Delete all episodes from Season " +
      season +
      ' in "' +
      title.folder +
      '" (' +
      where +
      ")?";
  } else {
    msg =
      "Delete S" +
      String(season).padStart(2, "0") +
      "E" +
      String(episode).padStart(3, "0") +
      ' from "' +
      title.folder +
      '" (' +
      where +
      ")?";
  }

  if (!confirm(msg)) return;

  try {
    var body = {
      folder: title.folder,
      season: season,
      episode: episode,
      custom_path_id: loc.custom_path_id,
    };
    if (langFolder) body.lang_folder = langFolder;
    var resp = await fetch("/api/library/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    var data = await resp.json();
    if (data.error) {
      if (typeof showToast === "function") showToast(data.error);
    } else {
      if (typeof showToast === "function") showToast("Deleted successfully");
    }
    loadLibrary();
  } catch (e) {
    if (typeof showToast === "function") showToast("Delete failed");
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function escLib(s) {
  var d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

if (librarySearchInput) {
  librarySearchInput.addEventListener("input", applyLibraryFilters);
}
if (libraryLocationFilter) {
  libraryLocationFilter.addEventListener("change", applyLibraryFilters);
}
if (libraryLanguageFilter) {
  libraryLanguageFilter.addEventListener("change", applyLibraryFilters);
}
if (librarySortFilter) {
  librarySortFilter.addEventListener("change", applyLibraryFilters);
}
if (libraryIssueFilter) {
  libraryIssueFilter.addEventListener("change", applyLibraryFilters);
}
if (libraryCompareBtn) {
  libraryCompareBtn.addEventListener("click", function () {
    loadLibraryCompare(true);
  });
}
if (libraryRepairBtn) {
  libraryRepairBtn.addEventListener("click", function () {
    repairMissingLibraryEpisodes();
  });
}
if (librarySelectVisibleBtn) {
  librarySelectVisibleBtn.addEventListener("click", function () {
    selectVisibleLibrarySeries();
  });
}
if (libraryClearSelectionBtn) {
  libraryClearSelectionBtn.addEventListener("click", function () {
    clearLibrarySeriesSelection();
  });
}
if (libraryAddToAutosyncBtn) {
  libraryAddToAutosyncBtn.addEventListener("click", function () {
    addSelectedLibrarySeriesToAutosync();
  });
}

loadLibrary();

if (window.LiveUpdates && typeof window.LiveUpdates.subscribe === "function") {
  window.LiveUpdates.subscribe(["library", "settings", "autosync"], function () {
    loadLibrary();
    loadLibraryCompare();
    loadLibraryAutosyncState(true);
  });
}

function showToast(msg) {
  if (
    window.AniworldNotifications &&
    typeof window.AniworldNotifications.add === "function"
  ) {
    window.AniworldNotifications.add(msg, { source: "Library" });
  }
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 4000);
}
