// Download path settings
const downloadPathInput = document.getElementById("downloadPath");
const langSeparationCb = document.getElementById("langSeparation");
const disableEnglishSubCb = document.getElementById("disableEnglishSub");
const experimentalFilmpalastCb = document.getElementById(
  "experimentalFilmpalast",
);
const uiModeSelect = document.getElementById("uiMode");
const uiScaleSelect = document.getElementById("uiScale");
const uiThemeSelect = document.getElementById("uiTheme");
const uiRadiusSelect = document.getElementById("uiRadius");
const uiMotionSelect = document.getElementById("uiMotion");
const uiWidthSelect = document.getElementById("uiWidth");
const uiModalWidthSelect = document.getElementById("uiModalWidth");
const uiNavSizeSelect = document.getElementById("uiNavSize");
const uiTableDensitySelect = document.getElementById("uiTableDensity");
const uiBackgroundSelect = document.getElementById("uiBackground");
const serverBindHostValue = document.getElementById("serverBindHost");
const serverPortValue = document.getElementById("serverPort");
const serverScopeValue = document.getElementById("serverScope");
const serverIpsWrap = document.getElementById("serverIps");
const serverAccessUrlsWrap = document.getElementById("serverAccessUrls");
const searchDefaultSortSelect = document.getElementById("searchDefaultSort");
const searchDefaultGenresInput = document.getElementById(
  "searchDefaultGenres",
);
const searchDefaultYearFromInput = document.getElementById(
  "searchDefaultYearFrom",
);
const searchDefaultYearToInput = document.getElementById("searchDefaultYearTo");
const searchDefaultFavoritesOnlyCb = document.getElementById(
  "searchDefaultFavoritesOnly",
);
const searchDefaultDownloadedOnlyCb = document.getElementById(
  "searchDefaultDownloadedOnly",
);
const syncScheduleSelect = document.getElementById("syncSchedule");
const syncLanguageSelect = document.getElementById("syncLanguage");
const syncProviderSelect = document.getElementById("syncProvider");
let settingsRequest = null;
let customPathsRequest = null;
const SYNC_LANGUAGE_OPTIONS = ["German Dub", "English Sub", "German Sub"];

async function updateSettings(body) {
  const resp = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

function refreshSettingsSelects() {
  if (!window.refreshCustomSelect) return;
  if (syncScheduleSelect) window.refreshCustomSelect(syncScheduleSelect);
  if (syncLanguageSelect) window.refreshCustomSelect(syncLanguageSelect);
  if (syncProviderSelect) window.refreshCustomSelect(syncProviderSelect);
  if (uiModeSelect) window.refreshCustomSelect(uiModeSelect);
  if (uiScaleSelect) window.refreshCustomSelect(uiScaleSelect);
  if (uiThemeSelect) window.refreshCustomSelect(uiThemeSelect);
  if (uiRadiusSelect) window.refreshCustomSelect(uiRadiusSelect);
  if (uiMotionSelect) window.refreshCustomSelect(uiMotionSelect);
  if (uiWidthSelect) window.refreshCustomSelect(uiWidthSelect);
  if (uiModalWidthSelect) window.refreshCustomSelect(uiModalWidthSelect);
  if (uiNavSizeSelect) window.refreshCustomSelect(uiNavSizeSelect);
  if (uiTableDensitySelect) window.refreshCustomSelect(uiTableDensitySelect);
  if (uiBackgroundSelect) window.refreshCustomSelect(uiBackgroundSelect);
  if (searchDefaultSortSelect)
    window.refreshCustomSelect(searchDefaultSortSelect);
}

function renderSettingsChipList(container, values) {
  if (!container) return;
  container.innerHTML = "";
  const entries = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!entries.length) {
    const chip = document.createElement("span");
    chip.className = "settings-chip";
    chip.textContent = "Unavailable";
    container.appendChild(chip);
    return;
  }
  entries.forEach((value) => {
    const chip = document.createElement("span");
    chip.className = "settings-chip";
    chip.textContent = value;
    container.appendChild(chip);
  });
}

