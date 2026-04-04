# Customization Guide

This guide covers both permanent configuration and account-specific Web UI customization.

## 1. Understand what persists where

## Per-account preferences

These are stored in the web database per user:

- favorites
- stats scope
- search history
- UI settings
- browser notification settings

## Server-wide settings changed only in the Web UI

These can reset after restart unless you also persist them in `.env` or Docker environment variables:

- download path
- language separation
- disable English Sub
- Auto-Sync defaults
- experimental FilmPalast flag

## 2. Config file location

AniWorld Downloader loads environment variables from:

- Windows: `%USERPROFILE%\.aniworld\.env`
- Linux: `~/.aniworld/.env`
- macOS: `~/.aniworld/.env`

The repository also ships `src/aniworld/.env.example` as a reference.

## 3. Common `.env` settings

Below are the most important settings for this custom build.

### Downloads and paths

```env
ANIWORLD_DOWNLOAD_PATH=Downloads
ANIWORLD_LANG_SEPARATION=0
ANIWORLD_DISABLE_ENGLISH_SUB=0
ANIWORLD_NAMING_TEMPLATE="{title} ({year}) [imdbid-{imdbid}]/Season {season}/{title} S{season}E{episode}.mkv"
ANIWORLD_VIDEO_CODEC=copy
```

### Default language and provider

```env
ANIWORLD_LANGUAGE="German Dub"
ANIWORLD_PROVIDER=VOE
```

### Search and playback helpers

```env
ANIWORLD_USE_STO_SEARCH=0
ANIWORLD_ANISKIP=0
```

### Web UI auth and base URL

```env
ANIWORLD_WEB_ADMIN_USER=
ANIWORLD_WEB_ADMIN_PASS=
ANIWORLD_WEB_BASE_URL=
```

### OIDC / SSO

```env
ANIWORLD_OIDC_ISSUER_URL=
ANIWORLD_OIDC_CLIENT_ID=
ANIWORLD_OIDC_CLIENT_SECRET=
ANIWORLD_OIDC_DISPLAY_NAME=SSO
ANIWORLD_OIDC_ADMIN_USER=
ANIWORLD_OIDC_ADMIN_SUBJECT=
```

### Auto-Sync defaults

```env
ANIWORLD_SYNC_SCHEDULE=0
ANIWORLD_SYNC_LANGUAGE=German Dub
ANIWORLD_SYNC_PROVIDER=VOE
```

### Experimental features

```env
ANIWORLD_EXPERIMENTAL_FILMPALAST=0
```

## 4. Web UI settings

The current build includes a large number of account-specific UI controls.

## UI settings currently available

- Density
- UI Scale
- Theme Color
- Card Radius
- Animation Speed
- Content Width
- Modal Width
- Nav Size
- Table Density
- Background Effects

## Default search filters available

- default sort
- default genres
- default year from
- default year to
- favorites only by default
- downloaded only by default

## Browser notifications

You can configure:

- main browser notifications on/off
- Browse notifications
- Queue notifications
- Auto-Sync notifications
- Library notifications
- Settings notifications
- system/general notifications

Important:

- browser notifications require browser permission
- they work while the Web UI is open
- this build does not use a service worker for closed-tab push notifications

## 5. Custom paths

Settings supports custom named download paths.

Use them when:

- you have multiple disks
- you use a NAS mount
- you want separate libraries for different users or categories

Examples:

- `Anime SSD`
- `NAS`
- `Archive Drive`

## 6. Multi-user customization

With Web Auth enabled, each user can keep their own:

- favorites
- search history
- stats scope
- UI theme/settings
- browser notification settings

Admins can additionally manage:

- user creation
- role changes
- user deletion

## 7. Experimental FilmPalast

FilmPalast is hidden by default in this build because it is still marked experimental.

You can enable it in:

- `Settings > Development`

or via `.env` / Docker env:

```env
ANIWORLD_EXPERIMENTAL_FILMPALAST=1
```

## 8. Provider notes

The build currently exposes these provider options:

- VOE
- Vidhide
- Vidara
- Filemoon
- Vidmoly
- Vidoza
- Doodstream

Actual availability still depends on the source and episode.

## 9. Best practice for stable customization

If a setting should survive restarts, prefer one of these:

1. write it into `.env`
2. set it in Docker / Compose environment variables
3. use the Web UI only for account-specific preferences

That split will save you a lot of confusion later.
