# First Setup

This guide covers a fresh setup of the customized AniWorld Downloader build from this repository.

## 1. Choose your installation mode

### Use local source install if:

- you want to edit the project locally
- you want the latest custom UI/backend changes from this repo
- you are running it directly on your own PC

### Use Docker / Docker Compose if:

- you want an always-on host
- you want simpler server deployment
- you want cleaner isolation
- you want persistent app data without managing a Python environment manually

## 2. Prerequisites

## Windows

- Python 3.9 to 3.13 recommended
- FFmpeg installed and available in `PATH`
- a browser such as Chrome, Edge, or Firefox

Notes:

- Web UI mode is recommended on Windows
- the old terminal UI can still be limited by `curses` support on newer Python builds

## Linux

- Python 3.9 to 3.13
- `python3-venv`
- FFmpeg
- a browser

Typical package example on Debian / Ubuntu:

```bash
sudo apt update
sudo apt install -y python3 python3-venv ffmpeg
```

## macOS

- Python 3.9 to 3.13
- FFmpeg
- a browser

Typical Homebrew example:

```bash
brew install python ffmpeg
```

Optional:

- IINA if you want macOS-native playback integration

## 3. Important folders

AniWorld Downloader uses the same hidden config/app-data folder pattern across all platforms:

- Windows: `%USERPROFILE%\.aniworld`
- Linux: `~/.aniworld`
- macOS: `~/.aniworld`

That folder is where you will find:

- `.env`
- `aniworld.db`
- account data
- favorites
- search history
- stats archive
- UI preferences

Default download path:

- usually your user `Downloads` folder unless overridden

## 4. Local source setup on Windows

Open PowerShell in the project folder and run:

```powershell
cd <project-folder>
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install --upgrade pip
py -m pip install -e .
```

Start the Web UI:

```powershell
py -m aniworld -w
```

Enable local Web UI accounts from the start:

```powershell
py -m aniworld -w -wA
```

Expose to your LAN:

```powershell
py -m aniworld -w -wA --web-expose
```

## 5. Local source setup on Linux

```bash
cd <project-folder>
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
python -m aniworld -w
```

With local accounts:

```bash
python -m aniworld -w -wA
```

Expose to your LAN:

```bash
python -m aniworld -w -wA --web-expose
```

## 6. Local source setup on macOS

```bash
cd <project-folder>
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
python -m aniworld -w
```

With local accounts:

```bash
python -m aniworld -w -wA
```

Expose to your LAN:

```bash
python -m aniworld -w -wA --web-expose
```

## 7. First launch behavior

### Without `-wA`

- the Web UI opens without a login wall
- you use it directly

### With `-wA`

- the first run shows setup / login flow
- the first created user becomes admin
- after that, additional users can be created in `Settings > User Management`

## 8. What happens on the first start

On first start, the app may:

- create the `~/.aniworld` folder
- create the web database
- install or validate browser/runtime dependencies
- create your first account if Web Auth is enabled

## 9. Verify the setup

After the Web UI starts:

1. Open the app in your browser.
2. Open a search result.
3. Open the queue modal.
4. Open Settings and confirm server info, UI settings, and paths are visible.

If all of that works, your installation is healthy.

## 10. Basic troubleshooting

### Port already in use

Use a different port:

```bash
python -m aniworld -w --web-port 8090
```

Windows:

```powershell
py -m aniworld -w --web-port 8090
```

### Browser shows stale UI after updates

Use a hard refresh:

- Windows / Linux: `Ctrl + F5`
- macOS: `Cmd + Shift + R`

### Windows terminal mode fails because of `curses`

Use the Web UI mode:

```powershell
py -m aniworld -w
```

### FFmpeg not found

Install FFmpeg and ensure it is available in your shell `PATH`.

### Want more than the first-run basics

Continue with:

- [Usage Guide](USAGE.md)
- [Customization Guide](CUSTOMIZATION.md)
- [Server Deployment Guide](SERVER-DEPLOYMENT.md)