async function loadSettings() {
  if (settingsRequest) return settingsRequest;
  settingsRequest = (async () => {
    try {
      const resp = await fetch("/api/settings");
      const data = await resp.json();
      downloadPathInput.value = data.download_path || "";
      if (langSeparationCb)
        langSeparationCb.checked = data.lang_separation === "1";
      if (disableEnglishSubCb)
        disableEnglishSubCb.checked = data.disable_english_sub === "1";
      if (experimentalFilmpalastCb)
        experimentalFilmpalastCb.checked = data.experimental_filmpalast === "1";
      if (uiModeSelect) uiModeSelect.value = data.ui_mode || "cozy";
      if (uiScaleSelect) uiScaleSelect.value = data.ui_scale || "100";
      if (uiThemeSelect) uiThemeSelect.value = data.ui_theme || "ocean";
      if (uiRadiusSelect) uiRadiusSelect.value = data.ui_radius || "soft";
      if (uiMotionSelect) uiMotionSelect.value = data.ui_motion || "normal";
      if (uiWidthSelect) uiWidthSelect.value = data.ui_width || "standard";
      if (uiModalWidthSelect) {
        uiModalWidthSelect.value = data.ui_modal_width || "standard";
      }
      if (uiNavSizeSelect) uiNavSizeSelect.value = data.ui_nav_size || "standard";
      if (uiTableDensitySelect) {
        uiTableDensitySelect.value = data.ui_table_density || "standard";
      }
      if (uiBackgroundSelect) {
        uiBackgroundSelect.value = data.ui_background || "dynamic";
      }
      if (serverBindHostValue) {
        serverBindHostValue.textContent = data.server_bind_host || "-";
      }
      if (serverPortValue) {
        serverPortValue.textContent = String(data.server_port || "-");
      }
      if (serverScopeValue) {
        serverScopeValue.textContent = data.server_scope || "-";
      }
      renderSettingsChipList(serverIpsWrap, data.server_ips || []);
      renderSettingsChipList(serverAccessUrlsWrap, data.server_access_urls || []);
      if (searchDefaultSortSelect) {
        searchDefaultSortSelect.value = data.search_default_sort || "source";
      }
      if (searchDefaultGenresInput) {
        searchDefaultGenresInput.value = data.search_default_genres || "";
      }
      if (searchDefaultYearFromInput) {
        searchDefaultYearFromInput.value = data.search_default_year_from || "";
      }
      if (searchDefaultYearToInput) {
        searchDefaultYearToInput.value = data.search_default_year_to || "";
      }
      if (searchDefaultFavoritesOnlyCb) {
        searchDefaultFavoritesOnlyCb.checked =
          data.search_default_favorites_only === "1";
      }
      if (searchDefaultDownloadedOnlyCb) {
        searchDefaultDownloadedOnlyCb.checked =
          data.search_default_downloaded_only === "1";
      }
      if (syncScheduleSelect && data.sync_schedule)
        syncScheduleSelect.value = data.sync_schedule;

      const isLangSep = data.lang_separation === "1";
      let currentSyncLang = data.sync_language;
      if (currentSyncLang === "All Languages" && !isLangSep) {
        currentSyncLang = "German Dub";
      }
      updateSyncLanguageDropdown(isLangSep, currentSyncLang);

      if (syncProviderSelect && data.sync_provider)
        syncProviderSelect.value = data.sync_provider;
      refreshSettingsSelects();
    } catch (e) {
      showToast("Failed to load settings: " + e.message);
    } finally {
      settingsRequest = null;
    }
  })();
  return settingsRequest;
}

async function saveLangSeparation() {
  try {
    await updateSettings({
      download_path: downloadPathInput.value.trim(),
      lang_separation: langSeparationCb.checked,
    });
    showToast(
      "Language separation " +
        (langSeparationCb.checked ? "enabled" : "disabled"),
    );

    let currentSyncLang = syncLanguageSelect ? syncLanguageSelect.value : null;
    if (!langSeparationCb.checked && currentSyncLang === "All Languages") {
      currentSyncLang = "German Dub";
      updateSyncLanguageDropdown(false, currentSyncLang);
      saveSyncDefaults();
    } else {
      updateSyncLanguageDropdown(langSeparationCb.checked, currentSyncLang);
    }
  } catch (e) {
    showToast("Failed to save setting: " + e.message);
  }
}

function updateSyncLanguageDropdown(isLangSep, currentValue) {
  if (!syncLanguageSelect) return;
  syncLanguageSelect.innerHTML = "";
  if (isLangSep) {
    const opt = document.createElement("option");
    opt.value = "All Languages";
    opt.textContent = "All Languages";
    syncLanguageSelect.appendChild(opt);
  }
  SYNC_LANGUAGE_OPTIONS.forEach((l) => {
    const opt = document.createElement("option");
    opt.value = l;
    opt.textContent = l;
    syncLanguageSelect.appendChild(opt);
  });
  if (currentValue) syncLanguageSelect.value = currentValue;
  refreshSettingsSelects();
}

