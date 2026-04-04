FROM python:3.13-slim

WORKDIR /app

RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

# Install ffmpeg, Xvfb and system dependencies required by Chromium (patchright)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    xvfb \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Create an unprivileged user and pre-create the app/runtime directories it needs
# This avoids running the app as root and prevents permission issues at runtime
RUN adduser --disabled-password --gecos "" aniworld \
    && mkdir -p /app/Downloads /home/aniworld/.aniworld \
    && chown -R aniworld:aniworld /app /home/aniworld

# Container-friendly Python defaults:
# - Disable .pyc bytecode writes (keeps layers/volumes cleaner)
# - Unbuffer stdout/stderr so logs appear immediately
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Default download directory used by the application
ENV ANIWORLD_DOWNLOAD_PATH=/app/Downloads \
    ANIWORLD_WEB_PORT=8080 \
    ANIWORLD_WEB_EXPOSE=1 \
    ANIWORLD_WEB_NO_BROWSER=1 \
    ANIWORLD_WEB_THREADS=16

# Virtual display for headless Chromium (patchright) — headed mode works via Xvfb
ENV DISPLAY=:99

# Copy packaging metadata first to maximize Docker layer cache hits for dependency installs
COPY pyproject.toml /app/
COPY README.md LICENSE MANIFEST.in /app/

# Keep pip current
RUN pip install --no-cache-dir --upgrade pip

# Copy the application source code
COPY src/ /app/src/
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

# Install the project into the image
RUN pip install --no-cache-dir .

# Pre-install patchright Chromium into the image so it's available at runtime
RUN python -m patchright install chromium

# Ensure the runtime directories are still writable after COPY overwrote ownership
RUN chmod +x /app/docker-entrypoint.sh \
    && chown -R aniworld:aniworld /app /app/Downloads /home/aniworld/.aniworld

# Drop privileges for runtime
USER aniworld

VOLUME ["/app/Downloads", "/home/aniworld/.aniworld"]

# Expose the web UI port
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=8s --start-period=20s --retries=3 CMD python -c "import os,sys,urllib.request; port=os.getenv('ANIWORLD_WEB_PORT', '8080'); urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=5); sys.exit(0)"

# Start Xvfb and launch the web UI with Docker-friendly env-based defaults.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
