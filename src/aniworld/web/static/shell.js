(function initShell() {
  const browseBadge = document.getElementById("browseBadge");
  const statsBadge = document.getElementById("statsBadge");
  const settingsBadge = document.getElementById("settingsBadge");
  const queueBadge = document.getElementById("queueBadge");
  const navMenus = Array.from(document.querySelectorAll(".nav-menu"));
  let navFallbackTimer = null;
  let navRequest = null;

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

  window.loadNavState = loadNavState;
  loadNavState();

  if (window.LiveUpdates && typeof window.LiveUpdates.subscribe === "function") {
    window.LiveUpdates.subscribe(["nav"], () => loadNavState());
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
