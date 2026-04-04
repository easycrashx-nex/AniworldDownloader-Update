# Migration Guide

This guide explains how to move from an older AniWorld Downloader setup to this custom build.

## 1. Decide between two migration styles

## A. Keep your existing data

Choose this if you want to keep:

- downloads
- accounts
- favorites
- stats
- search history
- Auto-Sync jobs

## B. Start fresh

Choose this if you want:

- a clean database
- no old accounts
- no old queue/timeline leftovers
- no old settings

## 2. What to back up first

Always back up at least:

- your download folder
- your `.aniworld` folder

Platform paths:

- Windows: `%USERPROFILE%\.aniworld`
- Linux: `~/.aniworld`
- macOS: `~/.aniworld`

## 3. If you installed the old version with pip

### Windows PowerShell

```powershell
py -m pip uninstall aniworld
```

### Linux / macOS

```bash
python -m pip uninstall aniworld
```

Then install this source build:

- go to [First Setup](FIRST-SETUP.md)

## 4. If you used an older ZIP / source folder

You can either:

- keep the old folder as a backup and use a new folder for this build
- or replace the old folder in place

Recommended safe path:

1. keep the old project folder untouched
2. place this custom build in a new folder
3. create a fresh venv there
4. install the new build

## 5. If you want a clean reset of app data

### Safer approach: rename instead of deleting

#### Windows PowerShell

```powershell
Rename-Item "$HOME\\.aniworld" ".aniworld.backup"
```

#### Linux / macOS

```bash
mv ~/.aniworld ~/.aniworld.backup
```

Then start the new build. It will create a fresh `.aniworld`.

## 6. If you want to keep existing app data

Do not delete or rename `.aniworld`.

Then start the new build normally. It will reuse:

- existing accounts
- existing favorites
- existing DB data
- existing `.env`

This is the best option if you already rely on those.

## 7. Moving from an older Docker setup

### Stop the old stack

```bash
docker-compose down
```

or, if you used plain docker:

```bash
docker stop aniworld-downloader
docker rm aniworld-downloader
```

### Keep your existing Docker volume if you want to preserve data

The new Compose setup uses:

- `./Downloads` for downloads
- `aniworld-data` for `~/.aniworld`

If your previous setup already used compatible mounts/volumes, keep them and start the new stack.

### Start the new stack

```bash
docker-compose up -d --build
```

## 8. How to remove an old local project folder

Only do this after you have confirmed the new build is working.

Recommended:

- back up the old folder first
- delete it manually in Explorer / Finder / file manager
- or remove it from the shell only after confirming your new setup is healthy

## 9. Migration checklist

Use this after the first start of the new build:

- Web UI opens
- login works if auth is enabled
- Settings page loads
- Queue opens
- Timeline shows archive items
- Favorites open series modals correctly
- Library loads
- Auto-Sync page loads

If all of that works, the migration is complete.

## 10. Recommended migration path for most users

If you want the least risk:

1. back up `.aniworld`
2. back up downloads
3. uninstall old pip version if applicable
4. keep the old project folder as backup
5. install this custom build in a new folder
6. reuse the old `.aniworld` only if you want to keep your data
