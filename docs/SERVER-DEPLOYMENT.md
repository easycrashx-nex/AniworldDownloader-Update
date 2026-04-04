# Server Deployment Guide

This guide covers the recommended ways to run this custom Web UI build on always-on systems.

## Recommended deployment order

For most people, use this order of preference:

1. Docker Compose
2. plain Docker
3. bare-metal Linux with systemd

If you run a NAS, mini PC, home server, VPS, or dedicated box, Docker Compose is usually the cleanest option.

## 1. Docker Compose

This repository already contains a tuned Compose setup.

Start it with:

```bash
docker-compose up -d --build
```

The current Compose stack already includes:

- Web UI start command
- LAN-ready binding
- no internal browser popup
- persistent downloads
- persistent app data
- local auth enabled by default
- healthcheck

### Important mounts

- `./Downloads:/app/Downloads`
- `aniworld-data:/home/aniworld/.aniworld`

### Important defaults in Compose

- `ANIWORLD_WEB_PORT=8080`
- `ANIWORLD_WEB_EXPOSE=1`
- `ANIWORLD_WEB_NO_BROWSER=1`
- `ANIWORLD_WEB_THREADS=16`
- `ANIWORLD_WEB_AUTH=1`
- `ANIWORLD_EXPERIMENTAL_FILMPALAST=0`

### Good Compose customizations

You can override these in `docker-compose.yaml` or an `.env` file:

- `ANIWORLD_WEB_PORT`
- `ANIWORLD_WEB_AUTH`
- `ANIWORLD_WEB_ADMIN_USER`
- `ANIWORLD_WEB_ADMIN_PASS`
- `ANIWORLD_WEB_BASE_URL`
- `ANIWORLD_SYNC_SCHEDULE`
- `ANIWORLD_SYNC_LANGUAGE`
- `ANIWORLD_SYNC_PROVIDER`
- `ANIWORLD_DOWNLOAD_PATH`

## 2. Plain Docker

### Linux / macOS

```bash
docker build -t aniworld .
docker run -d --name aniworld-downloader \
  -p 8080:8080 \
  -v "${PWD}/Downloads:/app/Downloads" \
  -v aniworld-data:/home/aniworld/.aniworld \
  -e ANIWORLD_WEB_AUTH=1 \
  aniworld
```

### Windows PowerShell

```powershell
docker build -t aniworld .
docker run -d --name aniworld-downloader `
  -p 8080:8080 `
  -v "${PWD}\Downloads:/app/Downloads" `
  -v aniworld-data:/home/aniworld/.aniworld `
  -e ANIWORLD_WEB_AUTH=1 `
  aniworld
```

## 3. Bare-metal Linux with systemd

This is useful if you do not want Docker.

### Example layout

- app folder: `/opt/aniworld`
- virtualenv: `/opt/aniworld/.venv`
- service user: `aniworld`

### Install

```bash
sudo mkdir -p /opt/aniworld
sudo chown "$USER":"$USER" /opt/aniworld
cd /opt/aniworld
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
```

### Example systemd service

Create `/etc/systemd/system/aniworld.service`:

```ini
[Unit]
Description=AniWorld Downloader Web UI
After=network.target

[Service]
Type=simple
User=aniworld
WorkingDirectory=/opt/aniworld
Environment=ANIWORLD_WEB_AUTH=1
Environment=ANIWORLD_WEB_ADMIN_USER=admin
Environment=ANIWORLD_WEB_ADMIN_PASS=change-me
ExecStart=/opt/aniworld/.venv/bin/python -m aniworld -w --web-expose --no-browser --web-port 8080
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aniworld
sudo systemctl status aniworld
```

## 4. Reverse proxy

If you expose the app through Nginx, Caddy, Traefik, or another reverse proxy, set:

```env
ANIWORLD_WEB_BASE_URL=https://your-domain.example
```

That helps redirects and auth flows use the public URL.

### Example Caddy

```caddy
aniworld.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

### Example Nginx

```nginx
server {
    listen 80;
    server_name aniworld.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 5. Which server type should use which method

### Home server / mini PC / HTPC

Use Docker Compose or local Python install.

### VPS / dedicated Linux server

Use Docker Compose or systemd.

### NAS / Docker-capable appliance

Use Docker Compose or the platform's container UI with the same mounts and env variables.

### Windows server host

Docker Desktop or a normal local source install is usually simpler than trying to mimic a Linux service stack.

## 6. Security recommendations

- enable `ANIWORLD_WEB_AUTH=1`
- set `ANIWORLD_WEB_ADMIN_USER` and `ANIWORLD_WEB_ADMIN_PASS` for unattended first boot
- use a reverse proxy with HTTPS if the app is reachable outside your LAN
- do not expose the app publicly without auth
- keep `.aniworld` persistent

## 7. Backups on servers

Back up these two things:

- download storage
- `.aniworld` data directory or Docker volume

Without `.aniworld`, you lose:

- accounts
- favorites
- stats archive
- search history
- UI preferences
- audit log
- Auto-Sync jobs

## 8. Health and monitoring

The Docker image and Compose file now include a healthcheck that probes the local web endpoint.

You should still monitor:

- container restart loops
- free disk space
- download destination permissions
- reverse proxy reachability

## 9. Recommended server defaults

For most always-on setups:

```env
ANIWORLD_WEB_AUTH=1
ANIWORLD_WEB_EXPOSE=1
ANIWORLD_WEB_NO_BROWSER=1
ANIWORLD_WEB_THREADS=16
ANIWORLD_EXPERIMENTAL_FILMPALAST=0
```

Then add your own:

- admin user/pass
- base URL
- Auto-Sync defaults
- path overrides
