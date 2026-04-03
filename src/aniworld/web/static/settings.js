// Download path settings
const downloadPathInput = document.getElementById("downloadPath");
const langSeparationCb = document.getElementById("langSeparation");
const disableEnglishSubCb = document.getElementById("disableEnglishSub");
const experimentalFilmpalastCb = document.getElementById(
  "experimentalFilmpalast",
);
const uiModeSelect = document.getElementById("uiMode");
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
        (experimentalFilmpalastCb.checked ? "eingeblendet" : "ausgeblendet"),
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
