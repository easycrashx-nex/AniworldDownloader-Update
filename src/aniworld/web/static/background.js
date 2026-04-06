(function initParticleNetwork() {
  if (window.__aniworldParticleNetworkInitialized) return;
  window.__aniworldParticleNetworkInitialized = true;

  const canvas = document.getElementById("networkCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const BACKGROUND_PROFILES = {
    dynamic: {
      motionFactor: 0.18,
      areaFactor: 26000,
      minPoints: 36,
      maxPoints: 96,
      maxDistance: 165,
      canvasOpacity: 0.85,
      edgeAlpha: 0.42,
      edgeColor: "130, 205, 255",
      pointRadius: 1.8,
      pointColor: "rgba(166, 223, 255, 0.9)",
      highlightColor: "rgba(120, 235, 220, 0.95)",
    },
    cinematic: {
      motionFactor: 0.24,
      areaFactor: 22000,
      minPoints: 42,
      maxPoints: 116,
      maxDistance: 192,
      canvasOpacity: 1,
      edgeAlpha: 0.58,
      edgeColor: "186, 233, 255",
      pointRadius: 2.1,
      pointColor: "rgba(196, 238, 255, 0.96)",
      highlightColor: "rgba(124, 240, 226, 0.98)",
    },
    subtle: {
      motionFactor: 0.07,
      areaFactor: 34000,
      minPoints: 20,
      maxPoints: 54,
      maxDistance: 138,
      canvasOpacity: 0.46,
      edgeAlpha: 0.22,
      edgeColor: "138, 204, 244",
      pointRadius: 1.4,
      pointColor: "rgba(166, 223, 255, 0.62)",
      highlightColor: "rgba(122, 232, 216, 0.84)",
    },
    minimal: {
      motionFactor: 0.04,
      areaFactor: 42000,
      minPoints: 14,
      maxPoints: 34,
      maxDistance: 124,
      canvasOpacity: 0.22,
      edgeAlpha: 0.1,
      edgeColor: "124, 196, 238",
      pointRadius: 1.2,
      pointColor: "rgba(166, 223, 255, 0.28)",
      highlightColor: "rgba(122, 232, 216, 0.58)",
    },
    aurora: {
      motionFactor: 0.16,
      areaFactor: 24000,
      minPoints: 40,
      maxPoints: 104,
      maxDistance: 178,
      canvasOpacity: 0.92,
      edgeAlpha: 0.48,
      edgeColor: "126, 245, 215",
      pointRadius: 1.95,
      pointColor: "rgba(168, 255, 228, 0.88)",
      highlightColor: "rgba(101, 255, 214, 0.98)",
    },
    nebula: {
      motionFactor: 0.13,
      areaFactor: 25000,
      minPoints: 32,
      maxPoints: 82,
      maxDistance: 184,
      canvasOpacity: 0.76,
      edgeAlpha: 0.38,
      edgeColor: "214, 154, 255",
      pointRadius: 1.75,
      pointColor: "rgba(230, 188, 255, 0.76)",
      highlightColor: "rgba(255, 202, 250, 0.94)",
    },
    frost: {
      motionFactor: 0.08,
      areaFactor: 36000,
      minPoints: 18,
      maxPoints: 44,
      maxDistance: 132,
      canvasOpacity: 0.34,
      edgeAlpha: 0.14,
      edgeColor: "214, 244, 255",
      pointRadius: 1.2,
      pointColor: "rgba(224, 246, 255, 0.44)",
      highlightColor: "rgba(193, 245, 255, 0.84)",
    },
    ember: {
      motionFactor: 0.15,
      areaFactor: 27000,
      minPoints: 34,
      maxPoints: 92,
      maxDistance: 158,
      canvasOpacity: 0.78,
      edgeAlpha: 0.36,
      edgeColor: "255, 178, 112",
      pointRadius: 1.7,
      pointColor: "rgba(255, 196, 138, 0.82)",
      highlightColor: "rgba(255, 224, 160, 0.96)",
    },
    grid: {
      motionFactor: 0.05,
      areaFactor: 32000,
      minPoints: 22,
      maxPoints: 48,
      maxDistance: 142,
      canvasOpacity: 0.28,
      edgeAlpha: 0.12,
      edgeColor: "110, 214, 255",
      pointRadius: 1.25,
      pointColor: "rgba(140, 224, 255, 0.34)",
      highlightColor: "rgba(104, 240, 255, 0.72)",
    },
    pulse: {
      motionFactor: 0.22,
      areaFactor: 23000,
      minPoints: 38,
      maxPoints: 108,
      maxDistance: 172,
      canvasOpacity: 0.9,
      edgeAlpha: 0.5,
      edgeColor: "98, 225, 255",
      pointRadius: 2,
      pointColor: "rgba(148, 233, 255, 0.94)",
      highlightColor: "rgba(122, 255, 243, 1)",
    },
    drift: {
      motionFactor: 0.09,
      areaFactor: 33000,
      minPoints: 20,
      maxPoints: 56,
      maxDistance: 150,
      canvasOpacity: 0.4,
      edgeAlpha: 0.18,
      edgeColor: "168, 212, 248",
      pointRadius: 1.3,
      pointColor: "rgba(186, 225, 255, 0.5)",
      highlightColor: "rgba(153, 243, 231, 0.82)",
    },
    storm: {
      motionFactor: 0.26,
      areaFactor: 21000,
      minPoints: 44,
      maxPoints: 118,
      maxDistance: 190,
      canvasOpacity: 0.96,
      edgeAlpha: 0.56,
      edgeColor: "166, 217, 255",
      pointRadius: 2,
      pointColor: "rgba(208, 241, 255, 0.98)",
      highlightColor: "rgba(171, 255, 238, 1)",
    },
    dusk: {
      motionFactor: 0.11,
      areaFactor: 30000,
      minPoints: 26,
      maxPoints: 70,
      maxDistance: 162,
      canvasOpacity: 0.58,
      edgeAlpha: 0.26,
      edgeColor: "255, 181, 160",
      pointRadius: 1.45,
      pointColor: "rgba(255, 208, 189, 0.58)",
      highlightColor: "rgba(255, 233, 198, 0.9)",
    },
    bloom: {
      motionFactor: 0.17,
      areaFactor: 25000,
      minPoints: 36,
      maxPoints: 98,
      maxDistance: 168,
      canvasOpacity: 0.82,
      edgeAlpha: 0.44,
      edgeColor: "255, 186, 222",
      pointRadius: 1.85,
      pointColor: "rgba(255, 205, 229, 0.82)",
      highlightColor: "rgba(255, 225, 240, 0.98)",
    },
    off: {
      motionFactor: 0,
      areaFactor: 42000,
      minPoints: 0,
      maxPoints: 0,
      maxDistance: 0,
      canvasOpacity: 0,
      edgeAlpha: 0,
      edgeColor: "130, 205, 255",
      pointRadius: 0,
      pointColor: "rgba(0, 0, 0, 0)",
      highlightColor: "rgba(0, 0, 0, 0)",
    },
  };

  let width = 0;
  let height = 0;
  let points = [];
  let animationFrame = null;
  let deviceScale = 1;
  let pointerX = null;
  let pointerY = null;
  let magnetActive = false;
  const pressureWaves = [];
  const meteors = [];
  let lastFrameTime = performance.now();
  let lastMeteorAt = 0;

  function getBackgroundMode() {
    const mode = document.body?.dataset?.uiBackground || "dynamic";
    return BACKGROUND_PROFILES[mode] ? mode : "dynamic";
  }

  function getBackgroundProfile() {
    return BACKGROUND_PROFILES[getBackgroundMode()] || BACKGROUND_PROFILES.dynamic;
  }

  function getMotionSpeedMultiplier() {
    const mode = document.body?.dataset?.uiMotion || "normal";
    if (mode === "slow") return 0.74;
    if (mode === "fast") return 1.32;
    return 1;
  }

  function getMotionFactor() {
    if (prefersReducedMotion) return 0;
    return getBackgroundProfile().motionFactor;
  }

  function pointCountForViewport() {
    const profile = getBackgroundProfile();
    if (profile.maxPoints <= 0) return 0;
    return Math.max(
      profile.minPoints,
      Math.min(profile.maxPoints, Math.round((width * height) / profile.areaFactor)),
    );
  }

  function createPoint() {
    const speedFactor = getMotionFactor();
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * speedFactor,
      vy: (Math.random() - 0.5) * speedFactor,
      driftOffset: Math.random() * Math.PI * 2,
      driftScale: 0.7 + Math.random() * 0.8,
    };
  }

  function ambientDriftConfig() {
    const mode = getBackgroundMode();
    if (mode === "storm") return { strength: 0.12, speed: 0.0018 };
    if (mode === "nebula") return { strength: 0.085, speed: 0.0011 };
    if (mode === "aurora") return { strength: 0.076, speed: 0.00125 };
    if (mode === "pulse") return { strength: 0.094, speed: 0.0016 };
    if (mode === "drift") return { strength: 0.052, speed: 0.0009 };
    if (mode === "minimal" || mode === "frost") {
      return { strength: 0.018, speed: 0.00055 };
    }
    return { strength: 0.04, speed: 0.00085 };
  }

  function meteorConfig() {
    const mode = getBackgroundMode();
    if (mode === "storm") return { interval: 2600, chance: 0.9 };
    if (mode === "pulse" || mode === "cinematic") return { interval: 3400, chance: 0.82 };
    if (mode === "minimal" || mode === "off") return { interval: 999999, chance: 0 };
    if (mode === "frost") return { interval: 5200, chance: 0.45 };
    return { interval: 4300, chance: 0.68 };
  }

  function spawnMeteor() {
    const profile = getBackgroundProfile();
    const fromLeft = Math.random() > 0.5;
    const startX = fromLeft ? -60 : width + 60;
    const startY = Math.random() * Math.max(120, height * 0.45);
    const directionX = fromLeft ? 1 : -1;
    meteors.push({
      x: startX,
      y: startY,
      vx: directionX * (4.2 + Math.random() * 1.8),
      vy: 1.1 + Math.random() * 1.4,
      length: 70 + Math.random() * 70,
      life: 0,
      maxLife: 36 + Math.floor(Math.random() * 22),
      alpha: Math.min(0.9, profile.edgeAlpha + 0.24),
    });
  }

  function isFreeBackgroundTarget(target) {
    if (!target) return false;
    const blocked = target.closest(
      [
        ".top-bar",
        ".dashboard-panel",
        ".settings-section",
        ".settings-info-card",
        ".page-header",
        ".section-heading",
        ".nav-dropdown",
        ".nav-menu",
        ".modal-overlay",
        ".modal-card",
        ".queue-modal",
        ".series-modal",
        ".library-title-section",
        ".library-location-header",
        ".library-season-header",
        ".autosync-card",
        ".provider-health-card",
        ".provider-history-card",
        ".maintenance-session-card",
        ".auth-card",
        ".login-shell",
        "button",
        "input",
        "select",
        "textarea",
        "a",
        "label",
        "table",
      ].join(","),
    );
    return !blocked;
  }

  function pushPressureWave(x, y) {
    pressureWaves.push({
      x,
      y,
      radius: 0,
      strength: 7.4,
      maxRadius: Math.min(Math.max(width, height) * 0.38, 340),
      life: 0,
      maxLife: 42,
    });
  }

  function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    deviceScale = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * deviceScale);
    canvas.height = Math.floor(height * deviceScale);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);

    const targetCount = pointCountForViewport();
    points = Array.from({ length: targetCount }, createPoint);

    drawFrame();
  }

  function updatePoints(deltaMs) {
    const profile = getBackgroundProfile();
    if (prefersReducedMotion || getBackgroundMode() === "off") return;
    const speedMultiplier = getMotionSpeedMultiplier();
    const drift = ambientDriftConfig();
    const now = performance.now();

    for (let index = pressureWaves.length - 1; index >= 0; index -= 1) {
      const wave = pressureWaves[index];
      wave.life += 1;
      wave.radius = (wave.life / wave.maxLife) * wave.maxRadius;
      if (wave.life >= wave.maxLife) {
        pressureWaves.splice(index, 1);
      }
    }

    const meteorRules = meteorConfig();
    if (
      meteorRules.chance > 0 &&
      now - lastMeteorAt >= meteorRules.interval &&
      Math.random() < meteorRules.chance
    ) {
      spawnMeteor();
      lastMeteorAt = now;
    }

    for (let index = meteors.length - 1; index >= 0; index -= 1) {
      const meteor = meteors[index];
      meteor.life += 1;
      meteor.x += meteor.vx * speedMultiplier;
      meteor.y += meteor.vy * speedMultiplier;
      if (
        meteor.life >= meteor.maxLife ||
        meteor.x < -220 ||
        meteor.x > width + 220 ||
        meteor.y > height + 220
      ) {
        meteors.splice(index, 1);
      }
    }

    for (const point of points) {
      point.x += point.vx * speedMultiplier;
      point.y += point.vy * speedMultiplier;
      point.x +=
        Math.cos(now * drift.speed + point.driftOffset) *
        drift.strength *
        point.driftScale *
        (deltaMs / 16.666);
      point.y +=
        Math.sin(now * drift.speed * 0.88 + point.driftOffset * 1.7) *
        drift.strength *
        point.driftScale *
        (deltaMs / 16.666);

      if (point.x <= 0 || point.x >= width) point.vx *= -1;
      if (point.y <= 0 || point.y >= height) point.vy *= -1;

      point.x = Math.max(0, Math.min(width, point.x));
      point.y = Math.max(0, Math.min(height, point.y));

      for (const wave of pressureWaves) {
        const wx = point.x - wave.x;
        const wy = point.y - wave.y;
        const waveDistance = Math.hypot(wx, wy);
        if (!waveDistance) continue;
        const band = 64;
        const edgeDistance = Math.abs(waveDistance - wave.radius);
        if (edgeDistance > band) continue;
        const pulseForce =
          ((band - edgeDistance) / band) *
          wave.strength *
          (1 - wave.life / wave.maxLife) *
          speedMultiplier;
        point.x += (wx / waveDistance) * pulseForce;
        point.y += (wy / waveDistance) * pulseForce;
      }

      if (pointerX === null || pointerY === null) continue;

      const dx = point.x - pointerX;
      const dy = point.y - pointerY;
      const distSq = dx * dx + dy * dy;

      if (magnetActive) {
        const magnetRadius = 190;
        if (distSq > 0 && distSq < magnetRadius * magnetRadius) {
          const distance = Math.sqrt(distSq);
          const pullForce =
            ((magnetRadius * magnetRadius - distSq) /
              (magnetRadius * magnetRadius)) *
            1.15 *
            speedMultiplier;
          point.x -= (dx / distance) * pullForce;
          point.y -= (dy / distance) * pullForce;
        }
      } else if (distSq > 0 && distSq < 110 * 110) {
        const force = (110 * 110 - distSq) / (110 * 110);
        const distance = Math.sqrt(distSq);
        point.x += (dx / distance) * force * 0.8 * speedMultiplier;
        point.y += (dy / distance) * force * 0.8 * speedMultiplier;
      }
    }

    if (profile.motionFactor <= 0) drawFrame();
  }

  function nearestConnections(index) {
    const current = points[index];
    const profile = getBackgroundProfile();
    const neighbors = [];

    for (let otherIndex = 0; otherIndex < points.length; otherIndex += 1) {
      if (otherIndex === index) continue;
      const other = points[otherIndex];
      const dx = other.x - current.x;
      const dy = other.y - current.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= profile.maxDistance) {
        neighbors.push({ index: otherIndex, distance });
      }
    }

    neighbors.sort((a, b) => a.distance - b.distance);
    return neighbors.slice(0, 4);
  }

  function drawFrame() {
    const mode = getBackgroundMode();
    const profile = getBackgroundProfile();
    const now = performance.now();
    canvas.style.opacity = String(profile.canvasOpacity);
    ctx.clearRect(0, 0, width, height);
    if (mode === "off") return;

    const renderedEdges = new Set();

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const neighbors = nearestConnections(index);

      for (const neighbor of neighbors) {
        const edgeKey =
          index < neighbor.index
            ? `${index}:${neighbor.index}`
            : `${neighbor.index}:${index}`;

        if (renderedEdges.has(edgeKey)) continue;
        renderedEdges.add(edgeKey);

        const target = points[neighbor.index];
        const alpha =
          Math.max(0.04, 1 - neighbor.distance / profile.maxDistance) *
          profile.edgeAlpha;
        const breathing =
          0.84 +
          0.22 *
            Math.sin(
              now * 0.0024 + index * 0.37 + neighbor.index * 0.21,
            );

        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = `rgba(${profile.edgeColor}, ${Math.max(0.025, alpha * breathing)})`;
        ctx.lineWidth = (mode === "storm" ? 1.15 : 1) * (0.92 + breathing * 0.1);
        ctx.stroke();
      }
    }

    for (const point of points) {
      const highlight =
        pointerX !== null &&
        pointerY !== null &&
        Math.hypot(point.x - pointerX, point.y - pointerY) < 120;

      ctx.beginPath();
      ctx.arc(
        point.x,
        point.y,
        highlight ? Math.max(2.1, profile.pointRadius + 0.3) : profile.pointRadius,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = highlight ? profile.highlightColor : profile.pointColor;
      ctx.fill();
    }

    for (const meteor of meteors) {
      const fade = Math.max(0, 1 - meteor.life / meteor.maxLife);
      const tailX = meteor.x - meteor.vx * (meteor.length / 8);
      const tailY = meteor.y - meteor.vy * (meteor.length / 8);
      const gradient = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
      gradient.addColorStop(0, `rgba(${profile.edgeColor}, ${meteor.alpha * fade})`);
      gradient.addColorStop(1, `rgba(${profile.edgeColor}, 0)`);
      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(tailX, tailY);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(meteor.x, meteor.y, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = profile.highlightColor;
      ctx.fill();
    }

    for (const wave of pressureWaves) {
      const alpha = Math.max(0, 0.16 * (1 - wave.life / wave.maxLife));
      if (alpha <= 0) continue;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${profile.edgeColor}, ${alpha})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }

  function tick() {
    const now = performance.now();
    const deltaMs = Math.min(34, Math.max(8, now - lastFrameTime));
    lastFrameTime = now;
    updatePoints(deltaMs);
    drawFrame();
    if (!prefersReducedMotion && getBackgroundMode() !== "off") {
      animationFrame = window.requestAnimationFrame(tick);
    } else {
      animationFrame = null;
    }
  }

  function refreshBackgroundMode() {
    resizeCanvas();
    meteors.length = 0;
    pressureWaves.length = 0;
    lastFrameTime = performance.now();
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    if (!prefersReducedMotion && getBackgroundMode() !== "off") {
      animationFrame = window.requestAnimationFrame(tick);
    } else {
      drawFrame();
    }
  }

  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener(
    "mousemove",
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    },
    { passive: true },
  );
  window.addEventListener(
    "mouseleave",
    () => {
      pointerX = null;
      pointerY = null;
      magnetActive = false;
    },
    { passive: true },
  );
  window.addEventListener(
    "mousedown",
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!isFreeBackgroundTarget(event.target)) return;
      if (event.button === 0) {
        pushPressureWave(event.clientX, event.clientY);
      } else if (event.button === 2) {
        magnetActive = true;
        event.preventDefault();
      }
    },
    false,
  );
  window.addEventListener(
    "mouseup",
    (event) => {
      if (event.button === 2) {
        magnetActive = false;
      }
    },
    { passive: true },
  );
  window.addEventListener(
    "contextmenu",
    (event) => {
      if (magnetActive && isFreeBackgroundTarget(event.target)) {
        event.preventDefault();
      }
    },
    false,
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }
      } else if (!prefersReducedMotion && !animationFrame) {
        animationFrame = window.requestAnimationFrame(tick);
      } else {
        drawFrame();
      }
    },
    { passive: true },
  );
  document.addEventListener("aniworld:ui-background", refreshBackgroundMode, {
    passive: true,
  });
  document.addEventListener("aniworld:ui-motion", refreshBackgroundMode, {
    passive: true,
  });
  document.addEventListener(
    "aniworld:notification",
    (event) => {
      const detail = event.detail || {};
      const baseY = Math.min(height * 0.32, 220);
      const baseX = width * (0.3 + Math.random() * 0.4);
      pushPressureWave(baseX, baseY);
      if (detail.level === "error" || String(detail.source || "").includes("Queue")) {
        pushPressureWave(width * (0.5 + (Math.random() - 0.5) * 0.12), baseY + 22);
      }
    },
    { passive: true },
  );

  resizeCanvas();

  if (!prefersReducedMotion && getBackgroundMode() !== "off") {
    animationFrame = window.requestAnimationFrame(tick);
  } else {
    drawFrame();
  }
})();
