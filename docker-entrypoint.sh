#!/bin/sh
set -eu

WEB_PORT="${ANIWORLD_WEB_PORT:-8080}"
WEB_EXPOSE="${ANIWORLD_WEB_EXPOSE:-1}"
WEB_NO_BROWSER="${ANIWORLD_WEB_NO_BROWSER:-1}"
XVFB_SCREEN="${ANIWORLD_XVFB_SCREEN:-1280x720x24}"

EXPOSE_FLAG=""
NO_BROWSER_FLAG=""

case "$(printf '%s' "$WEB_EXPOSE" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|on)
    EXPOSE_FLAG="--web-expose"
    ;;
esac

case "$(printf '%s' "$WEB_NO_BROWSER" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|on)
    NO_BROWSER_FLAG="--no-browser"
    ;;
esac

Xvfb :99 -screen 0 "$XVFB_SCREEN" -nolisten tcp &
XVFB_PID=$!
APP_PID=""

cleanup() {
  if [ -n "${APP_PID}" ]; then
    kill "$APP_PID" 2>/dev/null || true
  fi
  kill "$XVFB_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

sleep 1

aniworld --web-ui $EXPOSE_FLAG $NO_BROWSER_FLAG --web-port "$WEB_PORT" &
APP_PID=$!
wait "$APP_PID"