async function saveDisableEnglishSub() {
  try {
    await updateSettings({
      disable_english_sub: disableEnglishSubCb.checked,
    });
    showToast(
      "English Sub downloads " +
        (disableEnglishSubCb.checked ? "disabled" : "enabled"),
    );
  } catch (e) {
    showToast("Failed to save setting: " + e.message);
  }
}

async function saveExperimentalFilmpalast() {
  if (!experimentalFilmpalastCb) return;
  try {
    await updateSettings({
      experimental_filmpalast: experimentalFilmpalastCb.checked,
    });
    showToast(
      "FilmPalast " +
        (experimentalFilmpalastCb.checked ? "enabled" : "hidden"),
    );
  } catch (e) {
    showToast("Failed to save development setting: " + e.message);
  }
}

async function saveUiMode() {
  if (!uiModeSelect) return;
  try {
    await updateSettings({ ui_mode: uiModeSelect.value });
    if (typeof window.applyUiDensity === "function") {
      window.applyUiDensity(uiModeSelect.value);
    }
    showToast("UI mode saved");
  } catch (e) {
    showToast("Failed to save UI mode: " + e.message);
  }
}

async function saveUiScale() {
  if (!uiScaleSelect) return;
  try {
    await updateSettings({ ui_scale: uiScaleSelect.value });
    if (typeof window.applyUiScale === "function") {
      window.applyUiScale(uiScaleSelect.value);
    }
    showToast("UI scale saved");
  } catch (e) {
    showToast("Failed to save UI scale: " + e.message);
  }
}

async function saveUiTheme() {
  if (!uiThemeSelect) return;
  try {
    await updateSettings({ ui_theme: uiThemeSelect.value });
    if (typeof window.applyUiTheme === "function") {
      window.applyUiTheme(uiThemeSelect.value);
    }
    showToast("Theme color saved");
  } catch (e) {
    showToast("Failed to save theme color: " + e.message);
  }
}

async function saveUiRadius() {
  if (!uiRadiusSelect) return;
  try {
    await updateSettings({ ui_radius: uiRadiusSelect.value });
    if (typeof window.applyUiRadius === "function") {
      window.applyUiRadius(uiRadiusSelect.value);
    }
    showToast("Card radius saved");
  } catch (e) {
    showToast("Failed to save card radius: " + e.message);
  }
}

async function saveUiMotion() {
  if (!uiMotionSelect) return;
  try {
    await updateSettings({ ui_motion: uiMotionSelect.value });
    if (typeof window.applyUiMotion === "function") {
      window.applyUiMotion(uiMotionSelect.value);
    }
    showToast("Animation speed saved");
  } catch (e) {
    showToast("Failed to save animation speed: " + e.message);
  }
}

async function saveUiWidth() {
  if (!uiWidthSelect) return;
  try {
    await updateSettings({ ui_width: uiWidthSelect.value });
    if (typeof window.applyUiWidth === "function") {
      window.applyUiWidth(uiWidthSelect.value);
    }
    showToast("Content width saved");
  } catch (e) {
    showToast("Failed to save content width: " + e.message);
  }
}

async function saveUiModalWidth() {
  if (!uiModalWidthSelect) return;
  try {
    await updateSettings({ ui_modal_width: uiModalWidthSelect.value });
    if (typeof window.applyUiModalWidth === "function") {
      window.applyUiModalWidth(uiModalWidthSelect.value);
    }
    showToast("Modal width saved");
  } catch (e) {
    showToast("Failed to save modal width: " + e.message);
  }
}

async function saveUiNavSize() {
  if (!uiNavSizeSelect) return;
  try {
    await updateSettings({ ui_nav_size: uiNavSizeSelect.value });
    if (typeof window.applyUiNavSize === "function") {
      window.applyUiNavSize(uiNavSizeSelect.value);
    }
    showToast("Navigation size saved");
  } catch (e) {
    showToast("Failed to save navigation size: " + e.message);
  }
}

async function saveUiTableDensity() {
  if (!uiTableDensitySelect) return;
  try {
    await updateSettings({ ui_table_density: uiTableDensitySelect.value });
    if (typeof window.applyUiTableDensity === "function") {
      window.applyUiTableDensity(uiTableDensitySelect.value);
    }
    showToast("Table density saved");
  } catch (e) {
    showToast("Failed to save table density: " + e.message);
  }
}

