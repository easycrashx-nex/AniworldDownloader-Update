(function initLiveUpdates() {
  const subscribers = [];
  let eventSource = null;
  let reconnectTimer = null;
  let connected = false;

  function hasSubscribers() {
    return subscribers.length > 0;
  }

  function shouldConnect() {
    return "EventSource" in window && hasSubscribers() && !document.hidden;
  }

  function notify(payload) {
    const channels = new Set(payload.channels || []);
    subscribers.forEach((subscriber) => {
      const shouldRun =
        !subscriber.channels.size ||
        [...subscriber.channels].some((channel) => channels.has(channel));
      if (shouldRun) subscriber.handler(payload);
    });
  }

  function cleanup() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    connected = false;
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 4000);
  }

  function connect() {
    if (!shouldConnect()) return;
    if (eventSource) return;
    eventSource = new EventSource("/api/events");

    eventSource.addEventListener("open", () => {
      connected = true;
    });

    eventSource.addEventListener("update", (event) => {
      connected = true;
      try {
        const payload = JSON.parse(event.data || "{}");
        notify(payload);
      } catch (e) {
        /* ignore malformed payloads */
      }
    });

    eventSource.addEventListener("ping", () => {
      connected = true;
    });

    eventSource.onerror = () => {
      cleanup();
      scheduleReconnect();
    };
  }

  window.LiveUpdates = {
    connect,
    isConnected() {
      return connected;
    },
    subscribe(channels, handler) {
      const entry = {
        channels: new Set(channels || []),
        handler,
      };
      subscribers.push(entry);
      connect();
      return function unsubscribe() {
        const index = subscribers.indexOf(entry);
        if (index >= 0) subscribers.splice(index, 1);
        if (!hasSubscribers()) cleanup();
      };
    },
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cleanup();
      return;
    }
    connect();
  });

  window.addEventListener("beforeunload", cleanup);
})();
