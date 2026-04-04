(function initShell() {
  const browseBadge = document.getElementById("browseBadge");
  const statsBadge = document.getElementById("statsBadge");
  const settingsBadge = document.getElementById("settingsBadge");
  const queueBadge = document.getElementById("queueBadge");
  const notificationMenu = document.getElementById("notificationMenu");
  const notificationBadge = document.getElementById("notificationBadge");
  const notificationList = document.getElementById("notificationCenterList");
  const notificationEmpty = document.getElementById("notificationCenterEmpty");
  const notificationClearBtn = document.getElementById("notificationClearBtn");
  const toast = document.getElementById("toast");
  const navMenus = Array.from(document.querySelectorAll(".nav-menu"));
  let navFallbackTimer = null;
  let navRequest = null;
  let shellSettingsRequest = null;
  let toastTimer = null;
  let notifications = [];
  const notificationScope = document.body.dataset.currentUser || "__anon__";
  let browserNotificationPrefs = {
    enabled: false,
    browse: true,
    queue: true,
    autosync: true,
    library: true,
    settings: true,
    system: true,
  };

  function notificationStorageKey() {
    return "aniworld:notifications:" + notificationScope;
  }

  function escText(value) {
    const div = document.createElement("div");
    div.textContent = String(value || "");
    return div.innerHTML;
  }

  function formatNotificationTime(isoValue) {
    if (!isoValue) return "";
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) return "";
    const now = Date.now();
    const diffMs = Math.max(0, now - date.getTime());
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return diffMinutes + "m ago";
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return diffHours + "h ago";
    return date.toLocaleDateString();
  }

  function browserNotificationsSupported() {
    return typeof window !== "undefined" && "Notification" in window;
  }

  function normalizePrefEnabled(value, fallback) {
    if (typeof value === "boolean") return value;
    if (value == null) return fallback;
    return String(value).trim() === "1" || String(value).trim().toLowerCase() === "true";
  }

  function applyBrowserNotificationPrefs(data = {}) {
    browserNotificationPrefs = {
      enabled: normalizePrefEnabled(
        data.browser_notifications_enabled,
        browserNotificationPrefs.enabled,
      ),
      browse: normalizePrefEnabled(
        data.browser_notify_browse,
        browserNotificationPrefs.browse,
      ),
      queue: normalizePrefEnabled(
        data.browser_notify_queue,
        browserNotificationPrefs.queue,
      ),
      autosync: normalizePrefEnabled(
        data.browser_notify_autosync,
        browserNotificationPrefs.autosync,
      ),
      library: normalizePrefEnabled(
        data.browser_notify_library,
        browserNotificationPrefs.library,
      ),
      settings: normalizePrefEnabled(
        data.browser_notify_settings,
        browserNotificationPrefs.settings,
      ),
      system: normalizePrefEnabled(
        data.browser_notify_system,
        browserNotificationPrefs.system,
      ),
    };
  }

  function notificationCategoryForSource(source) {
    const normalized = String(source || "System").trim().toLowerCase();
    if (normalized === "browse") return "browse";
    if (normalized === "queue") return "queue";
    if (normalized === "auto-sync" || normalized === "autosync") return "autosync";
    if (normalized === "library") return "library";
    if (normalized === "settings") return "settings";
    return "system";
  }

  function desktopNotificationsAllowed(source) {
    if (!browserNotificationsSupported()) return false;
    if (!browserNotificationPrefs.enabled) return false;
    if (Notification.permission !== "granted") return false;
    return !!browserNotificationPrefs[notificationCategoryForSource(source)];
  }

  function sendBrowserNotification(entry) {
    if (!entry || !desktopNotificationsAllowed(entry.source)) return;
    try {
      const source = String(entry.source || "System");
      const notification = new Notification("AniWorld Downloader", {
        body: source + ": " + String(entry.message || ""),
        tag: "aniworld-" + notificationCategoryForSource(source),
      });
      notification.onclick = function () {
        try {
          window.focus();
        } catch (e) {
          /* ignore */
        }
        notification.close();
      };
    } catch (e) {
      /* ignore */
    }
  }

  function saveNotifications() {
    try {
      localStorage.setItem(notificationStorageKey(), JSON.stringify(notifications));
    } catch (e) {
      /* ignore */
    }
  }

  function renderNotifications() {
    if (!notificationList || !notificationEmpty) return;

    if (!notifications.length) {
      notificationList.innerHTML = "";
      notificationEmpty.style.display = "block";
    } else {
      notificationEmpty.style.display = "none";
      notificationList.innerHTML = notifications
        .map((entry) => {
          const level = String(entry.level || "info");
          const levelClass =
            level === "error"
              ? "notification-item-error"
              : level === "success"
                ? "notification-item-success"
                : level === "warning"
                  ? "notification-item-warning"
                  : "notification-item-info";
          const source = String(entry.source || "App");
          return (
            '<div class="notification-item ' +
            levelClass +
            (entry.read ? "" : " is-unread") +
            '">' +
            '<div class="notification-item-top">' +
            '<span class="notification-item-source">' +
            escText(source) +
            "</span>" +
            '<span class="notification-item-time">' +
            escText(formatNotificationTime(entry.createdAt)) +
            "</span>" +
            "</div>" +
            '<div class="notification-item-message">' +
            escText(entry.message) +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    }

    setBadge(
      notificationBadge,
      notifications.filter((entry) => !entry.read).length,
    );
  }

  function loadNotifications() {
    try {
      const raw = localStorage.getItem(notificationStorageKey());
      notifications = raw ? JSON.parse(raw) : [];
    } catch (e) {
      notifications = [];
    }
    notifications = Array.isArray(notifications) ? notifications.slice(0, 30) : [];
    renderNotifications();
  }

  function markNotificationsRead() {
    let changed = false;
    notifications = notifications.map((entry) => {
      if (entry.read) return entry;
      changed = true;
      return Object.assign({}, entry, { read: true });
    });
    if (changed) {
      saveNotifications();
      renderNotifications();
    }
  }

  function clearNotifications() {
    notifications = [];
    saveNotifications();
    renderNotifications();
  }

  function addNotification(message, options = {}) {
    const cleanMessage = String(message || "").trim();
    if (!cleanMessage) return;

    const previous = notifications[0];
    const now = Date.now();
    const source = options.source || "System";
    const isDuplicate =
      previous &&
      previous.message === cleanMessage &&
      previous.source === source &&
      now - new Date(previous.createdAt).getTime() < 4000;
    let notificationEntry = null;

    if (isDuplicate) {
      notifications[0] = Object.assign({}, previous, {
        createdAt: new Date(now).toISOString(),
        read: false,
      });
    } else {
      notificationEntry = {
        id: String(now) + "-" + Math.random().toString(16).slice(2, 8),
        message: cleanMessage,
        level: options.level || "info",
        source: source,
        createdAt: new Date(now).toISOString(),
        read: false,
      };
      notifications.unshift(notificationEntry);
      notifications = notifications.slice(0, 30);
    }

    saveNotifications();
    renderNotifications();
    if (notificationEntry && options.desktop !== false) {
      sendBrowserNotification(notificationEntry);
    }
  }

  function showGlobalToast(message, options = {}) {
    addNotification(message, options);
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.display = "none";
    }, 4000);
  }

  function applyUiDensity(mode) {
    const nextMode =
      mode === "airy" ||
      mode === "compact" ||
      mode === "tight" ||
      mode === "cozy"
        ? mode
        : "cozy";
    document.body.setAttribute("data-ui-density", nextMode);
  }

  function applyUiScale(scale) {
    const nextScale =
      scale === "90" ||
      scale === "95" ||
      scale === "100" ||
      scale === "105" ||
      scale === "110"
        ? scale
        : "100";
    document.body.setAttribute("data-ui-scale", nextScale);
  }

  function applyUiTheme(theme) {
    const nextTheme = [
      "ocean",
      "mint",
      "sunset",
      "rose",
      "arctic",
      "forest",
      "ember",
      "amber",
      "lavender",
      "cobalt",
      "coral",
      "mono",
      "electric",
      "berry",
      "midnight",
      "jade",
      "crimson",
      "orchid",
      "citrus",
      "steel",
      "sapphire",
      "ruby",
      "plum",
      "sand",
      "glacier",
      "emerald",
      "neon",
      "peach",
      "sky",
      "bronze",
      "pearl",
      "slate",
      "lemon",
      "aqua",
      "indigo",
      "cherry",
      "lilac",
      "copper",
      "lime",
      "azure",
      "magma",
      "blush",
      "pine",
      "violet",
    ].includes(theme)
      ? theme
      : "ocean";
    document.body.setAttribute("data-ui-theme", nextTheme);
  }

  function applyUiRadius(radius) {
    const nextRadius =
      radius === "structured" || radius === "round" ? radius : "soft";
    document.body.setAttribute("data-ui-radius", nextRadius);
  }

  function applyUiMotion(mode) {
    const nextMode =
      mode === "slow" || mode === "fast" ? mode : "normal";
    document.body.setAttribute("data-ui-motion", nextMode);
    document.dispatchEvent(
      new CustomEvent("aniworld:ui-motion", {
        detail: { mode: nextMode },
      }),
    );
  }

  function applyUiWidth(width) {
    const nextWidth = width === "wide" ? "wide" : "standard";
    document.body.setAttribute("data-ui-width", nextWidth);
  }

  function applyUiModalWidth(width) {
    const nextWidth =
      width === "compact" || width === "wide" ? width : "standard";
    document.body.setAttribute("data-ui-modal-width", nextWidth);
  }

  function applyUiNavSize(size) {
    const nextSize =
      size === "compact" || size === "large" ? size : "standard";
    document.body.setAttribute("data-ui-nav-size", nextSize);
  }

  function applyUiTableDensity(density) {
    const nextDensity =
      density === "compact" || density === "relaxed" ? density : "standard";
    document.body.setAttribute("data-ui-table-density", nextDensity);
  }

  function applyUiBackground(mode) {
    const nextMode = [
      "dynamic",
      "cinematic",
      "subtle",
      "minimal",
      "aurora",
      "nebula",
      "frost",
      "ember",
      "grid",
      "pulse",
      "drift",
      "storm",
      "dusk",
      "bloom",
      "off",
    ].includes(mode)
      ? mode
      : "dynamic";
    document.body.setAttribute("data-ui-background", nextMode);
    document.dispatchEvent(
      new CustomEvent("aniworld:ui-background", {
        detail: { mode: nextMode },
      }),
    );
  }

  async function loadShellSettings() {
    if (shellSettingsRequest) return shellSettingsRequest;
    shellSettingsRequest = (async () => {
      try {
        const resp = await fetch("/api/settings");
        const data = await resp.json();
        applyUiDensity(data.ui_mode || document.body.dataset.uiDensity);
        applyUiScale(data.ui_scale || document.body.dataset.uiScale);
        applyUiTheme(data.ui_theme || document.body.dataset.uiTheme);
        applyUiRadius(data.ui_radius || document.body.dataset.uiRadius);
        applyUiMotion(data.ui_motion || document.body.dataset.uiMotion);
        applyUiWidth(data.ui_width || document.body.dataset.uiWidth);
        applyUiModalWidth(
          data.ui_modal_width || document.body.dataset.uiModalWidth,
        );
        applyUiNavSize(data.ui_nav_size || document.body.dataset.uiNavSize);
        applyUiTableDensity(
          data.ui_table_density || document.body.dataset.uiTableDensity,
        );
        applyUiBackground(
          data.ui_background || document.body.dataset.uiBackground,
        );
        applyBrowserNotificationPrefs(data);
      } catch (e) {
        /* ignore */
      } finally {
        shellSettingsRequest = null;
      }
    })();
    return shellSettingsRequest;
  }

  function setBadge(node, value) {
    if (!node) return;
    const count = Number(value || 0);
    if (count > 0) {
      node.textContent = count > 99 ? "99+" : String(count);
      node.style.display = "inline-flex";
    } else {
      node.style.display = "none";
    }
  }

  async function loadNavState() {
    if (navRequest) return navRequest;

    navRequest = (async () => {
      try {
        const resp = await fetch("/api/nav");
        const data = await resp.json();
        setBadge(browseBadge, data.favorites);
        setBadge(statsBadge, data.failed_queue);
        setBadge(settingsBadge, data.autosync_enabled);
        setBadge(queueBadge, data.active_queue);
      } catch (e) {
        /* ignore */
      } finally {
        navRequest = null;
      }
    })();

    return navRequest;
  }

  function closeNavMenus() {
    navMenus.forEach((menu) => menu.classList.remove("is-open"));
  }

  function isCompactNav() {
    return window.matchMedia("(max-width: 720px)").matches;
  }

  navMenus.forEach((menu) => {
    const trigger = menu.querySelector(".nav-menu-trigger");
    if (!trigger) return;

    trigger.addEventListener("click", (event) => {
      if (!isCompactNav()) return;
      if (!menu.classList.contains("is-open")) {
        event.preventDefault();
        closeNavMenus();
        menu.classList.add("is-open");
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".nav-menu")) closeNavMenus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNavMenus();
  });

  if (notificationMenu) {
    notificationMenu.addEventListener("mouseenter", markNotificationsRead);
    notificationMenu.addEventListener("focusin", markNotificationsRead);
  }

  if (notificationClearBtn) {
    notificationClearBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearNotifications();
    });
  }

  window.loadNavState = loadNavState;
  window.applyUiDensity = applyUiDensity;
  window.applyUiScale = applyUiScale;
  window.applyUiTheme = applyUiTheme;
  window.applyUiRadius = applyUiRadius;
  window.applyUiMotion = applyUiMotion;
  window.applyUiWidth = applyUiWidth;
  window.applyUiModalWidth = applyUiModalWidth;
  window.applyUiNavSize = applyUiNavSize;
  window.applyUiTableDensity = applyUiTableDensity;
  window.applyUiBackground = applyUiBackground;
  window.applyBrowserNotificationPrefs = applyBrowserNotificationPrefs;
  window.AniworldNotifications = {
    add: addNotification,
    clear: clearNotifications,
    showToast: showGlobalToast,
  };
  if (typeof window.showToast !== "function") {
    window.showToast = showGlobalToast;
  }
  loadNotifications();
  loadNavState();
  loadShellSettings();

  if (window.LiveUpdates && typeof window.LiveUpdates.subscribe === "function") {
    window.LiveUpdates.subscribe(["nav"], () => loadNavState());
    window.LiveUpdates.subscribe(["settings"], () => loadShellSettings());
  }

  navFallbackTimer = setInterval(() => {
    if (!window.LiveUpdates || !window.LiveUpdates.isConnected()) {
      loadNavState();
    }
  }, 90000);

  async function cleanupServiceWorkers() {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length) {
        await Promise.all(
          registrations.map((registration) => registration.unregister()),
        );
      }

      if ("caches" in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }

      if (
        navigator.serviceWorker.controller &&
        !sessionStorage.getItem("aniworld-sw-cleaned")
      ) {
        sessionStorage.setItem("aniworld-sw-cleaned", "1");
        window.location.reload();
      }
    } catch (e) {
      /* ignore */
    }
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      cleanupServiceWorkers();
    });
  }
})();