async function saveUiBackground() {
  if (!uiBackgroundSelect) return;
  try {
    await updateSettings({ ui_background: uiBackgroundSelect.value });
    if (typeof window.applyUiBackground === "function") {
      window.applyUiBackground(uiBackgroundSelect.value);
    }
    showToast("Background effects saved");
  } catch (e) {
    showToast("Failed to save background effects: " + e.message);
  }
}

async function saveSearchDefaults() {
  try {
    await updateSettings({
      search_default_sort: searchDefaultSortSelect?.value || "source",
      search_default_genres: searchDefaultGenresInput?.value || "",
      search_default_year_from: searchDefaultYearFromInput?.value || "",
      search_default_year_to: searchDefaultYearToInput?.value || "",
      search_default_favorites_only:
        searchDefaultFavoritesOnlyCb?.checked || false,
      search_default_downloaded_only:
        searchDefaultDownloadedOnlyCb?.checked || false,
    });
    showToast("Search defaults saved");
  } catch (e) {
    showToast("Failed to save search defaults: " + e.message);
  }
}

async function resetSearchDefaultsConfig() {
  if (searchDefaultSortSelect) searchDefaultSortSelect.value = "source";
  if (searchDefaultGenresInput) searchDefaultGenresInput.value = "";
  if (searchDefaultYearFromInput) searchDefaultYearFromInput.value = "";
  if (searchDefaultYearToInput) searchDefaultYearToInput.value = "";
  if (searchDefaultFavoritesOnlyCb) searchDefaultFavoritesOnlyCb.checked = false;
  if (searchDefaultDownloadedOnlyCb) {
    searchDefaultDownloadedOnlyCb.checked = false;
  }
  refreshSettingsSelects();
  await saveSearchDefaults();
}

async function saveDownloadPath() {
  const download_path = downloadPathInput.value.trim();
  try {
    await updateSettings({ download_path });
    showToast("Download path saved");
  } catch (e) {
    showToast("Failed to save settings: " + e.message);
  }
}

loadSettings();

async function saveSyncSchedule() {
  if (!syncScheduleSelect) return;
  try {
    await updateSettings({ sync_schedule: syncScheduleSelect.value });
    showToast("Auto-Sync schedule saved");
  } catch (e) {
    showToast("Failed to save schedule: " + e.message);
  }
}

async function saveSyncDefaults() {
  const body = {};
  if (syncLanguageSelect) body.sync_language = syncLanguageSelect.value;
  if (syncProviderSelect) body.sync_provider = syncProviderSelect.value;
  try {
    await updateSettings(body);
    showToast("Auto-Sync defaults saved");
  } catch (e) {
    showToast("Failed to save defaults: " + e.message);
  }
}

// Custom paths management
const customPathsBody = document.getElementById("customPathsBody");
const customPathsTable = document.getElementById("customPathsTable");

if (customPathsBody) {
  loadCustomPaths();
}

async function loadCustomPaths() {
  if (!customPathsBody) return;
  if (customPathsRequest) return customPathsRequest;
  customPathsRequest = (async () => {
    try {
      const resp = await fetch("/api/custom-paths");
      const data = await resp.json();
      renderCustomPaths(data.paths || []);
    } catch (e) {
      showToast("Failed to load custom paths: " + e.message);
    } finally {
      customPathsRequest = null;
    }
  })();
  return customPathsRequest;
}

function renderCustomPaths(paths) {
  customPathsBody.innerHTML = "";
  if (!paths.length) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="3" style="color:#6b7280;text-align:center">No custom paths</td>';
    customPathsBody.appendChild(tr);
    return;
  }
  paths.forEach(function (p) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" +
      esc(p.name) +
      "</td>" +
      "<td style=\"font-family:'SF Mono','Fira Code',monospace;font-size:.82rem\">" +
      esc(p.path) +
      "</td>" +
      '<td><button class="btn-del" onclick="deleteCustomPath(' +
      p.id +
      ')">Delete</button></td>';
    customPathsBody.appendChild(tr);
  });
}

