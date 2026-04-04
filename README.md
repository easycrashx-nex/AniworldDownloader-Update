<a id="readme-top"></a>

# AniWorld Downloader 5.0.0

This repository contains a customized AniWorld Downloader source build with a heavily expanded Web UI, multi-user support, per-account preferences, a persistent history/archive flow, Auto-Sync management, browser notifications, library comparison, provider health, audit logging, and a large amount of UI customization.

This README documents the build that exists in this repository right now, not the older upstream defaults.

## What This Build Includes

- modern Web UI for AniWorld and SerienStream / S.TO
- optional local account login for the Web UI
- favorites, stats, search history, UI settings, and browser notification preferences stored per account
- dedicated pages for Library, Favorites, Stats, Timeline, Radar, Auto-Sync, Provider Health, and Audit Log
- queue modal with live progress, bandwidth, retries, captcha handling, and cleanup actions
- timeline backed by a separate archive so clearing finished queue items does not wipe history
- library compare / missing episode detection against the source
- Auto-Sync with single, selected, and all-job sync triggers
- per-user notification center plus optional browser notifications
- large UI customization surface: density, scale, theme colors, radius, nav size, modal width, animation speed, table density, and background effects
- Docker and Docker Compose setup for local servers, VPS setups, NAS boxes, mini PCs, and other always-on hosts

## Stable vs Experimental

### Stable source targets

- AniWorld
- SerienStream / S.TO

### Experimental source target

- FilmPalast

FilmPalast is hidden by default and can be enabled in `Settings > Development`.

## Documentation Map

If you want the full setup and usage docs, start here:

- [Wiki Index](docs/WIKI.md)
- [First Setup](docs/FIRST-SETUP.md)
- [Usage Guide](docs/USAGE.md)
- [Customization Guide](docs/CUSTOMIZATION.md)
- [Migration Guide](docs/MIGRATION.md)
- [Server Deployment Guide](docs/SERVER-DEPLOYMENT.md)

## Quick Start

### Recommended local mode

The Web UI is the recommended mode for this build, especially on Windows.

#### Windows PowerShell

```powershell
cd <project-folder>
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install --upgrade pip
py -m pip install -e .
py -m aniworld -w
```

#### Linux

```bash
cd <project-folder>
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
python -m aniworld -w
```

#### macOS

```bash
cd <project-folder>
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
python -m aniworld -w
```

Expose the Web UI to your LAN if needed:

```bash
python -m aniworld -w --web-expose
```

On Windows, use:

```powershell
py -m aniworld -w --web-expose
```

### Recommended server mode

For server deployments, use Docker Compose:

```bash
docker-compose up -d --build
```

The current Compose file is already tuned for this custom Web UI build.

## Important Behavior Notes

### Config and data path

AniWorld Downloader stores its app data in:

- Windows: `%USERPROFILE%\.aniworld`
- Linux: `~/.aniworld`
- macOS: `~/.aniworld`

That folder contains things like:

- `.env`
- `aniworld.db`
- authentication data
- favorites / stats / search history / per-user preferences

### What is per-account

These are stored separately per logged-in user:

- favorites
- stats
- search history
- UI settings
- browser notification settings

### What is not automatically persistent when changed only in the Web UI

Some server-wide settings are intentionally temporary if you only change them inside the Web UI and then restart the app. Persist them in `.env` or Docker environment variables instead.

Typical examples:

- download path
- provider defaults
- language separation
- Auto-Sync defaults
- experimental source toggles

### Browser notifications

This build supports browser notifications, but they are not a service-worker push system. Notifications work while the Web UI is open in a browser tab or window. The PWA / service worker setup was intentionally removed to avoid stale-state and loading issues.

### Queue vs Timeline

- Queue is the live working area for active and pending jobs.
- Timeline is the archive/history view.

Clearing finished queue items does not clear Timeline anymore.

## Supported Provider Choices

The build currently exposes these provider options in the app:

- VOE
- Vidhide
- Vidara
- Filemoon
- Vidmoly
- Vidoza
- Doodstream

Availability still depends on the selected source, language, and the actual episode or movie page.

## Windows Note

The Web UI is strongly recommended on modern Windows Python setups. The old terminal UI depends on `curses`, which is more fragile on newer Windows Python versions, especially Python 3.14+.

## Migration From Older Installs

If you already have an older AniWorld Downloader setup and want to move to this custom build, use the migration guide:

- [Migration Guide](docs/MIGRATION.md)

That guide covers:

- old pip installs
- old ZIP / source-folder installs
- old Docker installs
- how to back up or reset your existing `.aniworld` data

## Docker Summary

This repository already includes:

- [Dockerfile](Dockerfile)
- [docker-compose.yaml](docker-compose.yaml)
- [docker-entrypoint.sh](docker-entrypoint.sh)
- [.dockerignore](.dockerignore)

The current Docker setup is designed for the Web UI and includes:

- persistent downloads
- persistent app data
- healthcheck
- Docker-friendly env defaults
- web auth enabled by default in Compose

Full server docs:

- [Server Deployment Guide](docs/SERVER-DEPLOYMENT.md)

## Legal Notice

AniWorld Downloader is a client-side tool. It does not host, upload, or distribute media itself. You are responsible for how you use it and for complying with applicable laws and the terms of the websites you access.

## License

This project is licensed under the [MIT License](LICENSE).

<p align="right">(<a href="#readme-top">back to top</a>)</p>
