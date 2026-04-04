# Wiki Index

This folder is the practical documentation set for the customized AniWorld Downloader build in this repository.

## Recommended reading order

### If you are setting it up for the first time

1. [First Setup](FIRST-SETUP.md)
2. [Usage Guide](USAGE.md)
3. [Customization Guide](CUSTOMIZATION.md)

### If you are replacing an older setup

1. [Migration Guide](MIGRATION.md)
2. [First Setup](FIRST-SETUP.md)
3. [Customization Guide](CUSTOMIZATION.md)

### If you want to run it on a server

1. [Server Deployment Guide](SERVER-DEPLOYMENT.md)
2. [Customization Guide](CUSTOMIZATION.md)
3. [Usage Guide](USAGE.md)

## Documentation files

- [First Setup](FIRST-SETUP.md)
  Fresh local setup on Windows, Linux, and macOS.

- [Usage Guide](USAGE.md)
  How the Web UI is structured and what each page does.

- [Customization Guide](CUSTOMIZATION.md)
  `.env`, Web UI settings, per-user preferences, themes, background effects, notifications, and experimental features.

- [Migration Guide](MIGRATION.md)
  How to move from an older AniWorld Downloader install to this custom build, either cleanly or while keeping your data.

- [Server Deployment Guide](SERVER-DEPLOYMENT.md)
  Docker, Docker Compose, Linux systemd, reverse proxy notes, and server-specific recommendations.

## Fast facts

- Current version: `5.0.0`
- Main recommended mode: Web UI
- Config directory on all systems: `~/.aniworld` or `%USERPROFILE%\.aniworld`
- Stable sources: AniWorld, SerienStream / S.TO
- Experimental source: FilmPalast

## Important project-specific notes

- Queue and Timeline are separate now. Clearing finished queue items does not wipe Timeline.
- Favorites, stats, search history, UI settings, and browser notification preferences are per account.
- Browser notifications require an open browser tab. Service-worker push is intentionally not used.
- Some server-wide settings changed through the Web UI are temporary unless you persist them in `.env` or Docker environment variables.