async function addCustomPath() {
  const name = document.getElementById("newPathName").value.trim();
  const path = document.getElementById("newPathValue").value.trim();
  if (!name || !path) {
    showToast("Name and path are required");
    return;
  }
  try {
    const resp = await fetch("/api/custom-paths", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, path: path }),
    });
    const data = await resp.json();
    if (data.error) {
      showToast(data.error);
      return;
    }
    document.getElementById("newPathName").value = "";
    document.getElementById("newPathValue").value = "";
    showToast("Custom path added");
    loadCustomPaths();
  } catch (e) {
    showToast("Failed to add custom path: " + e.message);
  }
}

async function deleteCustomPath(id) {
  if (!confirm("Delete this custom path?")) return;
  try {
    const resp = await fetch("/api/custom-paths/" + id, { method: "DELETE" });
    const data = await resp.json();
    if (data.error) {
      showToast(data.error);
      return;
    }
    showToast("Custom path deleted");
    loadCustomPaths();
  } catch (e) {
    showToast("Failed to delete custom path: " + e.message);
  }
}

// User management (only runs if the user table exists)
const userTableBody = document.getElementById("userTableBody");

if (userTableBody) {
  loadUsers();
}

async function loadUsers() {
  if (!userTableBody) return;
  try {
    const resp = await fetch("/admin/api/users");
    const data = await resp.json();
    renderUsers(data.users || []);
  } catch (e) {
    showToast("Failed to load users: " + e.message);
  }
}

function renderUsers(users) {
  const adminCount = users.filter((u) => u.role === "admin").length;
  userTableBody.innerHTML = "";
  users.forEach((u) => {
    const isLastAdmin = u.role === "admin" && adminCount <= 1;
    const tr = document.createElement("tr");
    const authMethod = u.auth_method || "local";
    const authBadge =
      authMethod === "oidc"
        ? '<span class="auth-badge auth-sso">SSO</span>'
        : '<span class="auth-badge auth-local">Local</span>';
    tr.innerHTML =
      `<td>${u.id}</td>` +
      `<td>${esc(u.username)}</td>` +
      `<td>
        <select onchange="changeRole(${u.id}, this.value)" ${isLastAdmin ? "disabled" : ""}>
          <option value="user" ${u.role === "user" ? "selected" : ""}>User</option>
          <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
        </select>
      </td>` +
      `<td>${authBadge}</td>` +
      `<td>${esc(u.created_at)}</td>` +
      `<td>${
        isLastAdmin
          ? '<span style="color:#555">protected</span>'
          : `<button class="btn-del" onclick="deleteUser(${u.id})">Delete</button>`
      }</td>`;
    userTableBody.appendChild(tr);
  });
  if (window.refreshCustomSelect) {
    userTableBody.querySelectorAll("select").forEach((select) => {
      window.refreshCustomSelect(select);
    });
  }
}

if (window.LiveUpdates && typeof window.LiveUpdates.subscribe === "function") {
  window.LiveUpdates.subscribe(["settings"], () => {
    loadSettings();
    loadCustomPaths();
  });
}

async function addUser() {
  const username = document.getElementById("newUsername").value.trim();
  const password = document.getElementById("newPassword").value;
  const role = document.getElementById("newRole").value;

  if (!username || !password) {
    showToast("Username and password required");
    return;
  }

  try {
    const resp = await fetch("/admin/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role }),
    });
    const data = await resp.json();
    if (data.error) {
      showToast(data.error);
      return;
    }
    document.getElementById("newUsername").value = "";
    document.getElementById("newPassword").value = "";
    showToast("User created");
    loadUsers();
  } catch (e) {
    showToast("Failed to create user: " + e.message);
  }
}

async function deleteUser(id) {
  if (!confirm("Delete this user?")) return;
  try {
    const resp = await fetch(`/admin/api/users/${id}`, { method: "DELETE" });
    const data = await resp.json();
    if (data.error) {
      showToast(data.error);
      return;
    }
    showToast("User deleted");
    loadUsers();
  } catch (e) {
    showToast("Failed to delete user: " + e.message);
  }
}

async function changeRole(id, newRole) {
  try {
    const resp = await fetch(`/admin/api/users/${id}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    const data = await resp.json();
    if (data.error) {
      showToast(data.error);
      loadUsers();
      return;
    }
    showToast("Role updated");
    loadUsers();
  } catch (e) {
    showToast("Failed to update role: " + e.message);
  }
}

function showToast(msg) {
  if (
    window.AniworldNotifications &&
    typeof window.AniworldNotifications.add === "function"
  ) {
    window.AniworldNotifications.add(msg, { source: "Settings" });
  }
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 4000);
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}
