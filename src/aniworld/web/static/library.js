let libraryAllLocations = [];
let libraryLocations = [];
var libraryLangSep = false;
let libraryRequest = null;
let libraryCompareRequest = null;
let libraryCompareLoaded = false;
let libraryCompareMap = new Map();
let libraryCompareSummary = null;

const librarySearchInput = document.getElementById("librarySearchInput");
const libraryLocationFilter = document.getElementById("libraryLocationFilter");
const libraryLanguageFilter = document.getElementById("libraryLanguageFilter");
const librarySortFilter = document.getElementById("librarySortFilter");
const libraryIssueFilter = document.getElementById("libraryIssueFilter");
const librarySummary = document.getElementById("librarySummary");
const libraryCompareStatus = document.getElementById("libraryCompareStatus");
const libraryCompareBtn = document.getElementById("libraryCompareBtn");

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
      populateLibraryFilters();
      applyLibraryFilters();
      loadLibraryCompare();
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
      if (gap > 0) missingCount += gap;
    }
  });

  if (compare && compare.available) {
    sourceMissingCount = Number(compare.missing_count || 0);
  }

  return {
    missingCount: missingCount,
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
    var seasonKeys = Object.keys(title.seasons).sort(function (a, b) {
      return parseInt(a) - parseInt(b);
    });

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
      if (title.insights.missingCount > 0) {
        html.push(
          '<span class="library-title-insight-warning">' +
            title.insights.missingCount +
            " episode gaps detected</span>",
        );
      } else if (title.insights.sourceMissingCount > 0) {
        const missingList =
          title.compare && Array.isArray(title.compare.missing)
            ? title.compare.missing
            : [];
        html.push(
          '<span class="library-title-insight-warning">' +
            title.insights.sourceMissingCount +
            " episodes missing against source." +
            escLib(comparePreview) +
            "</span>",
        );
        if (missingList.length) {
          html.push('<div class="library-missing-wrap">');
          html.push('<div class="library-missing-list">');
          missingList.forEach(function (label) {
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
              'data-missing=\'' + escLib(JSON.stringify(missingList)) + '\' ' +
              'onclick="event.stopPropagation();queueMissingLibraryEpisodesFromButton(this)">Queue Missing</button>',
          );
          html.push("</div>");
        }
      } else if (title.insights.duplicateCount > 0) {
        html.push(
          '<span class="library-title-insight-warning">' +
            title.insights.duplicateCount +
            " duplicates detected</span>",
        );
      } else {
        html.push(
          title.compare && title.compare.available
            ? "<span>Source compare is clean</span>"
            : "<span>Folder looks clean</span>",
        );
      }
      html.push("</div>");
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
  if (!locations.length) {
    list.innerHTML =
      '<div class="library-empty">No downloaded content found</div>';
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

loadLibrary();

if (window.LiveUpdates && typeof window.LiveUpdates.subscribe === "function") {
  window.LiveUpdates.subscribe(["library", "settings"], function () {
    loadLibrary();
    loadLibraryCompare();
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
