import copy
import json
import os
import re
import socket
import threading
import time
from collections import deque

from flask import (
    Flask,
    Response,
    jsonify,
    redirect,
    render_template,
    request,
    stream_with_context,
    url_for,
)
from flask_wtf.csrf import CSRFProtect

from ..config import LANG_KEY_MAP, LANG_LABELS, SUPPORTED_PROVIDERS, VERSION
from ..extractors import provider_functions
from ..logger import get_logger
from ..providers import resolve_provider
from ..search import (
    fetch_new_animes,
    fetch_new_episodes,
    fetch_new_series,
    fetch_popular_animes,
    fetch_popular_series,
    query_filmpalast,
    query_s_to,
    random_anime,
)
from ..search import query as aniworld_query
from .db import (
    add_autosync_job,
    add_custom_path,
    add_favorite,
    add_to_queue,
    cancel_queue_item,
    clear_completed,
    delete_completed_queue_item,
    find_autosync_by_url,
    get_activity_chart,
    get_autosync_job,
    get_autosync_jobs,
    get_custom_path_by_id,
    get_custom_paths,
    get_download_history,
    get_favorite,
    get_general_stats,
    get_provider_quality,
    get_provider_health,
    get_search_suggestions,
    get_user_preference,
    get_recent_activity,
    list_audit_events,
    list_audit_users,
    list_recent_searches,
    get_recent_series_references,
    get_next_queued,
    get_queue,
    get_queue_stats,
    get_running,
    get_series_meta,
    get_sync_stats,
    init_autosync_db,
    init_custom_paths_db,
    init_favorites_db,
    init_audit_log_db,
    init_queue_db,
    init_search_history_db,
    init_series_meta_db,
    init_user_preferences_db,
    is_queue_cancelled,
    list_favorites,
    list_series_meta,
    move_queue_item,
    remove_autosync_job,
    remove_custom_path,
    remove_favorite,
    remove_from_queue,
    retry_failed_queue_items,
    retry_queue_item,
    record_audit_event,
    record_search_query,
    set_captcha_url,
    clear_captcha_url,
    set_user_preference,
    set_queue_status,
    touch_favorite,
    upsert_series_meta,
    update_autosync_job,
    update_queue_errors,
    update_queue_progress,
)

logger = get_logger(__name__)

_ENV_DOWNLOAD_PATH = "ANIWORLD_DOWNLOAD_PATH"
_ENV_LANG_SEPARATION = "ANIWORLD_LANG_SEPARATION"
_ENV_DISABLE_ENGLISH_SUB = "ANIWORLD_DISABLE_ENGLISH_SUB"
_ENV_SYNC_SCHEDULE = "ANIWORLD_SYNC_SCHEDULE"
_ENV_SYNC_LANGUAGE = "ANIWORLD_SYNC_LANGUAGE"
_ENV_SYNC_PROVIDER = "ANIWORLD_SYNC_PROVIDER"
_ENV_EXPERIMENTAL_FILMPALAST = "ANIWORLD_EXPERIMENTAL_FILMPALAST"


def _experimental_flags():
    return {
        "filmpalast": os.environ.get(_ENV_EXPERIMENTAL_FILMPALAST, "0") == "1"
    }


def _cache_scope_token(username):
    value = (username or "").strip()
    return value or "__anon__"


def _set_bool_env(name, enabled):
    os.environ[name] = "1" if enabled else "0"


def _resolved_download_path_value():
    from pathlib import Path

    raw = os.environ.get(_ENV_DOWNLOAD_PATH, "")
    if raw:
        path = Path(raw).expanduser()
        if not path.is_absolute():
            path = Path.home() / path
        return str(path)
    return str(Path.home() / "Downloads")


def _discover_local_ipv4_addresses():
    addresses = {"127.0.0.1"}

    try:
        hostname = socket.gethostname()
        for result in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = result[4][0]
            if ip and not ip.startswith("169.254."):
                addresses.add(ip)
    except OSError:
        pass

    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        ip = probe.getsockname()[0]
        if ip and not ip.startswith("169.254."):
            addresses.add(ip)
    except OSError:
        pass
    finally:
        try:
            probe.close()
        except Exception:
            pass

    return sorted(addresses)


def _server_network_info(app):
    host = str(app.config.get("WEB_HOST", "127.0.0.1")).strip() or "127.0.0.1"
    port = int(app.config.get("WEB_PORT", 8080))
    is_local_only = host in {"127.0.0.1", "localhost"}
    is_wildcard = host in {"0.0.0.0", "::"}

    if is_local_only:
        ip_addresses = ["127.0.0.1"]
        access_urls = [f"http://localhost:{port}"]
    elif is_wildcard:
        ip_addresses = _discover_local_ipv4_addresses()
        access_urls = [f"http://{ip}:{port}" for ip in ip_addresses]
    else:
        ip_addresses = [host]
        access_urls = [f"http://{host}:{port}"]

    return {
        "server_bind_host": host,
        "server_port": port,
        "server_ips": ip_addresses,
        "server_access_urls": access_urls,
        "server_scope": "Local only" if is_local_only else "LAN / exposed",
    }


def _normalize_ui_scale(value):
    scale = str(value or "100").strip()
    return scale if scale in {"90", "95", "100", "105", "110"} else "100"


def _normalize_ui_mode(value):
    mode = str(value or "cozy").strip().lower()
    return mode if mode in {"airy", "cozy", "compact", "tight"} else "cozy"


def _normalize_ui_theme(value):
    theme = str(value or "ocean").strip().lower()
    return (
        theme
        if theme
        in {
            "ocean",
            "mint",
            "sunset",
            "rose",
            "arctic",
            "forest",
            "ember",
            "amber",
            "lavender",
            "cobalt",
            "coral",
            "mono",
            "electric",
            "berry",
            "midnight",
            "jade",
            "crimson",
            "orchid",
            "citrus",
            "steel",
            "sapphire",
            "ruby",
            "plum",
            "sand",
            "glacier",
            "emerald",
            "neon",
            "peach",
            "sky",
            "bronze",
            "pearl",
            "slate",
            "lemon",
            "aqua",
            "indigo",
            "cherry",
            "lilac",
            "copper",
            "lime",
            "azure",
            "magma",
            "blush",
            "pine",
            "violet",
        }
        else "ocean"
    )


def _normalize_ui_radius(value):
    radius = str(value or "soft").strip().lower()
    return radius if radius in {"structured", "soft", "round"} else "soft"


def _normalize_ui_motion(value):
    motion = str(value or "normal").strip().lower()
    return motion if motion in {"slow", "normal", "fast"} else "normal"


def _normalize_ui_width(value):
    width = str(value or "standard").strip().lower()
    return width if width in {"standard", "wide"} else "standard"


def _normalize_ui_modal_width(value):
    width = str(value or "standard").strip().lower()
    return width if width in {"compact", "standard", "wide"} else "standard"


def _normalize_ui_nav_size(value):
    size = str(value or "standard").strip().lower()
    return size if size in {"compact", "standard", "large"} else "standard"


def _normalize_ui_table_density(value):
    density = str(value or "standard").strip().lower()
    return density if density in {"compact", "standard", "relaxed"} else "standard"


def _normalize_ui_background(value):
    background = str(value or "dynamic").strip().lower()
    return (
        background
        if background
        in {
            "dynamic",
            "cinematic",
            "subtle",
            "minimal",
            "aurora",
            "nebula",
            "frost",
            "ember",
            "grid",
            "pulse",
            "drift",
            "storm",
            "dusk",
            "bloom",
            "off",
        }
        else "dynamic"
    )


def _normalize_pref_bool(value):
    if isinstance(value, bool):
        return "1" if value else "0"
    return (
        "1"
        if str(value or "").strip().lower() in {"1", "true", "yes", "on"}
        else "0"
    )


def _normalize_search_default_sort(value):
    sort = str(value or "source").strip().lower()
    return (
        sort
        if sort in {"source", "year-desc", "year-asc", "title-asc", "title-desc"}
        else "source"
    )


def _normalize_search_default_genres(value):
    entries = []
    seen = set()
    for raw in str(value or "").split(","):
        clean = re.sub(r"\s+", " ", raw).strip()
        if not clean:
            continue
        key = clean.lower()
        if key in seen:
            continue
        seen.add(key)
        entries.append(clean[:32])
        if len(entries) >= 8:
            break
    return ", ".join(entries)


def _normalize_search_default_year(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        year = int(raw)
    except (TypeError, ValueError):
        return ""
    return str(year) if 1950 <= year <= 2099 else ""


def _settings_payload(
    ui_mode="cozy",
    ui_scale="100",
    ui_theme="ocean",
    ui_radius="soft",
    ui_motion="normal",
    ui_width="standard",
    ui_modal_width="standard",
    ui_nav_size="standard",
    ui_table_density="standard",
    ui_background="dynamic",
    search_default_sort="source",
    search_default_genres="",
    search_default_year_from="",
    search_default_year_to="",
    search_default_favorites_only="0",
    search_default_downloaded_only="0",
    browser_notifications_enabled="0",
    browser_notify_browse="1",
    browser_notify_queue="1",
    browser_notify_autosync="1",
    browser_notify_library="1",
    browser_notify_settings="1",
    browser_notify_system="1",
):
    return {
        "download_path": _resolved_download_path_value(),
        "lang_separation": os.environ.get(_ENV_LANG_SEPARATION, "0"),
        "disable_english_sub": os.environ.get(_ENV_DISABLE_ENGLISH_SUB, "0"),
        "experimental_filmpalast": os.environ.get(
            _ENV_EXPERIMENTAL_FILMPALAST, "0"
        ),
        "sync_schedule": os.environ.get(_ENV_SYNC_SCHEDULE, "0"),
        "sync_language": os.environ.get(_ENV_SYNC_LANGUAGE, "German Dub"),
        "sync_provider": os.environ.get(_ENV_SYNC_PROVIDER, "VOE"),
        "ui_mode": _normalize_ui_mode(ui_mode),
        "ui_scale": _normalize_ui_scale(ui_scale),
        "ui_theme": _normalize_ui_theme(ui_theme),
        "ui_radius": _normalize_ui_radius(ui_radius),
        "ui_motion": _normalize_ui_motion(ui_motion),
        "ui_width": _normalize_ui_width(ui_width),
        "ui_modal_width": _normalize_ui_modal_width(ui_modal_width),
        "ui_nav_size": _normalize_ui_nav_size(ui_nav_size),
        "ui_table_density": _normalize_ui_table_density(ui_table_density),
        "ui_background": _normalize_ui_background(ui_background),
        "search_default_sort": _normalize_search_default_sort(
            search_default_sort
        ),
        "search_default_genres": _normalize_search_default_genres(
            search_default_genres
        ),
        "search_default_year_from": _normalize_search_default_year(
            search_default_year_from
        ),
        "search_default_year_to": _normalize_search_default_year(
            search_default_year_to
        ),
        "search_default_favorites_only": _normalize_pref_bool(
            search_default_favorites_only
        ),
        "search_default_downloaded_only": _normalize_pref_bool(
            search_default_downloaded_only
        ),
        "browser_notifications_enabled": _normalize_pref_bool(
            browser_notifications_enabled
        ),
        "browser_notify_browse": _normalize_pref_bool(browser_notify_browse),
        "browser_notify_queue": _normalize_pref_bool(browser_notify_queue),
        "browser_notify_autosync": _normalize_pref_bool(browser_notify_autosync),
        "browser_notify_library": _normalize_pref_bool(browser_notify_library),
        "browser_notify_settings": _normalize_pref_bool(browser_notify_settings),
        "browser_notify_system": _normalize_pref_bool(browser_notify_system),
    }


def _get_working_providers():
    """Return only providers whose extractors are actually implemented."""
    working = []
    for p in SUPPORTED_PROVIDERS:
        func_name = f"get_direct_link_from_{p.lower()}"
        if func_name not in provider_functions:
            continue
        try:
            provider_functions[func_name]("")
        except NotImplementedError:
            continue
        except Exception:
            working.append(p)
    return tuple(working)


WORKING_PROVIDERS = _get_working_providers()
_WORKING_PROVIDER_PREFERENCE = (
    "VOE",
    "Vidhide",
    "Vidara",
    "Filemoon",
    "Vidmoly",
    "Vidoza",
    "Doodstream",
)

# Only match series-level links: /anime/stream/<slug> (no season/episode)
_SERIES_LINK_PATTERN = re.compile(r"^/anime/stream/[a-zA-Z0-9\-]+/?$", re.IGNORECASE)

# Only match s.to series-level links: /serie/<slug> (no season/episode)
_STO_SERIES_LINK_PATTERN = re.compile(
    r"^/serie/(stream/)?[a-zA-Z0-9\-]+/?$", re.IGNORECASE
)


def _ordered_working_providers():
    ordered = []
    seen = set()
    for provider_name in _WORKING_PROVIDER_PREFERENCE:
        if provider_name in WORKING_PROVIDERS and provider_name not in seen:
            ordered.append(provider_name)
            seen.add(provider_name)
    for provider_name in WORKING_PROVIDERS:
        if provider_name not in seen:
            ordered.append(provider_name)
            seen.add(provider_name)
    return tuple(ordered)


def _normalize_title_key(value):
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def _detect_site(series_url):
    url = (series_url or "").lower()
    if "filmpalast.to" in url:
        return "filmpalast"
    if "s.to" in url or "serienstream.to" in url:
        return "sto"
    return "aniworld"


def _absolute_asset_url(source_url, asset_url):
    if not asset_url:
        return None
    from urllib.parse import urljoin

    return urljoin(source_url, asset_url)


def _resolve_base_path(raw_value):
    from pathlib import Path

    if raw_value:
        path = Path(raw_value).expanduser()
        if not path.is_absolute():
            path = Path.home() / path
        return path
    return Path.home() / "Downloads"


def _get_scan_targets():
    raw = os.environ.get("ANIWORLD_DOWNLOAD_PATH", "")
    default_base = _resolve_base_path(raw)
    targets = [("Default", None, default_base)]
    for cp in get_custom_paths():
        targets.append((cp["name"], cp["id"], _resolve_base_path(cp["path"])))
    return targets


def _fetch_and_cache_series_meta(series_url):
    cached = get_series_meta(series_url)
    if cached and cached.get("poster_url"):
        return cached

    try:
        prov = resolve_provider(series_url)
        target = prov.series_cls(url=series_url) if prov.series_cls else prov.episode_cls(url=series_url)
        poster = _absolute_asset_url(
            series_url,
            getattr(target, "poster_url", None) or getattr(target, "image_url", None),
        )
        data = {
            "series_url": series_url,
            "title": getattr(target, "title", None)
            or getattr(target, "title_de", None),
            "poster_url": poster,
            "description": getattr(target, "description", None),
            "release_year": str(getattr(target, "release_year", "") or ""),
            "genres": getattr(target, "genres", []) or [],
        }
        upsert_series_meta(
            series_url=series_url,
            title=data["title"],
            poster_url=data["poster_url"],
            description=data["description"],
            release_year=data["release_year"],
            genres=data["genres"],
        )
        return data
    except Exception:
        return cached


def _build_series_reference_index():
    references = {}

    def _store(title, series_url, poster_url=None, site=None):
        if not title or not series_url:
            return
        key = _normalize_title_key(title)
        if not key:
            return
        current = references.get(key)
        candidate = {
            "title": title,
            "series_url": series_url,
            "poster_url": poster_url,
            "site": site,
        }
        if not current or (poster_url and not current.get("poster_url")):
            references[key] = candidate

    meta_by_url = {m["series_url"]: m for m in list_series_meta()}
    for favorite in list_favorites():
        meta = meta_by_url.get(favorite["series_url"], {})
        _store(
            favorite["title"],
            favorite["series_url"],
            favorite.get("poster_url") or meta.get("poster_url"),
            favorite.get("site"),
        )
    for ref in get_recent_series_references():
        meta = meta_by_url.get(ref["series_url"], {})
        site = _detect_site(ref["series_url"])
        _store(
            ref["title"],
            ref["series_url"],
            meta.get("poster_url"),
            site,
        )
    return references


def _find_series_reference(folder_name, references):
    folder_key = _normalize_title_key(folder_name)
    if not folder_key:
        return None

    best = None
    best_len = -1
    for ref_key, ref in references.items():
        if folder_key.startswith(ref_key) or ref_key.startswith(folder_key):
            if len(ref_key) > best_len:
                best = ref
                best_len = len(ref_key)
    return best


def _scan_library_snapshot(include_meta=True):
    from pathlib import Path

    lang_sep = os.environ.get("ANIWORLD_LANG_SEPARATION", "0") == "1"
    lang_folders = ["german-dub", "english-sub", "german-sub", "english-dub"]
    ep_re = re.compile(r"S(\d{2})E(\d{2,3})", re.IGNORECASE)
    video_exts = {
        ".mkv",
        ".mp4",
        ".avi",
        ".webm",
        ".flv",
        ".mov",
        ".wmv",
        ".m4v",
        ".ts",
    }

    references = _build_series_reference_index() if include_meta else {}
    fetched_meta = 0
    fetch_limit = 8

    summary = {
        "titles": 0,
        "episodes": 0,
        "total_size": 0,
        "by_location": [],
        "by_language": [],
    }

    location_totals = {}
    language_totals = {}

    def _enrich_title(entry):
        nonlocal fetched_meta
        if not include_meta:
            entry["series_url"] = None
            entry["poster_url"] = None
            entry["site"] = None
            return entry

        ref = _find_series_reference(entry["folder"], references)
        entry["series_url"] = ref["series_url"] if ref else None
        entry["poster_url"] = ref.get("poster_url") if ref else None
        entry["site"] = ref.get("site") if ref else None

        if entry["series_url"] and not entry["poster_url"] and fetched_meta < fetch_limit:
            meta = _fetch_and_cache_series_meta(entry["series_url"])
            if meta and meta.get("poster_url"):
                entry["poster_url"] = meta["poster_url"]
                fetched_meta += 1

        return entry

    def _scan_base(base, lang_name=None):
        titles = {}
        if not base.is_dir():
            return []

        lang_folder_set = set(lang_folders)
        for folder in base.iterdir():
            if not folder.is_dir():
                continue
            if folder.name in lang_folder_set:
                continue

            entry = titles.setdefault(
                folder.name,
                {
                    "folder": folder.name,
                    "seasons": {},
                    "total_size": 0,
                },
            )
            for file_path in folder.rglob("*"):
                if not file_path.is_file() or file_path.name.startswith(".temp_"):
                    continue
                match = ep_re.search(file_path.name)
                if not match:
                    continue
                season_num = int(match.group(1))
                episode_num = int(match.group(2))
                is_video = file_path.suffix.lower() in video_exts
                try:
                    file_size = file_path.stat().st_size
                except OSError:
                    file_size = 0

                season_key = str(season_num)
                entry["seasons"].setdefault(season_key, [])
                if not any(
                    item["episode"] == episode_num and item["file"] == file_path.name
                    for item in entry["seasons"][season_key]
                ):
                    entry["seasons"][season_key].append(
                        {
                            "episode": episode_num,
                            "file": file_path.name,
                            "size": file_size,
                            "is_video": is_video,
                        }
                    )
                    entry["total_size"] += file_size

            if lang_name:
                language_totals.setdefault(lang_name, {"episodes": 0, "total_size": 0})
                language_totals[lang_name]["total_size"] += entry["total_size"]

        result = []
        for entry in sorted(titles.values(), key=lambda item: item["folder"].lower()):
            if not any(entry["seasons"].values()):
                continue
            total_eps = sum(
                sum(1 for item in episodes if item.get("is_video", True))
                for episodes in entry["seasons"].values()
            )
            for season_key in entry["seasons"]:
                entry["seasons"][season_key].sort(key=lambda item: item["episode"])
            entry["total_episodes"] = total_eps
            if lang_name:
                language_totals[lang_name]["episodes"] += total_eps
            result.append(_enrich_title(entry))
        return result

    locations = []
    for label, cp_id, base_path in _get_scan_targets():
        loc_total_eps = 0
        loc_total_size = 0
        if lang_sep:
            loc_lang_folders = []
            for lang_folder in lang_folders:
                titles = _scan_base(base_path / lang_folder, lang_folder)
                if titles:
                    eps = sum(item["total_episodes"] for item in titles)
                    size = sum(item["total_size"] for item in titles)
                    loc_total_eps += eps
                    loc_total_size += size
                    loc_lang_folders.append(
                        {
                            "name": lang_folder,
                            "titles": titles,
                            "total_episodes": eps,
                            "total_size": size,
                        }
                    )
            if not loc_lang_folders:
                continue
            locations.append(
                {
                    "label": label,
                    "custom_path_id": cp_id,
                    "lang_folders": loc_lang_folders,
                    "titles": None,
                }
            )
        else:
            titles = _scan_base(base_path)
            if not titles:
                continue
            loc_total_eps = sum(item["total_episodes"] for item in titles)
            loc_total_size = sum(item["total_size"] for item in titles)
            locations.append(
                {
                    "label": label,
                    "custom_path_id": cp_id,
                    "lang_folders": None,
                    "titles": titles,
                }
            )

        location_totals[label] = {
            "episodes": loc_total_eps,
            "total_size": loc_total_size,
        }
        summary["episodes"] += loc_total_eps
        summary["total_size"] += loc_total_size

    seen_titles = set()
    for location in locations:
        if location.get("lang_folders"):
            for lang_folder in location["lang_folders"]:
                for title in lang_folder["titles"]:
                    seen_titles.add(
                        (
                            location["label"],
                            lang_folder["name"],
                            title["folder"],
                        )
                    )
        else:
            for title in location["titles"]:
                seen_titles.add((location["label"], title["folder"]))

    summary["titles"] = len(seen_titles)
    summary["by_location"] = [
        {"label": key, **value}
        for key, value in sorted(location_totals.items(), key=lambda item: item[0].lower())
    ]
    summary["by_language"] = [
        {"language": key, **value}
        for key, value in sorted(language_totals.items(), key=lambda item: item[0])
    ]

    return {"lang_sep": lang_sep, "locations": locations, "summary": summary}


# Queue worker state
_queue_worker_started = False
_queue_lock = threading.Lock()

# Auto-sync worker state
_autosync_worker_started = False

# Track jobs currently being synced to prevent duplicate runs
_syncing_jobs = set()
_syncing_jobs_lock = threading.Lock()

# Schedule intervals in seconds
SYNC_SCHEDULE_MAP = {
    "1min": 60,
    "30min": 1800,
    "1h": 3600,
    "2h": 7200,
    "4h": 14400,
    "8h": 28800,
    "12h": 43200,
    "16h": 57600,
    "24h": 86400,
}

_ui_events = deque(maxlen=120)
_ui_event_seq = 0
_ui_event_lock = threading.Lock()
_ui_event_condition = threading.Condition(_ui_event_lock)
_ui_event_last_emit = {}
_runtime_cache = {}
_runtime_cache_lock = threading.Lock()
_runtime_cache_warmer_started = False
_runtime_cache_warmer_lock = threading.Lock()


def _cache_get(key, ttl_seconds):
    now = time.monotonic()
    with _runtime_cache_lock:
        entry = _runtime_cache.get(key)
        if not entry:
            return None
        if now - entry["stored_at"] >= ttl_seconds:
            _runtime_cache.pop(key, None)
            return None
        return copy.deepcopy(entry["value"])


def _cache_set(key, value):
    cached_value = copy.deepcopy(value)
    with _runtime_cache_lock:
        _runtime_cache[key] = {
            "stored_at": time.monotonic(),
            "value": cached_value,
        }
    return copy.deepcopy(cached_value)


def _cache_invalidate(*prefixes):
    if not prefixes:
        return
    with _runtime_cache_lock:
        for key in list(_runtime_cache.keys()):
            if any(key.startswith(prefix) for prefix in prefixes):
                _runtime_cache.pop(key, None)


def _warm_runtime_caches_once():
    """Populate the heaviest runtime caches in the background."""
    try:
        _get_cached_library_snapshot(include_meta=False)
    except Exception as exc:
        logger.warning("Warmup for lightweight library snapshot failed: %s", exc)

    try:
        _get_cached_library_snapshot(include_meta=True)
    except Exception as exc:
        logger.warning("Warmup for library snapshot failed: %s", exc)

    try:
        _get_cached_library_compare(refresh=True)
    except Exception as exc:
        logger.warning("Warmup for library compare failed: %s", exc)


def _warm_runtime_caches_startup():
    """Do a startup warmup so the first library/stats view is fast."""
    started_at = time.monotonic()
    logger.info("Starting cache warmup for library/stats surfaces")
    _warm_runtime_caches_once()
    logger.info(
        "Finished cache warmup for library/stats surfaces in %.1fs",
        time.monotonic() - started_at,
    )


def _ensure_runtime_cache_warmer():
    global _runtime_cache_warmer_started
    with _runtime_cache_warmer_lock:
        if _runtime_cache_warmer_started:
            return
        _runtime_cache_warmer_started = True

    def _worker():
        try:
            interval = int(os.environ.get("ANIWORLD_CACHE_WARM_INTERVAL", "180"))
        except ValueError:
            interval = 180
        interval = max(60, min(interval, 1800))

        # Warm once right after startup, then refresh periodically.
        while True:
            _warm_runtime_caches_once()
            time.sleep(interval)

    threading.Thread(target=_worker, daemon=True, name="aniworld-cache-warmer").start()


def _emit_ui_event(*channels, min_interval=0.75):
    normalized = tuple(sorted({ch for ch in channels if ch}))
    if not normalized:
        return

    if any(
        channel in normalized
        for channel in ("queue", "autosync", "dashboard", "library", "settings", "favorites")
    ):
        _cache_invalidate("stats:", "dashboard:")
    if any(channel in normalized for channel in ("library", "settings", "favorites")):
        _cache_invalidate("library:")

    now = time.monotonic()
    with _ui_event_condition:
        last_emit = _ui_event_last_emit.get(normalized, 0.0)
        if now - last_emit < min_interval:
            return
        _ui_event_last_emit[normalized] = now

        global _ui_event_seq
        _ui_event_seq += 1
        _ui_events.append(
            {
                "seq": _ui_event_seq,
                "channels": list(normalized),
                "emitted_at": time.time(),
            }
        )
        _ui_event_condition.notify_all()


def _pending_ui_events(after_seq):
    return [event for event in _ui_events if event["seq"] > after_seq]


def _extract_provider_info(provider_data):
    disable_eng_sub = os.environ.get("ANIWORLD_DISABLE_ENGLISH_SUB", "0") == "1"
    provider_info = {}

    if hasattr(provider_data, "_data"):
        lang_tuple_to_label = {}
        for key, (audio, subtitles) in LANG_KEY_MAP.items():
            label = LANG_LABELS.get(key)
            if label:
                lang_tuple_to_label[(audio.value, subtitles.value)] = label

        for (audio, subtitles), providers in provider_data._data.items():
            label = lang_tuple_to_label.get((audio.value, subtitles.value))
            if not label:
                continue
            if disable_eng_sub and label == "English Sub":
                continue
            working = [p for p in providers.keys() if p in WORKING_PROVIDERS]
            if working:
                provider_info[label] = working
        return provider_info

    sto_label_map = {
        ("German", "None"): "German Dub",
        ("English", "None"): "English Dub",
    }
    for (audio, subtitles), providers in provider_data.items():
        label = sto_label_map.get((audio.value, subtitles.value))
        if not label:
            continue
        working = [p for p in providers.keys() if p in WORKING_PROVIDERS]
        if working:
            provider_info[label] = working
    return provider_info


def _episode_language_labels_for_ui(episode, allow_provider_lookup=False):
    labels = list(getattr(episode, "available_languages", []) or [])
    if not allow_provider_lookup:
        return labels

    try:
        provider_info = _extract_provider_info(episode.provider_data)
        if provider_info:
            return list(provider_info.keys())
    except Exception:
        pass

    return labels


def _rank_provider_candidates(candidates, preferred=None, exclude=None):
    quality_rows = {row["provider"]: row for row in get_provider_quality()}
    ordered = list(dict.fromkeys([name for name in candidates if name and name != exclude]))
    position_map = {name: index for index, name in enumerate(ordered)}

    def _score(name):
        row = quality_rows.get(name, {})
        completed = int(row.get("completed") or 0)
        failed = int(row.get("failed") or 0)
        total = completed + failed
        success_rate = completed / total if total else 0.5
        return (
            0 if name == preferred else 1,
            -success_rate,
            -completed,
            failed,
            position_map[name],
            name.lower(),
        )

    return sorted(ordered, key=_score)


def _get_provider_candidates_for_episode(ep_url, language, preferred=None, exclude=None):
    try:
        prov = resolve_provider(ep_url)
        episode = prov.episode_cls(url=ep_url)
        provider_map = _extract_provider_info(episode.provider_data)
        return _rank_provider_candidates(
            provider_map.get(language, []),
            preferred=preferred,
            exclude=exclude,
        )
    except Exception:
        return []


def _ordered_language_labels(labels):
    seen = set()
    ordered = []
    preferred = list(dict.fromkeys(LANG_LABELS.values()))
    extras = []

    for label in labels or []:
        clean = str(label or "").strip()
        if not clean or clean in seen:
            continue
        seen.add(clean)
        if clean in preferred:
            continue
        extras.append(clean)

    for label in preferred:
        if label in seen:
            ordered.append(label)

    ordered.extend(sorted(extras))
    return ordered


def _collect_autosync_provider_options(series_url, sample_limit=12):
    provider_map = {}

    def _merge(info):
        for language, providers in (info or {}).items():
            working = [name for name in providers if name in WORKING_PROVIDERS]
            if not working:
                continue
            bucket = provider_map.setdefault(language, set())
            bucket.update(working)

    try:
        prov = resolve_provider(series_url)
    except Exception:
        return {}

    sampled = 0

    try:
        if prov.series_cls and prov.season_cls:
            series = prov.series_cls(url=series_url)
            for season_ref in list(getattr(series, "seasons", []) or []):
                try:
                    season_obj = prov.season_cls(url=season_ref.url, series=series)
                except Exception:
                    season_obj = season_ref
                for episode in list(getattr(season_obj, "episodes", []) or []):
                    try:
                        _merge(_extract_provider_info(episode.provider_data))
                    except Exception:
                        continue
                    sampled += 1
                    if sampled >= sample_limit:
                        break
                if sampled >= sample_limit and provider_map:
                    break
        else:
            episode = prov.episode_cls(url=series_url)
            _merge(_extract_provider_info(episode.provider_data))
    except Exception:
        return {}

    normalized = {}
    for language, providers in provider_map.items():
        ranked = _rank_provider_candidates(list(providers))
        if ranked:
            normalized[language] = ranked
    return normalized


def _providers_for_all_languages(provider_map):
    provider_sets = [set(items or []) for items in provider_map.values() if items]
    if not provider_sets:
        return []

    shared = set(provider_sets[0])
    for provider_set in provider_sets[1:]:
        shared &= provider_set

    if shared:
        return _rank_provider_candidates(list(shared))

    merged = set()
    for provider_set in provider_sets:
        merged |= provider_set
    return _rank_provider_candidates(list(merged))


def _build_autosync_job_options(job):
    current_language = str(job.get("language") or "German Dub").strip() or "German Dub"
    current_provider = str(job.get("provider") or "VOE").strip() or "VOE"
    detected_map = _collect_autosync_provider_options(job.get("series_url", ""))
    providers_by_language = {key: list(value) for key, value in detected_map.items()}
    detected = bool(providers_by_language)

    if not providers_by_language:
        fallback_language = (
            current_language if current_language != "All Languages" else "German Dub"
        )
        fallback_provider = (
            current_provider
            if current_provider in WORKING_PROVIDERS
            else (WORKING_PROVIDERS[0] if WORKING_PROVIDERS else "")
        )
        providers_by_language = {fallback_language: [fallback_provider] if fallback_provider else []}

    languages = _ordered_language_labels(providers_by_language.keys())
    allow_all_languages = (
        (os.environ.get("ANIWORLD_LANG_SEPARATION", "0") == "1")
        or current_language == "All Languages"
    ) and len(languages) > 1
    all_language_providers = (
        _providers_for_all_languages(providers_by_language)
        if allow_all_languages
        else []
    )

    if current_language == "All Languages" and allow_all_languages:
        selected_language = "All Languages"
        selected_providers = all_language_providers
    else:
        selected_language = (
            current_language if current_language in providers_by_language else languages[0]
        )
        selected_providers = providers_by_language.get(selected_language, [])

    selected_provider = (
        current_provider
        if current_provider in selected_providers
        else (selected_providers[0] if selected_providers else "")
    )

    return {
        "detected": detected,
        "languages": languages,
        "providers_by_language": providers_by_language,
        "allow_all_languages": allow_all_languages,
        "all_language_providers": all_language_providers,
        "selected_language": selected_language,
        "selected_provider": selected_provider,
    }


def _pick_retry_provider(queue_item):
    try:
        episodes = json.loads(queue_item["episodes"] or "[]")
    except Exception:
        episodes = []
    if not episodes:
        return queue_item["provider"]

    next_candidates = _get_provider_candidates_for_episode(
        episodes[0],
        queue_item["language"],
        exclude=queue_item["provider"],
    )
    return next_candidates[0] if next_candidates else queue_item["provider"]


def _download_episode_with_fallback(item, ep_url, selected_path):
    from ..playwright import captcha as _captcha_mod

    providers_to_try = [item["provider"]]
    tried = []
    errors = []
    attempt_details = []

    while providers_to_try:
        provider_name = providers_to_try.pop(0)
        if provider_name in tried:
            continue
        tried.append(provider_name)

        try:
            prov = resolve_provider(ep_url)
            ep_kwargs = {
                "url": ep_url,
                "selected_language": item["language"],
                "selected_provider": provider_name,
            }
            if selected_path:
                ep_kwargs["selected_path"] = selected_path
            episode = prov.episode_cls(**ep_kwargs)
            _captcha_mod._local.queue_id = item["id"]
            try:
                episode.download()
            finally:
                _captcha_mod._local.queue_id = None
            return provider_name
        except Exception as exc:
            _captcha_mod._local.queue_id = None
            logger.warning(
                "Provider %s failed for %s: %s",
                provider_name,
                ep_url,
                exc,
            )
            attempt_details.append(
                {
                    "provider": provider_name,
                    "message": str(exc),
                }
            )
            errors.append(f"{provider_name}: {exc}")
            if len(tried) == 1:
                fallback_candidates = _get_provider_candidates_for_episode(
                    ep_url,
                    item["language"],
                    exclude=provider_name,
                )
                for candidate in fallback_candidates:
                    if candidate not in tried and candidate not in providers_to_try:
                        providers_to_try.append(candidate)

    err = RuntimeError(" | ".join(errors) if errors else "All providers failed")
    err.attempt_details = attempt_details
    raise err


def _build_nav_state(username=None):
    queue = get_queue_stats(username=username)
    sync = get_sync_stats(username=username)
    return {
        "active_queue": int(queue.get("by_status", {}).get("queued", 0))
        + int(queue.get("by_status", {}).get("running", 0)),
        "failed_queue": int(queue.get("by_status", {}).get("failed", 0)),
        "favorites": len(list_favorites(username=username)),
        "autosync_enabled": int(sync.get("enabled", 0)),
    }


def _get_cached_library_snapshot(include_meta=True):
    cache_key = f"library:{1 if include_meta else 0}"
    cached = _cache_get(cache_key, 300.0)
    if cached is not None:
        return cached
    snapshot = _scan_library_snapshot(include_meta=include_meta)
    return _cache_set(cache_key, snapshot)


def _queue_episode_urls(queue_item):
    try:
        entries = json.loads(queue_item.get("episodes") or "[]")
    except Exception:
        entries = []
    return [str(entry or "").strip() for entry in entries if str(entry or "").strip()]


def _episode_label_from_url(url):
    match = re.search(r"staffel-(\d+)/episode-(\d+)", str(url or ""), re.IGNORECASE)
    if match:
        return f"S{int(match.group(1)):02d}E{int(match.group(2)):03d}"
    movie_match = re.search(r"filme/film-(\d+)", str(url or ""), re.IGNORECASE)
    if movie_match:
        return f"Movie {int(movie_match.group(1))}"
    return str(url or "").strip()


def _filter_conflicting_queue_episodes(series_url, language, episode_urls, exclude_queue_id=None):
    requested = [
        str(url or "").strip()
        for url in (episode_urls or [])
        if str(url or "").strip()
    ]
    requested_set = set(requested)
    if not requested_set:
        return {"episodes": [], "skipped": 0, "conflicts": []}

    overlapping = set()
    conflicts = []

    for item in get_queue():
        if exclude_queue_id and item.get("id") == exclude_queue_id:
            continue
        if item.get("status") not in {"queued", "running"}:
            continue
        if item.get("series_url") != series_url:
            continue
        if language and item.get("language") != language:
            continue

        item_episode_urls = set(_queue_episode_urls(item))
        overlap = sorted(requested_set & item_episode_urls)
        if not overlap:
            continue

        overlapping.update(overlap)
        conflicts.append(
            {
                "queue_id": item.get("id"),
                "status": item.get("status"),
                "language": item.get("language"),
                "provider": item.get("provider"),
                "overlap_count": len(overlap),
                "overlap": overlap[:8],
                "overlap_labels": [_episode_label_from_url(url) for url in overlap[:8]],
            }
        )

    filtered = [url for url in requested if url not in overlapping]
    return {
        "episodes": filtered,
        "skipped": len(requested) - len(filtered),
        "conflicts": conflicts,
    }


def _library_title_episode_index(title):
    index = {}
    total = 0
    for season_key, episodes in (title.get("seasons") or {}).items():
        season_number = str(season_key)
        values = sorted(
            {
                int(item.get("episode"))
                for item in (episodes or [])
                if item.get("is_video", True) and item.get("episode")
            }
        )
        if values:
            index[season_number] = values
            total += len(values)
    return {"seasons": index, "total_episodes": total}


def _get_cached_source_episode_index(series_url):
    cache_key = f"library:source:{series_url}"
    cached = _cache_get(cache_key, 180.0)
    if cached is not None:
        return cached

    try:
        prov = resolve_provider(series_url)
        if not prov.series_cls or not prov.season_cls:
            return _cache_set(
                cache_key,
                {"available": False, "reason": "unsupported", "source": getattr(prov, "name", "")},
            )

        series = prov.series_cls(url=series_url)
        seasons = {}
        total = 0
        for season_ref in list(getattr(series, "seasons", []) or []):
            season_obj = prov.season_cls(url=season_ref.url, series=series)
            values = sorted(
                {
                    int(getattr(episode, "episode_number", 0))
                    for episode in list(getattr(season_obj, "episodes", []) or [])
                    if getattr(episode, "episode_number", 0)
                }
            )
            if not values:
                continue
            season_number = str(getattr(season_obj, "season_number", 0) or 0)
            seasons[season_number] = values
            total += len(values)

        return _cache_set(
            cache_key,
            {
                "available": True,
                "source": getattr(prov, "name", "") or "Source",
                "season_count": len(seasons),
                "total_episodes": total,
                "seasons": seasons,
            },
        )
    except Exception as exc:
        logger.warning("Library compare failed for %s: %s", series_url, exc)
        return _cache_set(
            cache_key,
            {"available": False, "reason": "error", "error": str(exc), "source": "Source"},
        )


def _compare_title_with_source(title):
    series_url = str(title.get("series_url") or "").strip()
    if not series_url:
        return {"available": False, "reason": "unlinked"}

    source_index = _get_cached_source_episode_index(series_url)
    if not source_index.get("available"):
        return source_index

    local_index = _library_title_episode_index(title)
    local_seasons = local_index["seasons"]
    remote_seasons = source_index.get("seasons", {})
    missing = []
    extra = []

    for season_key, remote_values in remote_seasons.items():
        local_values = set(local_seasons.get(season_key, []))
        remote_set = set(remote_values)
        for episode_number in sorted(remote_set - local_values):
            missing.append(f"S{int(season_key):02d}E{int(episode_number):03d}")

    for season_key, local_values in local_seasons.items():
        remote_values = set(remote_seasons.get(season_key, []))
        local_set = set(local_values)
        for episode_number in sorted(local_set - remote_values):
            extra.append(f"S{int(season_key):02d}E{int(episode_number):03d}")

    return {
        "available": True,
        "source": source_index.get("source") or "Source",
        "season_count": source_index.get("season_count", 0),
        "remote_total_episodes": source_index.get("total_episodes", 0),
        "local_total_episodes": local_index.get("total_episodes", 0),
        "missing_count": len(missing),
        "extra_count": len(extra),
        "missing_sample": missing[:8],
        "extra_sample": extra[:6],
        "in_sync": not missing,
    }


def _get_cached_library_compare(refresh=False):
    cache_key = "library:compare"
    if refresh:
        _cache_invalidate(cache_key)
    cached = _cache_get(cache_key, 300.0)
    if cached is not None:
        return cached

    snapshot = _get_cached_library_snapshot(include_meta=True)
    items = {}
    summary = {
        "compared": 0,
        "in_sync": 0,
        "out_of_sync": 0,
        "titles_missing": 0,
        "missing_episodes": 0,
        "unavailable": 0,
    }

    seen_urls = set()
    for location in snapshot.get("locations", []):
        title_groups = []
        if location.get("lang_folders"):
            for lang_folder in location["lang_folders"]:
                title_groups.extend(lang_folder.get("titles", []))
        else:
            title_groups.extend(location.get("titles", []))

        for title in title_groups:
            series_url = str(title.get("series_url") or "").strip()
            if not series_url or series_url in seen_urls:
                continue
            seen_urls.add(series_url)
            compare = _compare_title_with_source(title)
            items[series_url] = compare

            if compare.get("available"):
                summary["compared"] += 1
                if compare.get("missing_count", 0) > 0:
                    summary["out_of_sync"] += 1
                    summary["titles_missing"] += 1
                    summary["missing_episodes"] += int(compare.get("missing_count", 0))
                else:
                    summary["in_sync"] += 1
            else:
                summary["unavailable"] += 1

    payload = {"items": items, "summary": summary, "checked_at": int(time.time())}
    return _cache_set(cache_key, payload)


def _get_cached_stats_payload(username=None):
    cache_key = f"stats:summary:{_cache_scope_token(username)}"
    cached = _cache_get(cache_key, 45.0)
    if cached is not None:
        return cached

    general = get_general_stats(username=username)
    queue = get_queue_stats(username=username)
    sync = get_sync_stats(username=username)
    try:
        storage_snapshot = _get_cached_library_snapshot(include_meta=True)
        storage_summary = storage_snapshot.get("summary", {})
    except Exception as exc:
        logger.warning("Stats storage snapshot failed: %s", exc)
        storage_summary = {
            "titles": 0,
            "episodes": 0,
            "total_size": 0,
            "by_location": [],
            "by_language": [],
            "available": False,
            "error": str(exc),
        }
    payload = {
        "general": general,
        "queue": queue,
        "sync": sync,
        "storage": storage_summary,
        "provider_quality": get_provider_quality(username=username),
        "activity_chart": get_activity_chart(7, username=username),
    }
    return _cache_set(cache_key, payload)


def _queue_worker():
    """Single global worker that processes one download at a time."""
    while True:
        try:
            item = None
            with _queue_lock:
                if not get_running():
                    item = get_next_queued()
                    if item:
                        set_queue_status(item["id"], "running")
                        _emit_ui_event("queue", "dashboard", "nav")

            if not item:
                time.sleep(3)
                continue

            episodes = json.loads(item["episodes"])
            errors = []

            # Language separation: compute subfolder path if enabled
            import os

            lang_sep = os.environ.get("ANIWORLD_LANG_SEPARATION", "0") == "1"
            if item.get("source") == "sync:all_langs":
                lang_sep = True
            selected_path = None

            from pathlib import Path

            # Determine base path: custom path or default
            custom_path_id = item.get("custom_path_id")
            if custom_path_id:
                cp = get_custom_path_by_id(custom_path_id)
                if cp:
                    base = Path(cp["path"]).expanduser()
                    if not base.is_absolute():
                        base = Path.home() / base
                else:
                    base = None
            else:
                base = None

            if base is None:
                raw = os.environ.get("ANIWORLD_DOWNLOAD_PATH", "")
                if raw:
                    base = Path(raw).expanduser()
                    if not base.is_absolute():
                        base = Path.home() / base
                else:
                    base = Path.home() / "Downloads"

            if lang_sep:
                lang_folder_map = {
                    "German Dub": "german-dub",
                    "English Sub": "english-sub",
                    "German Sub": "german-sub",
                    "English Dub": "english-dub",
                }
                lang_folder = lang_folder_map.get(
                    item["language"], item["language"].lower().replace(" ", "-")
                )
                selected_path = str(base / lang_folder)
            elif custom_path_id:
                selected_path = str(base)

            for i, ep_url in enumerate(episodes):
                update_queue_progress(item["id"], i, ep_url)
                _emit_ui_event("queue", min_interval=0.35)
                try:
                    _download_episode_with_fallback(item, ep_url, selected_path)
                except Exception as e:
                    logger.error(f"Download failed for {ep_url}: {e}")
                    attempt_details = getattr(e, "attempt_details", None) or []
                    errors.append(
                        {
                            "url": ep_url,
                            "error": str(e),
                            "providers_tried": [
                                detail.get("provider")
                                for detail in attempt_details
                                if detail.get("provider")
                            ],
                            "attempts": attempt_details,
                        }
                    )
                    update_queue_errors(item["id"], json.dumps(errors))
                    _emit_ui_event("queue", "dashboard", "nav", min_interval=0.35)

                # Check for cancellation after each episode
                if is_queue_cancelled(item["id"]):
                    logger.info(f"Download cancelled for queue item {item['id']}")
                    update_queue_progress(item["id"], i + 1, "")
                    _emit_ui_event("queue", "dashboard", "nav", min_interval=0.35)
                    break

            # Only set final status if not already cancelled
            if not is_queue_cancelled(item["id"]):
                update_queue_progress(item["id"], len(episodes), "")
                status = (
                    "failed" if errors and len(errors) == len(episodes) else "completed"
                )
                set_queue_status(item["id"], status)
                record_audit_event(
                    "download.completed" if status == "completed" else "download.failed",
                    username=item.get("username"),
                    subject_type="download",
                    subject=item.get("title"),
                    details={
                        "queue_id": item["id"],
                        "series_url": item.get("series_url"),
                        "language": item.get("language"),
                        "provider": item.get("provider"),
                        "status": status,
                        "errors": errors[:4],
                    },
                )
                _emit_ui_event("queue", "dashboard", "library", "nav")

        except Exception as e:
            logger.error(f"Queue worker error: {e}", exc_info=True)
            time.sleep(3)


def _ensure_queue_worker():
    """Start the queue worker thread once."""
    global _queue_worker_started
    if _queue_worker_started:
        return
    _queue_worker_started = True

    from .db import get_db

    conn = get_db()
    try:
        conn.execute(
            "UPDATE download_queue SET status = 'queued' WHERE status = 'running'"
        )
        conn.execute("UPDATE download_queue SET captcha_url = NULL")
        conn.commit()
    finally:
        conn.close()

    thread = threading.Thread(target=_queue_worker, daemon=True)
    thread.start()


def _run_autosync_for_job(job):
    """Check a single autosync job for new/missing episodes and queue them."""
    import os
    from datetime import datetime
    from pathlib import Path

    job_id = job["id"]
    with _syncing_jobs_lock:
        if job_id in _syncing_jobs:
            logger.info("Auto-sync skipped job %d - already running", job_id)
            return
        _syncing_jobs.add(job_id)

    try:
        prov = resolve_provider(job["series_url"])
        if not prov.series_cls or not prov.season_cls:
            logger.warning(
                "Auto-sync skipped job %d for episode-only source: %s",
                job_id,
                job["series_url"],
            )
            update_autosync_job(
                job_id,
                last_check=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            )
            return
        series = prov.series_cls(url=job["series_url"])

        lang_sep = os.environ.get("ANIWORLD_LANG_SEPARATION", "0") == "1"
        # Only use lang_sep for "All Languages" when the global setting is enabled;
        # otherwise scan root directory to avoid phantom missing-episode detection.
        if job.get("language") == "All Languages" and not lang_sep:
            logger.warning(
                "Auto-sync job '%s' uses 'All Languages' but lang_separation is off - scanning root.",
                job.get("title", "?"),
            )

        lang_folder_map = {
            "German Dub": "german-dub",
            "English Sub": "english-sub",
            "German Sub": "german-sub",
            "English Dub": "english-dub",
        }

        target_languages = []
        if job.get("language") == "All Languages":
            disable_eng_sub = os.environ.get("ANIWORLD_DISABLE_ENGLISH_SUB", "0") == "1"
            for lang in lang_folder_map.keys():
                if disable_eng_sub and lang == "English Sub":
                    continue
                target_languages.append(lang)
        else:
            target_languages.append(job["language"])

        total_new_queued = 0
        total_episodes_found = 0

        for target_lang in target_languages:
            job_lang_folder = lang_folder_map.get(
                target_lang, target_lang.lower().replace(" ", "-")
            )

            raw = os.environ.get("ANIWORLD_DOWNLOAD_PATH", "")
            if raw:
                dl_base = Path(raw).expanduser()
                if not dl_base.is_absolute():
                    dl_base = Path.home() / dl_base
            else:
                dl_base = Path.home() / "Downloads"

            scan_roots = [dl_base]
            for cp in get_custom_paths():
                cp_path = Path(cp["path"]).expanduser()
                if not cp_path.is_absolute():
                    cp_path = Path.home() / cp_path
                scan_roots.append(cp_path)

            # Build set of downloaded (season, episode) on disk
            downloaded_eps = set()
            title_clean = (
                getattr(series, "title_cleaned", None) or getattr(series, "title", "")
            ).lower()
            if title_clean:
                ep_re = re.compile(r"S(\d{2})E(\d{2,3})", re.IGNORECASE)
                all_bases = []
                for root in scan_roots:
                    if lang_sep:
                        all_bases.append(root / job_lang_folder)
                    else:
                        all_bases.append(root)
                for base in all_bases:
                    if not base.is_dir():
                        continue
                    for folder in base.iterdir():
                        if not folder.is_dir() or not folder.name.lower().startswith(
                            title_clean
                        ):
                            continue
                        for f in folder.rglob("*"):
                            if f.is_file():
                                m = ep_re.search(f.name)
                                if m:
                                    downloaded_eps.add(
                                        (int(m.group(1)), int(m.group(2)))
                                    )

            # Collect all episode URLs that are NOT yet downloaded
            missing_episodes = []
            lang_total_found = 0
            for season in series.seasons:
                season_obj = prov.season_cls(url=season.url, series=series)
                for ep in season_obj.episodes:
                    # Depending on provider, might need to pre-filter by language here
                    # But the downloader expects full episode URLs and it will pick the right language within them.
                    lang_total_found += 1
                    key = (ep.season.season_number, ep.episode_number)
                    if key not in downloaded_eps:
                        missing_episodes.append(ep.url)

            # In "All Languages" mode we want to make sure the specific language is actually
            # available on this episode before downloading? For VOE/Vidoza, it downloads what is chosen.
            # If a language isn't available, the extractor fails, which is fine (handled in queue).
            # But the queue item will contain episodes.

            # We use max of lang_total_found for updating stats (usually they are same across languages)
            if lang_total_found > total_episodes_found:
                total_episodes_found = lang_total_found

            if missing_episodes:
                conflict_guard = _filter_conflicting_queue_episodes(
                    job["series_url"],
                    target_lang,
                    missing_episodes,
                )
                queueable_episodes = conflict_guard["episodes"]
                if not queueable_episodes:
                    logger.info(
                        "Auto-sync skipped '%s' (%s) - all %d episode(s) already queued/running",
                        job["title"],
                        target_lang,
                        len(missing_episodes),
                    )
                    continue

                if conflict_guard["skipped"]:
                    logger.info(
                        "Auto-sync trimmed %d conflicting episode(s) for '%s' (%s)",
                        conflict_guard["skipped"],
                        job["title"],
                        target_lang,
                    )

                total_new_queued += len(queueable_episodes)
                add_to_queue(
                    title=job["title"],
                    series_url=job["series_url"],
                    episodes=queueable_episodes,
                    language=target_lang,
                    provider=job["provider"],
                    username=job.get("added_by"),
                    custom_path_id=job.get("custom_path_id"),
                    source="sync:all_langs"
                    if job.get("language") == "All Languages"
                    else "sync",
                )
                logger.info(
                    "Auto-sync queued %d episodes for '%s' (%s)",
                    len(queueable_episodes),
                    job["title"],
                    target_lang,
                )
                _emit_ui_event("autosync", "queue", "dashboard", "nav")

        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        update_fields = {
            "last_check": now_str,
            "episodes_found": total_episodes_found,
        }

        if total_new_queued > 0:
            update_fields["last_new_found"] = now_str

        update_autosync_job(job["id"], **update_fields)
        _emit_ui_event("autosync", "dashboard", "nav", "settings")
    except Exception as e:
        logger.error("Auto-sync failed for '%s': %s", job.get("title", "?"), e)
        from datetime import datetime

        update_autosync_job(
            job["id"],
            last_check=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        )
        _emit_ui_event("autosync", "settings")
    finally:
        with _syncing_jobs_lock:
            _syncing_jobs.discard(job_id)


def _autosync_worker():
    """Background thread that periodically syncs all enabled autosync jobs.

    Uses short-polling (every 10 s) and checks each job's last_check
    against the configured interval so that schedule changes take effect
    immediately instead of blocking in a long sleep.
    """
    import os
    from datetime import datetime, timedelta

    while True:
        try:
            schedule_key = os.environ.get("ANIWORLD_SYNC_SCHEDULE", "0")
            interval = SYNC_SCHEDULE_MAP.get(schedule_key, 0)
            if not interval:
                time.sleep(10)
                continue

            now = datetime.utcnow()
            jobs = get_autosync_jobs()
            for job in jobs:
                if not job.get("enabled"):
                    continue
                # Per-job check: only run if enough time has elapsed
                last_check = job.get("last_check")
                if last_check:
                    try:
                        last_dt = datetime.strptime(last_check, "%Y-%m-%d %H:%M:%S")
                    except (ValueError, TypeError):
                        last_dt = datetime.min
                    if now < last_dt + timedelta(seconds=interval):
                        continue
                _run_autosync_for_job(job)

            time.sleep(10)
        except Exception as e:
            logger.error("Auto-sync worker error: %s", e, exc_info=True)
            time.sleep(30)


def _ensure_autosync_worker():
    """Start the auto-sync worker thread once."""
    global _autosync_worker_started
    if _autosync_worker_started:
        return
    _autosync_worker_started = True
    thread = threading.Thread(target=_autosync_worker, daemon=True)
    thread.start()


def _get_version():
    return VERSION or ""


def create_app(auth_enabled=False, sso_enabled=False, force_sso=False):
    import os

    app = Flask(__name__)
    app_version = _get_version()

    base_url = os.environ.get("ANIWORLD_WEB_BASE_URL", "").strip().rstrip("/")
    if base_url:
        from urllib.parse import urlparse

        parsed = urlparse(base_url)
        scheme = parsed.scheme or "https"
        host = parsed.netloc

        # WSGI middleware that overrides scheme/host before Flask sees the request
        _inner_wsgi = app.wsgi_app

        def _proxy_wsgi(environ, start_response):
            environ["wsgi.url_scheme"] = scheme
            if host:
                environ["HTTP_HOST"] = host
            return _inner_wsgi(environ, start_response)

        app.wsgi_app = _proxy_wsgi

    if auth_enabled:
        from .auth import (
            auth_bp,
            get_current_user,
            get_or_create_secret_key,
            init_oidc,
            login_required,
            refresh_session_role,
        )
        from .db import has_any_admin, init_db

        app.secret_key = get_or_create_secret_key()
        app.config["SESSION_COOKIE_HTTPONLY"] = True
        app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
        if base_url.startswith("https"):
            app.config["SESSION_COOKIE_SECURE"] = True
        app.config["PERMANENT_SESSION_LIFETIME"] = 86400  # 24 hours

        csrf = CSRFProtect()

        init_db()
        app.register_blueprint(auth_bp)
        csrf.init_app(app)

        if sso_enabled:
            init_oidc(app, force_sso=force_sso)
        else:
            app.config["OIDC_ENABLED"] = False
            app.config["OIDC_DISPLAY_NAME"] = "SSO"
            app.config["OIDC_ADMIN_USER"] = None
            app.config["OIDC_ADMIN_SUBJECT"] = None
            app.config["FORCE_SSO"] = False

        @app.before_request
        def _check_setup():
            if request.endpoint and request.endpoint.startswith("auth."):
                return None
            if request.endpoint == "static":
                return None
            if not app.config.get("FORCE_SSO", False) and not has_any_admin():
                return redirect(url_for("auth.setup"))
            return None

        @app.before_request
        def _refresh_role():
            return refresh_session_role()

        @app.context_processor
        def _inject_auth():
            user = get_current_user()
            username = (
                user.get("username")
                if isinstance(user, dict)
                else getattr(user, "username", None)
            )
            return {
                "current_user": user,
                "auth_enabled": True,
                "oidc_enabled": app.config.get("OIDC_ENABLED", False),
                "oidc_display_name": app.config.get("OIDC_DISPLAY_NAME", "SSO"),
                "force_sso": app.config.get("FORCE_SSO", False),
                "app_version": app_version,
                "experimental_flags": _experimental_flags(),
                "ui_mode": _normalize_ui_mode(
                    get_user_preference(username, "ui_mode", "cozy")
                ),
                "ui_scale": get_user_preference(username, "ui_scale", "100"),
                "ui_theme": _normalize_ui_theme(
                    get_user_preference(username, "ui_theme", "ocean")
                ),
                "ui_radius": _normalize_ui_radius(
                    get_user_preference(username, "ui_radius", "soft")
                ),
                "ui_motion": _normalize_ui_motion(
                    get_user_preference(username, "ui_motion", "normal")
                ),
                "ui_width": get_user_preference(username, "ui_width", "standard"),
                "ui_modal_width": _normalize_ui_modal_width(
                    get_user_preference(username, "ui_modal_width", "standard")
                ),
                "ui_nav_size": _normalize_ui_nav_size(
                    get_user_preference(username, "ui_nav_size", "standard")
                ),
                "ui_table_density": _normalize_ui_table_density(
                    get_user_preference(
                        username, "ui_table_density", "standard"
                    )
                ),
                "ui_background": _normalize_ui_background(
                    get_user_preference(username, "ui_background", "dynamic")
                ),
                "search_default_sort": _normalize_search_default_sort(
                    get_user_preference(username, "search_default_sort", "source")
                ),
                "search_default_genres": _normalize_search_default_genres(
                    get_user_preference(username, "search_default_genres", "")
                ),
                "search_default_year_from": _normalize_search_default_year(
                    get_user_preference(username, "search_default_year_from", "")
                ),
                "search_default_year_to": _normalize_search_default_year(
                    get_user_preference(username, "search_default_year_to", "")
                ),
                "search_default_favorites_only": _normalize_pref_bool(
                    get_user_preference(
                        username, "search_default_favorites_only", "0"
                    )
                ),
                "search_default_downloaded_only": _normalize_pref_bool(
                    get_user_preference(
                        username, "search_default_downloaded_only", "0"
                    )
                ),
            }
    else:

        @app.context_processor
        def _inject_no_auth():
            return {
                "current_user": None,
                "auth_enabled": False,
                "oidc_enabled": False,
                "oidc_display_name": "SSO",
                "force_sso": False,
                "app_version": app_version,
                "experimental_flags": _experimental_flags(),
                "ui_mode": _normalize_ui_mode(
                    get_user_preference(None, "ui_mode", "cozy")
                ),
                "ui_scale": get_user_preference(None, "ui_scale", "100"),
                "ui_theme": _normalize_ui_theme(
                    get_user_preference(None, "ui_theme", "ocean")
                ),
                "ui_radius": _normalize_ui_radius(
                    get_user_preference(None, "ui_radius", "soft")
                ),
                "ui_motion": _normalize_ui_motion(
                    get_user_preference(None, "ui_motion", "normal")
                ),
                "ui_width": get_user_preference(None, "ui_width", "standard"),
                "ui_modal_width": _normalize_ui_modal_width(
                    get_user_preference(None, "ui_modal_width", "standard")
                ),
                "ui_nav_size": _normalize_ui_nav_size(
                    get_user_preference(None, "ui_nav_size", "standard")
                ),
                "ui_table_density": _normalize_ui_table_density(
                    get_user_preference(None, "ui_table_density", "standard")
                ),
                "ui_background": _normalize_ui_background(
                    get_user_preference(None, "ui_background", "dynamic")
                ),
                "search_default_sort": _normalize_search_default_sort(
                    get_user_preference(None, "search_default_sort", "source")
                ),
                "search_default_genres": _normalize_search_default_genres(
                    get_user_preference(None, "search_default_genres", "")
                ),
                "search_default_year_from": _normalize_search_default_year(
                    get_user_preference(None, "search_default_year_from", "")
                ),
                "search_default_year_to": _normalize_search_default_year(
                    get_user_preference(None, "search_default_year_to", "")
                ),
                "search_default_favorites_only": _normalize_pref_bool(
                    get_user_preference(None, "search_default_favorites_only", "0")
                ),
                "search_default_downloaded_only": _normalize_pref_bool(
                    get_user_preference(
                        None, "search_default_downloaded_only", "0"
                    )
                ),
            }

    # Initialize download queue, custom paths and autosync (works with or without auth)
    init_queue_db()
    init_custom_paths_db()
    init_autosync_db()
    init_favorites_db()
    init_series_meta_db()
    init_search_history_db()
    init_user_preferences_db()
    init_audit_log_db()

    # Wire up captcha hooks so the Playwright module can signal the Web UI
    from ..playwright import captcha as _captcha_mod
    _captcha_mod._on_captcha_start = set_captcha_url
    _captcha_mod._on_captcha_end = clear_captcha_url

    # In debug mode, Flask's reloader runs this in both the parent and child
    # process. Only start workers in the child (actual server) process
    # to avoid duplicate ffmpeg downloads.
    _debug = os.getenv("ANIWORLD_DEBUG_MODE", "0") == "1"
    if not _debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        _ensure_queue_worker()
        _ensure_autosync_worker()

    @app.after_request
    def _set_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )
        return response

    @app.before_request
    def _enforce_json_content_type():
        """Reject non-JSON POST/PUT/DELETE on API routes to prevent form-based CSRF bypass."""
        if request.method in ("POST", "PUT", "DELETE") and request.path.startswith(
            "/api/"
        ):
            if request.content_length and request.content_length > 0:
                ct = request.content_type or ""
                if not ct.startswith("application/json"):
                    return jsonify(
                        {"error": "Content-Type must be application/json"}
                    ), 415

    def _series_modal_template_context():
        return {
            "lang_labels": LANG_LABELS,
            "sto_lang_labels": {"1": "German Dub", "2": "English Dub"},
            "supported_providers": _ordered_working_providers(),
        }

    @app.route("/")
    def index():
        return render_template("index.html", **_series_modal_template_context())

    @app.route("/stats")
    def stats_page():
        return render_template("stats.html")

    @app.route("/favorites")
    def favorites_page():
        return render_template("favorites.html", **_series_modal_template_context())

    @app.route("/timeline")
    def timeline_page():
        return render_template("timeline.html")

    @app.route("/radar")
    def radar_page():
        return render_template("radar.html")

    @app.route("/api/search", methods=["POST"])
    def api_search():
        data = request.get_json(silent=True) or {}
        keyword = (data.get("keyword") or "").strip()
        site = (data.get("site") or "aniworld").strip()
        if not keyword:
            return jsonify({"error": "keyword is required"}), 400

        results = []

        if site == "filmpalast":
            filmpalast_results = query_filmpalast(keyword) or []
            if isinstance(filmpalast_results, dict):
                filmpalast_results = [filmpalast_results]
            for item in filmpalast_results:
                link = (item.get("link") or "").strip()
                if not link:
                    continue
                if link.startswith("/"):
                    url = f"https://filmpalast.to{link}"
                elif link.startswith("http"):
                    url = link
                else:
                    url = f"https://filmpalast.to/{link.lstrip('/')}"
                results.append(
                    {
                        "title": item.get("title", "Unknown"),
                        "url": url,
                        "poster_url": item.get("poster_url") or "",
                    }
                )
        elif site == "sto":
            # s.to search
            sto_results = query_s_to(keyword) or []
            if isinstance(sto_results, dict):
                sto_results = [sto_results]
            for item in sto_results:
                link = item.get("link", "")
                if _STO_SERIES_LINK_PATTERN.match(link):
                    title = (
                        item.get("title", "Unknown")
                        .replace("<em>", "")
                        .replace("</em>", "")
                    )
                    results.append(
                        {
                            "title": title,
                            "url": f"https://s.to{link}",
                        }
                    )
        else:
            # AniWorld search
            aw_results = aniworld_query(keyword) or []
            if isinstance(aw_results, dict):
                aw_results = [aw_results]
            for item in aw_results:
                link = item.get("link", "")
                if _SERIES_LINK_PATTERN.match(link):
                    title = (
                        item.get("title", "Unknown")
                        .replace("<em>", "")
                        .replace("</em>", "")
                    )
                    results.append(
                        {
                            "title": title,
                            "url": f"https://aniworld.to{link}",
                        }
                    )

        if results:
            username, _ = _get_current_user_info()
            record_search_query(site, keyword, username=username)
        return jsonify({"results": results})

    @app.route("/api/search/suggestions")
    def api_search_suggestions():
        site = (request.args.get("site") or "aniworld").strip()
        query = (request.args.get("q") or "").strip()
        username, _ = _get_current_user_info()
        suggestions = get_search_suggestions(
            site, query=query, limit=8, username=username
        )
        recent = list_recent_searches(site, limit=6, username=username)
        return jsonify({"suggestions": suggestions, "recent": recent})

    @app.route("/api/series")
    def api_series():
        url = request.args.get("url", "").strip()
        if not url:
            return jsonify({"error": "url is required"}), 400

        try:
            prov = resolve_provider(url)
            target = prov.series_cls(url=url) if prov.series_cls else prov.episode_cls(url=url)
            poster = _absolute_asset_url(
                url,
                getattr(target, "poster_url", None) or getattr(target, "image_url", None),
            )
            title = getattr(target, "title", None) or getattr(target, "title_de", None)
            upsert_series_meta(
                series_url=url,
                title=title,
                poster_url=poster,
                description=getattr(target, "description", ""),
                release_year=str(getattr(target, "release_year", "") or ""),
                genres=getattr(target, "genres", []) or [],
            )
            username, _ = _get_current_user_info()
            touch_favorite(url, username=username)
            return jsonify(
                {
                    "title": title,
                    "poster_url": poster,
                    "description": getattr(target, "description", ""),
                    "genres": getattr(target, "genres", []),
                    "release_year": getattr(target, "release_year", ""),
                    "is_favorite": bool(get_favorite(url, username=username)),
                    "auto_sync_supported": bool(prov.series_cls),
                }
            )
        except Exception as e:
            logger.error(f"Series fetch failed: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500

    @app.route("/api/seasons")
    def api_seasons():
        url = request.args.get("url", "").strip()
        if not url:
            return jsonify({"error": "url is required"}), 400

        try:
            prov = resolve_provider(url)
            if not prov.series_cls or not prov.season_cls:
                return jsonify(
                    {
                        "seasons": [
                            {
                                "url": url,
                                "season_number": 1,
                                "episode_count": 1,
                                "are_movies": True,
                            }
                        ]
                    }
                )
            series = prov.series_cls(url=url)
            seasons_data = []
            for season in series.seasons:
                seasons_data.append(
                    {
                        "url": season.url,
                        "season_number": season.season_number,
                        "episode_count": season.episode_count,
                        "are_movies": getattr(season, "are_movies", False),
                    }
                )
            return jsonify({"seasons": seasons_data})
        except Exception as e:
            logger.error(f"Seasons fetch failed: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500

    @app.route("/api/episodes")
    def api_episodes():
        url = request.args.get("url", "").strip()
        if not url:
            return jsonify({"error": "url is required"}), 400

        try:
            prov = resolve_provider(url)
            if not prov.series_cls or not prov.season_cls:
                episode = prov.episode_cls(url=url)
                downloaded = bool(getattr(episode, "is_downloaded", {}).get("exists"))
                if not downloaded:
                    for custom_path in get_custom_paths():
                        episode.selected_path = str(
                            _resolve_base_path(custom_path.get("path"))
                        )
                        downloaded = bool(
                            getattr(episode, "is_downloaded", {}).get("exists")
                        )
                        if downloaded:
                            break
                return jsonify(
                    {
                        "episodes": [
                            {
                                "url": episode.url,
                                "episode_number": 1,
                                "title_de": getattr(episode, "title", None)
                                or getattr(episode, "title_de", "")
                                or "",
                                "title_en": "",
                                "downloaded": downloaded,
                                "languages": _episode_language_labels_for_ui(
                                    episode, allow_provider_lookup=True
                                ),
                            }
                        ]
                    }
                )
            # Pass series to avoid broken series URL reconstruction in s.to
            # season model (its fallback splits on "-" which fails)
            series_url = re.sub(r"/staffel-\d+/?$", "", url)
            series_url = re.sub(r"/filme/?$", "", series_url)
            try:
                series = prov.series_cls(url=series_url)
            except Exception:
                series = None
            season = prov.season_cls(url=url, series=series)

            # Scan download directory for downloaded episodes.
            # Uses S##E### filename matching so it works regardless of
            # which NAMING_TEMPLATE was active when files were downloaded.
            from pathlib import Path

            lang_sep = os.environ.get("ANIWORLD_LANG_SEPARATION", "0") == "1"
            lang_folders = ["german-dub", "english-sub", "german-sub", "english-dub"]

            raw = os.environ.get("ANIWORLD_DOWNLOAD_PATH", "")
            if raw:
                dl_base = Path(raw).expanduser()
                if not dl_base.is_absolute():
                    dl_base = Path.home() / dl_base
            else:
                dl_base = Path.home() / "Downloads"

            # Collect all scan roots: default + custom paths
            scan_roots = [dl_base]
            for cp in get_custom_paths():
                cp_path = Path(cp["path"]).expanduser()
                if not cp_path.is_absolute():
                    cp_path = Path.home() / cp_path
                scan_roots.append(cp_path)

            # Build set of (season_num, episode_num) found on disk
            downloaded_eps = set()
            try:
                title_clean = ""
                if series:
                    title_clean = (
                        getattr(series, "title_cleaned", None)
                        or getattr(series, "title", "")
                    ).lower()
                if title_clean:
                    ep_re = re.compile(r"S(\d{2})E(\d{2,3})", re.IGNORECASE)
                    all_bases = []
                    for root in scan_roots:
                        if lang_sep:
                            all_bases.extend([root / lf for lf in lang_folders])
                        else:
                            all_bases.append(root)
                    for base in all_bases:
                        if not base.is_dir():
                            continue
                        for folder in base.iterdir():
                            if (
                                not folder.is_dir()
                                or not folder.name.lower().startswith(title_clean)
                            ):
                                continue
                            for f in folder.rglob("*"):
                                if f.is_file():
                                    m = ep_re.search(f.name)
                                    if m:
                                        downloaded_eps.add(
                                            (int(m.group(1)), int(m.group(2)))
                                        )
            except Exception:
                pass

            allow_episode_language_lookup = prov.name in ("SerienStream", "AniWorld")

            episodes_data = []
            for ep in season.episodes:
                downloaded = (
                    ep.season.season_number,
                    ep.episode_number,
                ) in downloaded_eps

                episodes_data.append(
                    {
                        "url": ep.url,
                        "episode_number": ep.episode_number,
                        "title_de": getattr(ep, "title_de", ""),
                        "title_en": getattr(ep, "title_en", ""),
                        "downloaded": downloaded,
                        "languages": _episode_language_labels_for_ui(
                            ep,
                            allow_provider_lookup=allow_episode_language_lookup,
                        ),
                    }
                )
            return jsonify({"episodes": episodes_data})
        except Exception as e:
            logger.error(f"Episodes fetch failed: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500

    @app.route("/api/providers")
    def api_providers():
        url = request.args.get("url", "").strip()
        if not url:
            return jsonify({"error": "url is required"}), 400

        try:
            prov = resolve_provider(url)
            episode = prov.episode_cls(url=url)
            provider_info = _extract_provider_info(episode.provider_data)
            default_language = next(iter(provider_info.keys()), None)
            availability = []

            if hasattr(episode, "provider_availability"):
                availability = list(getattr(episode, "provider_availability") or [])
            else:
                seen_names = set()
                for language, providers in provider_info.items():
                    for provider_name in providers:
                        if provider_name in seen_names:
                            continue
                        seen_names.add(provider_name)
                        availability.append(
                            {
                                "name": provider_name,
                                "supported": True,
                                "languages": [
                                    lang_name
                                    for lang_name, items in provider_info.items()
                                    if provider_name in items
                                ],
                            }
                        )

            return jsonify(
                {
                    "providers": provider_info,
                    "languages": list(provider_info.keys()),
                    "default_language": default_language,
                    "episode_only": not bool(prov.series_cls),
                    "availability": availability,
                }
            )
        except Exception as e:
            logger.error(f"Providers fetch failed: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500

    @app.route("/api/download", methods=["POST"])
    def api_download():
        data = request.get_json(silent=True) or {}
        episodes = data.get("episodes", [])
        language = data.get("language", "German Dub")
        provider = data.get("provider", "VOE")
        title = data.get("title", "Unknown")
        series_url = data.get("series_url", "")

        if not episodes:
            return jsonify({"error": "episodes list is required"}), 400

        if (
            language == "English Sub"
            and os.environ.get("ANIWORLD_DISABLE_ENGLISH_SUB", "0") == "1"
        ):
            return jsonify({"error": "English Sub downloads are disabled"}), 403

        username = None
        if auth_enabled:
            user = get_current_user()
            if user:
                username = (
                    user.get("username")
                    if isinstance(user, dict)
                    else getattr(user, "username", None)
                )

        custom_path_id = data.get("custom_path_id")

        conflict_guard = _filter_conflicting_queue_episodes(
            series_url,
            language,
            episodes,
        )
        queueable_episodes = conflict_guard["episodes"]
        if not queueable_episodes:
            return (
                jsonify(
                    {
                        "error": "Selected episodes are already queued or currently downloading.",
                        "type": "queue_conflict",
                        "skipped_conflicts": conflict_guard["skipped"],
                        "conflicts": conflict_guard["conflicts"],
                    }
                ),
                409,
            )

        queue_id = add_to_queue(
            title,
            series_url,
            queueable_episodes,
            language,
            provider,
            username,
            custom_path_id=custom_path_id,
        )
        _record_user_event(
            "queue.added",
            subject_type="download",
            subject=title,
            details={
                "queue_id": queue_id,
                "series_url": series_url,
                "episodes": len(queueable_episodes),
                "language": language,
                "provider": provider,
                "custom_path_id": custom_path_id,
                "skipped_conflicts": conflict_guard["skipped"],
            },
        )
        _emit_ui_event("queue", "dashboard", "nav")
        return jsonify(
            {
                "queue_id": queue_id,
                "queued_episodes": len(queueable_episodes),
                "skipped_conflicts": conflict_guard["skipped"],
                "conflicts": conflict_guard["conflicts"],
            }
        )

    @app.route("/api/queue")
    def api_queue():
        from ..models.common.common import get_ffmpeg_progress

        items = get_queue()
        ffmpeg_pct = get_ffmpeg_progress()
        return jsonify({"items": items, "ffmpeg_progress": ffmpeg_pct})

    @app.route("/api/queue/<int:queue_id>", methods=["DELETE"])
    def api_queue_remove(queue_id):
        queue_item = next((item for item in get_queue() if item["id"] == queue_id), None)
        ok, err = remove_from_queue(queue_id)
        if not ok:
            return jsonify({"error": err}), 400
        _record_user_event(
            "queue.removed",
            subject_type="download",
            subject=(queue_item or {}).get("title") or f"Queue #{queue_id}",
            details={"queue_id": queue_id},
        )
        _emit_ui_event("queue", "dashboard", "nav")
        return jsonify({"ok": True})

    @app.route("/api/queue/<int:queue_id>/cancel", methods=["POST"])
    def api_queue_cancel(queue_id):
        queue_item = next((item for item in get_queue() if item["id"] == queue_id), None)
        ok, err = cancel_queue_item(queue_id)
        if not ok:
            return jsonify({"error": err}), 400
        _record_user_event(
            "queue.cancelled",
            subject_type="download",
            subject=(queue_item or {}).get("title") or f"Queue #{queue_id}",
            details={"queue_id": queue_id},
        )
        _emit_ui_event("queue", "dashboard", "nav")
        return jsonify({"ok": True})

    @app.route("/api/queue/<int:queue_id>/move", methods=["POST"])
    def api_queue_move(queue_id):
        data = request.get_json(silent=True) or {}
        direction = data.get("direction", "").strip()
        if direction not in ("up", "down"):
            return jsonify({"error": "direction must be 'up' or 'down'"}), 400
        ok, err = move_queue_item(queue_id, direction)
        if not ok:
            return jsonify({"error": err}), 400
        _emit_ui_event("queue")
        return jsonify({"ok": True})

    @app.route("/api/queue/<int:queue_id>/retry", methods=["POST"])
    def api_queue_retry(queue_id):
        queue_items = {item["id"]: item for item in get_queue()}
        original = queue_items.get(queue_id)
        provider_override = _pick_retry_provider(original) if original else None
        new_id, err = retry_queue_item(queue_id, provider_override=provider_override)
        if err:
            return jsonify({"error": err}), 400
        _record_user_event(
            "queue.retried",
            subject_type="download",
            subject=(original or {}).get("title") or f"Queue #{queue_id}",
            details={
                "from_queue_id": queue_id,
                "new_queue_id": new_id,
                "provider": provider_override or (original or {}).get("provider"),
            },
        )
        _emit_ui_event("queue", "dashboard", "nav")
        return jsonify(
            {
                "ok": True,
                "queue_id": new_id,
                "provider": provider_override or (original or {}).get("provider"),
            }
        )

    @app.route("/api/queue/retry-failed", methods=["POST"])
    def api_queue_retry_failed():
        overrides = {}
        for item in get_queue():
            if item.get("status") != "failed":
                continue
            overrides[item["id"]] = _pick_retry_provider(item)
        created = retry_failed_queue_items(provider_overrides=overrides)
        if created:
            _record_user_event(
                "queue.retry_failed",
                subject_type="download",
                subject="Failed Queue Items",
                details={"created": created},
            )
            _emit_ui_event("queue", "dashboard", "nav")
        return jsonify({"ok": True, "created": created})

    @app.route("/api/queue/completed", methods=["DELETE"])
    def api_queue_clear():
        clear_completed()
        _record_user_event(
            "queue.cleared_finished",
            subject_type="download",
            subject="Finished Queue Items",
        )
        _emit_ui_event("queue", "dashboard", "nav")
        return jsonify({"ok": True})

    # ── Captcha endpoints ─────────────────────────────────────────────────────

    @app.route("/api/captcha/<int:queue_id>/screenshot")
    def api_captcha_screenshot(queue_id):
        """Return the latest JPEG screenshot of the Playwright captcha page."""
        from ..playwright.captcha import _active_sessions, _active_sessions_lock
        from flask import Response

        with _active_sessions_lock:
            session = _active_sessions.get(queue_id)
        if not session:
            return "", 404
        data = session.get_screenshot()
        if not data:
            return "", 404
        return Response(
            data,
            mimetype="image/jpeg",
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Pragma": "no-cache",
            },
        )

    @app.route("/api/captcha/<int:queue_id>/click", methods=["POST"])
    def api_captcha_click(queue_id):
        """Forward a click event (x, y) to the Playwright captcha browser."""
        from ..playwright.captcha import _active_sessions, _active_sessions_lock

        data = request.get_json(silent=True) or {}
        x = data.get("x")
        y = data.get("y")
        if x is None or y is None:
            return jsonify({"error": "x and y are required"}), 400
        with _active_sessions_lock:
            session = _active_sessions.get(queue_id)
        if not session:
            return jsonify({"error": "no active captcha session"}), 404
        session.enqueue_click(int(x), int(y))
        return jsonify({"ok": True})

    @app.route("/api/captcha/<int:queue_id>/status")
    def api_captcha_status(queue_id):
        """Return whether a captcha session is active and whether it has been solved."""
        from ..playwright.captcha import _active_sessions, _active_sessions_lock

        with _active_sessions_lock:
            session = _active_sessions.get(queue_id)
        if not session:
            return jsonify({"active": False})
        return jsonify({"active": True, "done": session.done})

    # ─────────────────────────────────────────────────────────────────────────

    @app.route("/library")
    def library_page():
        return render_template("library.html")

    @app.route("/settings")
    def settings_page():
        from pathlib import Path
        import platform

        env_path = Path.home() / ".aniworld" / ".env"
        if platform.system() != "Windows":
            display = "~/.aniworld/.env"
        else:
            display = str(env_path)
        return render_template(
            "settings.html",
            env_path=display,
            supported_providers=_ordered_working_providers(),
        )

    @app.route("/provider-health")
    def provider_health_page():
        return render_template("provider_health.html")

    @app.route("/audit")
    def audit_page():
        return render_template("audit.html")

    @app.route("/api/random")
    def api_random():
        site = request.args.get("site", "aniworld").strip()
        if site == "sto":
            return jsonify({"error": "Random is not available for S.TO"}), 400
        url = random_anime()
        if url:
            return jsonify({"url": url})
        return jsonify({"error": "Failed to fetch random anime"}), 500

    # TTL cache for browse endpoints so long-running instances stay fresh
    import time as _time

    _browse_cache = {}
    _BROWSE_TTL = 3600  # 1 hour

    def _cached_browse(key, fetch_fn):
        now = _time.time()
        entry = _browse_cache.get(key)
        if entry and now - entry[0] < _BROWSE_TTL:
            return entry[1]
        results = fetch_fn()
        if results is not None:
            _browse_cache[key] = (now, results)
        return results

    @app.route("/api/new-animes")
    def api_new_animes():
        results = _cached_browse("new_animes", fetch_new_animes)
        if results is None:
            return jsonify({"error": "Failed to fetch new animes"}), 500
        return jsonify({"results": results})

    @app.route("/api/popular-animes")
    def api_popular_animes():
        results = _cached_browse("popular_animes", fetch_popular_animes)
        if results is None:
            return jsonify({"error": "Failed to fetch popular animes"}), 500
        return jsonify({"results": results})

    @app.route("/api/new-series")
    def api_new_series():
        results = _cached_browse("new_series", fetch_new_series)
        if results is None:
            return jsonify({"error": "Failed to fetch new series"}), 500
        return jsonify({"results": results})

    @app.route("/api/popular-series")
    def api_popular_series():
        results = _cached_browse("popular_series", fetch_popular_series)
        if results is None:
            return jsonify({"error": "Failed to fetch popular series"}), 500
        return jsonify({"results": results})

    @app.route("/api/new-episodes")
    def api_new_episodes():
        results = _cached_browse("new_episodes", fetch_new_episodes)
        if results is None:
            return jsonify({"error": "Failed to fetch new episodes"}), 500
        return jsonify({"results": results[:12]})

    @app.route("/api/downloaded-folders")
    def api_downloaded_folders():
        from pathlib import Path

        raw = os.environ.get("ANIWORLD_DOWNLOAD_PATH", "")
        if raw:
            p = Path(raw).expanduser()
            if not p.is_absolute():
                p = Path.home() / p
            dl_path = p
        else:
            dl_path = Path.home() / "Downloads"

        lang_sep = os.environ.get("ANIWORLD_LANG_SEPARATION", "0") == "1"
        lang_folders = ["german-dub", "english-sub", "german-sub", "english-dub"]

        # Collect all paths to scan (default + custom)
        scan_roots = [dl_path]
        for cp in get_custom_paths():
            cp_path = Path(cp["path"]).expanduser()
            if not cp_path.is_absolute():
                cp_path = Path.home() / cp_path
            scan_roots.append(cp_path)

        folders = set()
        for root in scan_roots:
            if lang_sep:
                bases = [root / lf for lf in lang_folders]
            else:
                bases = [root]
            for base in bases:
                if not base.is_dir():
                    continue
                for entry in base.iterdir():
                    if entry.is_dir():
                        folders.add(entry.name)
        return jsonify({"folders": sorted(folders)})

    @app.route("/api/settings", methods=["GET"])
    def api_settings():
        username, _ = _get_current_user_info()
        ui_mode = get_user_preference(username, "ui_mode", "cozy")
        ui_scale = get_user_preference(username, "ui_scale", "100")
        ui_theme = get_user_preference(username, "ui_theme", "ocean")
        ui_radius = get_user_preference(username, "ui_radius", "soft")
        ui_motion = get_user_preference(username, "ui_motion", "normal")
        ui_width = get_user_preference(username, "ui_width", "standard")
        ui_modal_width = get_user_preference(
            username, "ui_modal_width", "standard"
        )
        ui_nav_size = get_user_preference(username, "ui_nav_size", "standard")
        ui_table_density = get_user_preference(
            username, "ui_table_density", "standard"
        )
        ui_background = get_user_preference(
            username, "ui_background", "dynamic"
        )
        search_default_sort = get_user_preference(
            username, "search_default_sort", "source"
        )
        search_default_genres = get_user_preference(
            username, "search_default_genres", ""
        )
        search_default_year_from = get_user_preference(
            username, "search_default_year_from", ""
        )
        search_default_year_to = get_user_preference(
            username, "search_default_year_to", ""
        )
        search_default_favorites_only = get_user_preference(
            username, "search_default_favorites_only", "0"
        )
        search_default_downloaded_only = get_user_preference(
            username, "search_default_downloaded_only", "0"
        )
        browser_notifications_enabled = get_user_preference(
            username, "browser_notifications_enabled", "0"
        )
        browser_notify_browse = get_user_preference(
            username, "browser_notify_browse", "1"
        )
        browser_notify_queue = get_user_preference(
            username, "browser_notify_queue", "1"
        )
        browser_notify_autosync = get_user_preference(
            username, "browser_notify_autosync", "1"
        )
        browser_notify_library = get_user_preference(
            username, "browser_notify_library", "1"
        )
        browser_notify_settings = get_user_preference(
            username, "browser_notify_settings", "1"
        )
        browser_notify_system = get_user_preference(
            username, "browser_notify_system", "1"
        )
        payload = _settings_payload(
            ui_mode=ui_mode,
            ui_scale=ui_scale,
            ui_theme=ui_theme,
            ui_radius=ui_radius,
            ui_motion=ui_motion,
            ui_width=ui_width,
            ui_modal_width=ui_modal_width,
            ui_nav_size=ui_nav_size,
            ui_table_density=ui_table_density,
            ui_background=ui_background,
            search_default_sort=search_default_sort,
            search_default_genres=search_default_genres,
            search_default_year_from=search_default_year_from,
            search_default_year_to=search_default_year_to,
            search_default_favorites_only=search_default_favorites_only,
            search_default_downloaded_only=search_default_downloaded_only,
            browser_notifications_enabled=browser_notifications_enabled,
            browser_notify_browse=browser_notify_browse,
            browser_notify_queue=browser_notify_queue,
            browser_notify_autosync=browser_notify_autosync,
            browser_notify_library=browser_notify_library,
            browser_notify_settings=browser_notify_settings,
            browser_notify_system=browser_notify_system,
        )
        payload.update(_server_network_info(app))
        return jsonify(payload)

    @app.route("/api/settings", methods=["PUT"])
    def api_settings_update():
        data = request.get_json(silent=True) or {}
        if "download_path" in data:
            os.environ[_ENV_DOWNLOAD_PATH] = str(data["download_path"]).strip()
        if "lang_separation" in data:
            _set_bool_env(_ENV_LANG_SEPARATION, data["lang_separation"])
        if "disable_english_sub" in data:
            _set_bool_env(_ENV_DISABLE_ENGLISH_SUB, data["disable_english_sub"])
        if "experimental_filmpalast" in data:
            _set_bool_env(
                _ENV_EXPERIMENTAL_FILMPALAST, data["experimental_filmpalast"]
            )
        if "sync_schedule" in data:
            sched = str(data["sync_schedule"])
            if sched != "0" and sched not in SYNC_SCHEDULE_MAP:
                return jsonify({"error": f"Invalid sync_schedule: {sched}"}), 400
            os.environ[_ENV_SYNC_SCHEDULE] = sched
        if "sync_language" in data:
            lang = str(data["sync_language"])
            valid_langs = set(LANG_LABELS.values()) | {"All Languages"}
            if lang not in valid_langs:
                return jsonify({"error": f"Invalid sync_language: {lang}"}), 400
            os.environ[_ENV_SYNC_LANGUAGE] = lang
        if "sync_provider" in data:
            prov = str(data["sync_provider"])
            if prov not in WORKING_PROVIDERS:
                return jsonify({"error": f"Invalid sync_provider: {prov}"}), 400
            os.environ[_ENV_SYNC_PROVIDER] = prov
        username, _ = _get_current_user_info()
        if "ui_mode" in data:
            ui_mode = _normalize_ui_mode(data["ui_mode"])
            set_user_preference(username, "ui_mode", ui_mode)
        if "ui_scale" in data:
            set_user_preference(
                username, "ui_scale", _normalize_ui_scale(data["ui_scale"])
            )
        if "ui_theme" in data:
            set_user_preference(
                username, "ui_theme", _normalize_ui_theme(data["ui_theme"])
            )
        if "ui_radius" in data:
            set_user_preference(
                username, "ui_radius", _normalize_ui_radius(data["ui_radius"])
            )
        if "ui_motion" in data:
            set_user_preference(
                username, "ui_motion", _normalize_ui_motion(data["ui_motion"])
            )
        if "ui_width" in data:
            set_user_preference(
                username, "ui_width", _normalize_ui_width(data["ui_width"])
            )
        if "ui_modal_width" in data:
            set_user_preference(
                username,
                "ui_modal_width",
                _normalize_ui_modal_width(data["ui_modal_width"]),
            )
        if "ui_nav_size" in data:
            set_user_preference(
                username,
                "ui_nav_size",
                _normalize_ui_nav_size(data["ui_nav_size"]),
            )
        if "ui_table_density" in data:
            set_user_preference(
                username,
                "ui_table_density",
                _normalize_ui_table_density(data["ui_table_density"]),
            )
        if "ui_background" in data:
            set_user_preference(
                username,
                "ui_background",
                _normalize_ui_background(data["ui_background"]),
            )
        if "search_default_sort" in data:
            set_user_preference(
                username,
                "search_default_sort",
                _normalize_search_default_sort(data["search_default_sort"]),
            )
        if "search_default_genres" in data:
            set_user_preference(
                username,
                "search_default_genres",
                _normalize_search_default_genres(data["search_default_genres"]),
            )
        if "search_default_year_from" in data:
            set_user_preference(
                username,
                "search_default_year_from",
                _normalize_search_default_year(data["search_default_year_from"]),
            )
        if "search_default_year_to" in data:
            set_user_preference(
                username,
                "search_default_year_to",
                _normalize_search_default_year(data["search_default_year_to"]),
            )
        if "search_default_favorites_only" in data:
            set_user_preference(
                username,
                "search_default_favorites_only",
                _normalize_pref_bool(data["search_default_favorites_only"]),
            )
        if "search_default_downloaded_only" in data:
            set_user_preference(
                username,
                "search_default_downloaded_only",
                _normalize_pref_bool(data["search_default_downloaded_only"]),
            )
        if "browser_notifications_enabled" in data:
            set_user_preference(
                username,
                "browser_notifications_enabled",
                _normalize_pref_bool(data["browser_notifications_enabled"]),
            )
        if "browser_notify_browse" in data:
            set_user_preference(
                username,
                "browser_notify_browse",
                _normalize_pref_bool(data["browser_notify_browse"]),
            )
        if "browser_notify_queue" in data:
            set_user_preference(
                username,
                "browser_notify_queue",
                _normalize_pref_bool(data["browser_notify_queue"]),
            )
        if "browser_notify_autosync" in data:
            set_user_preference(
                username,
                "browser_notify_autosync",
                _normalize_pref_bool(data["browser_notify_autosync"]),
            )
        if "browser_notify_library" in data:
            set_user_preference(
                username,
                "browser_notify_library",
                _normalize_pref_bool(data["browser_notify_library"]),
            )
        if "browser_notify_settings" in data:
            set_user_preference(
                username,
                "browser_notify_settings",
                _normalize_pref_bool(data["browser_notify_settings"]),
            )
        if "browser_notify_system" in data:
            set_user_preference(
                username,
                "browser_notify_system",
                _normalize_pref_bool(data["browser_notify_system"]),
            )
        _record_user_event(
            "settings.updated",
            subject_type="settings",
            subject="web-settings",
            details={
                key: value
                for key, value in data.items()
                if key
                in {
                    "download_path",
                    "lang_separation",
                    "disable_english_sub",
                    "experimental_filmpalast",
                    "sync_schedule",
                    "sync_language",
                    "sync_provider",
                    "ui_mode",
                    "ui_scale",
                    "ui_theme",
                    "ui_radius",
                    "ui_motion",
                    "ui_width",
                    "ui_modal_width",
                    "ui_nav_size",
                    "ui_table_density",
                    "ui_background",
                    "search_default_sort",
                    "search_default_genres",
                    "search_default_year_from",
                    "search_default_year_to",
                    "search_default_favorites_only",
                    "search_default_downloaded_only",
                    "browser_notifications_enabled",
                    "browser_notify_browse",
                    "browser_notify_queue",
                    "browser_notify_autosync",
                    "browser_notify_library",
                    "browser_notify_settings",
                    "browser_notify_system",
                }
            },
        )
        _emit_ui_event("settings", "autosync", "dashboard", "library", "nav")
        return jsonify({"ok": True})

    @app.route("/api/custom-paths")
    def api_custom_paths():
        paths = get_custom_paths()
        return jsonify({"paths": paths})

    @app.route("/api/custom-paths", methods=["POST"])
    def api_custom_paths_add():
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        path = (data.get("path") or "").strip()
        if not name or not path:
            return jsonify({"error": "name and path are required"}), 400
        path_id = add_custom_path(name, path)
        _record_user_event(
            "custom_path.added",
            subject_type="custom_path",
            subject=name,
            details={"path": path, "path_id": path_id},
        )
        _emit_ui_event("library", "settings", "autosync")
        return jsonify({"ok": True, "id": path_id})

    @app.route("/api/custom-paths/<int:path_id>", methods=["DELETE"])
    def api_custom_paths_delete(path_id):
        path_row = get_custom_path_by_id(path_id)
        remove_custom_path(path_id)
        _record_user_event(
            "custom_path.deleted",
            subject_type="custom_path",
            subject=(path_row or {}).get("name") or f"Path #{path_id}",
            details={"path_id": path_id},
        )
        _emit_ui_event("library", "settings", "autosync")
        return jsonify({"ok": True})

    # ===== Auto-Sync Page =====

    @app.route("/autosync")
    def autosync_page():
        return render_template(
            "autosync.html", supported_providers=_ordered_working_providers()
        )

    # ===== Auto-Sync API =====

    def _get_current_user_info():
        """Return (username, is_admin) for the current request."""
        if not auth_enabled:
            return None, True  # no auth -> treat as admin
        user = get_current_user()
        if not user:
            return None, False
        username = (
            user.get("username")
            if isinstance(user, dict)
            else getattr(user, "username", None)
        )
        role = (
            user.get("role")
            if isinstance(user, dict)
            else getattr(user, "role", "user")
        )
        return username, role == "admin"

    def _record_user_event(action, subject_type=None, subject=None, details=None):
        username, _ = _get_current_user_info()
        record_audit_event(
            action,
            username=username,
            subject_type=subject_type,
            subject=subject,
            details=details,
        )

    @app.route("/api/autosync")
    def api_autosync_list():
        username, is_admin = _get_current_user_info()
        # Admins see all jobs; regular users see only their own
        jobs = get_autosync_jobs(username=None if is_admin else username)
        return jsonify({"jobs": jobs})

    @app.route("/api/autosync", methods=["POST"])
    def api_autosync_create():
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "").strip()
        series_url = (data.get("series_url") or "").strip()
        language = data.get("language", "German Dub")
        provider = data.get("provider", "VOE")
        custom_path_id = data.get("custom_path_id")

        if not title or not series_url:
            return jsonify({"error": "title and series_url are required"}), 400

        try:
            prov = resolve_provider(series_url)
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

        if not prov.series_cls or not prov.season_cls:
            return (
                jsonify(
                    {
                        "error": "Auto-Sync is only supported for series sources, not direct movie links."
                    }
                ),
                400,
            )

        existing = find_autosync_by_url(series_url)
        if existing:
            return jsonify(
                {"error": "A sync job for this series already exists", "job": existing}
            ), 409

        username, _ = _get_current_user_info()
        job_id = add_autosync_job(
            title=title,
            series_url=series_url,
            language=language,
            provider=provider,
            custom_path_id=custom_path_id,
            added_by=username,
        )
        _record_user_event(
            "autosync.added",
            subject_type="autosync",
            subject=title,
            details={
                "job_id": job_id,
                "series_url": series_url,
                "language": language,
                "provider": provider,
            },
        )
        _emit_ui_event("autosync", "dashboard", "nav", "settings")
        return jsonify({"ok": True, "id": job_id})

    @app.route("/api/autosync/<int:job_id>", methods=["PUT"])
    def api_autosync_update(job_id):
        job = get_autosync_job(job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404
        username, is_admin = _get_current_user_info()
        if not is_admin and job.get("added_by") != username:
            return jsonify({"error": "Not authorized to edit this job"}), 403
        data = request.get_json(silent=True) or {}
        allowed = {"language", "provider", "enabled", "custom_path_id"}
        filtered = {k: v for k, v in data.items() if k in allowed}
        options = _build_autosync_job_options(job)
        valid_languages = set(options["languages"])
        if options["allow_all_languages"]:
            valid_languages.add("All Languages")

        language = str(filtered.get("language", job.get("language") or "")).strip()
        provider = str(filtered.get("provider", job.get("provider") or "")).strip()

        if language not in valid_languages:
            return jsonify({"error": "Selected language is not available for this series"}), 400

        if language == "All Languages":
            valid_providers = set(options["all_language_providers"])
        else:
            valid_providers = set(options["providers_by_language"].get(language, []))

        if provider not in valid_providers:
            return jsonify({"error": "Selected provider is not available for the chosen language"}), 400

        update_autosync_job(job_id, **filtered)
        _record_user_event(
            "autosync.updated",
            subject_type="autosync",
            subject=job.get("title") or f"Job #{job_id}",
            details={"job_id": job_id, **filtered},
        )
        _emit_ui_event("autosync", "dashboard", "nav", "settings")
        return jsonify({"ok": True})

    @app.route("/api/autosync/<int:job_id>", methods=["DELETE"])
    def api_autosync_delete(job_id):
        job = get_autosync_job(job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404
        username, is_admin = _get_current_user_info()
        if not is_admin and job.get("added_by") != username:
            return jsonify({"error": "Not authorized to delete this job"}), 403
        ok, err = remove_autosync_job(job_id)
        if not ok:
            return jsonify({"error": err}), 404
        _record_user_event(
            "autosync.deleted",
            subject_type="autosync",
            subject=job.get("title") or f"Job #{job_id}",
            details={"job_id": job_id},
        )
        _emit_ui_event("autosync", "dashboard", "nav", "settings")
        return jsonify({"ok": True})

    @app.route("/api/autosync/<int:job_id>/options")
    def api_autosync_options(job_id):
        job = get_autosync_job(job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404
        username, is_admin = _get_current_user_info()
        if not is_admin and job.get("added_by") != username:
            return jsonify({"error": "Not authorized to inspect this job"}), 403

        options = _build_autosync_job_options(job)
        return jsonify({"ok": True, **options})

    @app.route("/api/autosync/<int:job_id>/sync", methods=["POST"])
    def api_autosync_trigger(job_id):
        job = get_autosync_job(job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404
        username, is_admin = _get_current_user_info()
        if not is_admin and job.get("added_by") != username:
            return jsonify({"error": "Not authorized"}), 403
        with _syncing_jobs_lock:
            if job_id in _syncing_jobs:
                return jsonify({"error": "Sync already running for this job"}), 409
        threading.Thread(target=_run_autosync_for_job, args=(job,), daemon=True).start()
        _record_user_event(
            "autosync.triggered",
            subject_type="autosync",
            subject=job.get("title") or f"Job #{job_id}",
            details={"job_id": job_id},
        )
        _emit_ui_event("autosync")
        return jsonify({"ok": True, "message": "Sync started"})

    @app.route("/api/autosync/sync-all", methods=["POST"])
    def api_autosync_trigger_all():
        username, is_admin = _get_current_user_info()
        jobs = get_autosync_jobs(username=None if is_admin else username)
        started = 0
        for job in jobs:
            if not job.get("enabled"):
                continue
            with _syncing_jobs_lock:
                if job["id"] in _syncing_jobs:
                    continue
            threading.Thread(
                target=_run_autosync_for_job,
                args=(job,),
                daemon=True,
            ).start()
            started += 1
        if started:
            _record_user_event(
                "autosync.triggered_all",
                subject_type="autosync",
                subject="Sync All",
                details={"started": started},
            )
            _emit_ui_event("autosync")
        return jsonify({"ok": True, "started": started})

    @app.route("/api/autosync/sync-selected", methods=["POST"])
    def api_autosync_trigger_selected():
        data = request.get_json(silent=True) or {}
        raw_ids = data.get("ids") or []
        if not isinstance(raw_ids, list):
            return jsonify({"error": "ids must be a list"}), 400

        selected_ids = []
        seen = set()
        for raw_id in raw_ids:
            try:
                job_id = int(raw_id)
            except (TypeError, ValueError):
                continue
            if job_id in seen:
                continue
            seen.add(job_id)
            selected_ids.append(job_id)

        if not selected_ids:
            return jsonify({"error": "No sync jobs selected"}), 400

        username, is_admin = _get_current_user_info()
        started = 0
        skipped = []

        for job_id in selected_ids:
            job = get_autosync_job(job_id)
            if not job:
                skipped.append({"id": job_id, "reason": "not_found"})
                continue
            if not is_admin and job.get("added_by") != username:
                skipped.append({"id": job_id, "reason": "forbidden"})
                continue
            with _syncing_jobs_lock:
                if job_id in _syncing_jobs:
                    skipped.append({"id": job_id, "reason": "already_running"})
                    continue
            threading.Thread(
                target=_run_autosync_for_job,
                args=(job,),
                daemon=True,
            ).start()
            started += 1

        if started:
            _record_user_event(
                "autosync.triggered_selected",
                subject_type="autosync",
                subject="Sync Selected",
                details={
                    "started": started,
                    "selected_ids": selected_ids,
                    "skipped": skipped,
                },
            )
            _emit_ui_event("autosync")

        return jsonify({"ok": True, "started": started, "skipped": skipped})

    @app.route("/api/autosync/check", methods=["GET"])
    def api_autosync_check():
        """Check if a sync job exists for a given series URL."""
        url = request.args.get("url", "").strip()
        if not url:
            return jsonify({"exists": False})
        job = find_autosync_by_url(url)
        if not job:
            return jsonify({"exists": False})
        # Only expose job details to the owner or admins
        username, is_admin = _get_current_user_info()
        if not is_admin and job.get("added_by") != username:
            return jsonify({"exists": False})
        return jsonify({"exists": True, "job": job})

    @app.route("/api/favorites")
    def api_favorites():
        username, _ = _get_current_user_info()
        return jsonify({"items": list_favorites(username=username)})

    @app.route("/api/favorites", methods=["POST"])
    def api_favorites_add():
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "").strip()
        series_url = (data.get("series_url") or "").strip()
        poster_url = (data.get("poster_url") or "").strip() or None
        site = (data.get("site") or "").strip() or None
        username, _ = _get_current_user_info()
        if not title or not series_url:
            return jsonify({"error": "title and series_url are required"}), 400
        favorite_id = add_favorite(
            title,
            series_url,
            poster_url=poster_url,
            site=site,
            username=username,
        )
        upsert_series_meta(
            series_url=series_url,
            title=title,
            poster_url=poster_url,
        )
        _record_user_event(
            "favorite.added",
            subject_type="favorite",
            subject=title,
            details={"series_url": series_url, "site": site},
        )
        _emit_ui_event("favorites", "dashboard", "nav", "library")
        return jsonify({"ok": True, "id": favorite_id})

    @app.route("/api/favorites", methods=["DELETE"])
    def api_favorites_delete():
        data = request.get_json(silent=True) or {}
        series_url = (data.get("series_url") or "").strip()
        if not series_url:
            return jsonify({"error": "series_url is required"}), 400
        username, _ = _get_current_user_info()
        favorite = get_favorite(series_url, username=username)
        remove_favorite(series_url, username=username)
        _record_user_event(
            "favorite.removed",
            subject_type="favorite",
            subject=(favorite or {}).get("title") or series_url,
            details={"series_url": series_url},
        )
        _emit_ui_event("favorites", "dashboard", "nav", "library")
        return jsonify({"ok": True})

    @app.route("/api/favorites/touch", methods=["POST"])
    def api_favorites_touch():
        data = request.get_json(silent=True) or {}
        series_url = (data.get("series_url") or "").strip()
        if not series_url:
            return jsonify({"error": "series_url is required"}), 400
        username, _ = _get_current_user_info()
        touch_favorite(series_url, username=username)
        _emit_ui_event("favorites", min_interval=5.0)
        return jsonify({"ok": True})

    # ===== Stats API =====

    @app.route("/api/stats/sync")
    def api_stats_sync():
        username, _ = _get_current_user_info()
        stats = get_sync_stats(username=username)
        # Compute next_run_at from last check + schedule interval
        schedule_key = os.environ.get("ANIWORLD_SYNC_SCHEDULE", "0")
        interval = SYNC_SCHEDULE_MAP.get(schedule_key, 0)
        stats["schedule"] = schedule_key
        stats["next_run_at"] = None
        if interval and stats.get("last_check"):
            from datetime import datetime, timedelta

            try:
                last = datetime.strptime(stats["last_check"], "%Y-%m-%d %H:%M:%S")
                nxt = last + timedelta(seconds=interval)
                stats["next_run_at"] = nxt.strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                pass
        return jsonify(stats)

    @app.route("/api/stats/queue")
    def api_stats_queue():
        username, _ = _get_current_user_info()
        return jsonify(get_queue_stats(username=username))

    @app.route("/api/stats/general")
    def api_stats_general():
        username, _ = _get_current_user_info()
        return jsonify(get_general_stats(username=username))

    @app.route("/api/provider-health")
    def api_provider_health():
        username, _ = _get_current_user_info()
        return jsonify({"items": get_provider_health(username=username)})

    @app.route("/api/dashboard/stats")
    def api_dashboard_stats():
        username, _ = _get_current_user_info()
        return jsonify(_get_cached_stats_payload(username=username))

    @app.route("/api/dashboard")
    def api_dashboard():
        username, _ = _get_current_user_info()
        cache_key = f"dashboard:full:{_cache_scope_token(username)}"
        cached = _cache_get(cache_key, 30.0)
        if cached is not None:
            return jsonify(cached)

        stats_payload = _get_cached_stats_payload(username=username)
        favorites = list_favorites(username=username)
        meta_by_url = {item["series_url"]: item for item in list_series_meta()}
        for favorite in favorites:
            meta = meta_by_url.get(favorite["series_url"], {})
            if not favorite.get("poster_url"):
                favorite["poster_url"] = meta.get("poster_url")
        releases = _cached_browse("new_episodes", fetch_new_episodes) or []
        payload = {
            **stats_payload,
            "favorites": favorites[:8],
            "recent_activity": get_recent_activity(8, username=username),
            "history": get_download_history(14, username=username),
            "releases": releases[:10],
        }
        return jsonify(_cache_set(cache_key, payload))

    @app.route("/api/nav")
    def api_nav():
        username, _ = _get_current_user_info()
        return jsonify(_build_nav_state(username=username))

    @app.route("/api/events")
    def api_events():
        @stream_with_context
        def _stream():
            last_seq = 0
            yield "retry: 4000\n\n"
            while True:
                with _ui_event_condition:
                    if not _pending_ui_events(last_seq):
                        _ui_event_condition.wait(timeout=25)
                    pending = _pending_ui_events(last_seq)

                if pending:
                    last_seq = pending[-1]["seq"]
                    payload = {
                        "sequence": last_seq,
                        "channels": sorted(
                            {channel for event in pending for channel in event["channels"]}
                        ),
                        "emitted_at": pending[-1]["emitted_at"],
                    }
                    yield f"event: update\ndata: {json.dumps(payload)}\n\n"
                else:
                    yield "event: ping\ndata: {}\n\n"

        response = Response(_stream(), mimetype="text/event-stream")
        response.headers["Cache-Control"] = "no-cache, no-transform"
        response.headers["X-Accel-Buffering"] = "no"
        return response

    @app.route("/api/history")
    def api_history():
        try:
            limit = max(1, min(int(request.args.get("limit", "40")), 100))
        except ValueError:
            limit = 40
        username, _ = _get_current_user_info()
        return jsonify({"items": get_download_history(limit, username=username)})

    @app.route("/api/audit")
    def api_audit():
        try:
            limit = max(1, min(int(request.args.get("limit", "80")), 200))
        except ValueError:
            limit = 80
        requested_user = (request.args.get("username") or "").strip()
        action = (request.args.get("action") or "").strip() or None
        current_username, is_admin = _get_current_user_info()
        if is_admin:
            scope_username = requested_user or None
        else:
            scope_username = current_username
        return jsonify(
            {
                "items": list_audit_events(
                    limit=limit,
                    username=scope_username,
                    action=action,
                )
            }
        )

    @app.route("/api/audit/users")
    def api_audit_users():
        _, is_admin = _get_current_user_info()
        if not is_admin:
            return jsonify({"items": []})
        return jsonify({"items": list_audit_users()})

    @app.route("/api/library")
    def api_library():
        return jsonify(_get_cached_library_snapshot(include_meta=True))

    @app.route("/api/library/compare")
    def api_library_compare():
        refresh = str(request.args.get("refresh", "0")).strip() == "1"
        return jsonify(_get_cached_library_compare(refresh=refresh))

    @app.route("/api/library/delete", methods=["POST"])
    def api_library_delete():
        import shutil
        from pathlib import Path

        data = request.get_json(silent=True) or {}
        folder = data.get("folder", "")
        season = data.get("season")  # int or null
        episode = data.get("episode")  # int or null
        custom_path_id = data.get("custom_path_id")  # int or null

        # Security: reject dangerous folder names
        if (
            not folder
            or ".." in folder
            or "/" in folder
            or "\\" in folder
            or "\x00" in folder
        ):
            return jsonify({"error": "Invalid folder name"}), 400

        # Resolve base path from custom_path_id or default
        if custom_path_id:
            cp = get_custom_path_by_id(custom_path_id)
            if not cp:
                return jsonify({"error": "Custom path not found"}), 404
            dl_base = Path(cp["path"]).expanduser()
            if not dl_base.is_absolute():
                dl_base = Path.home() / dl_base
        else:
            raw = os.environ.get("ANIWORLD_DOWNLOAD_PATH", "")
            if raw:
                dl_base = Path(raw).expanduser()
                if not dl_base.is_absolute():
                    dl_base = Path.home() / dl_base
            else:
                dl_base = Path.home() / "Downloads"

        lang_sep = os.environ.get("ANIWORLD_LANG_SEPARATION", "0") == "1"
        lang_folders = ["german-dub", "english-sub", "german-sub", "english-dub"]
        lang_folder = data.get("lang_folder")  # str or null

        if lang_sep and lang_folder:
            if lang_folder not in lang_folders:
                return jsonify({"error": "Invalid language folder"}), 400
            bases = [dl_base / lang_folder]
        elif lang_sep:
            bases = [dl_base / lf for lf in lang_folders]
        else:
            bases = [dl_base]

        deleted = 0
        for base in bases:
            title_path = base / folder
            # Verify resolved path is a child of the base
            try:
                title_path.resolve().relative_to(base.resolve())
            except ValueError:
                continue
            if not title_path.is_dir():
                continue

            if season is None and episode is None:
                # Delete entire title
                shutil.rmtree(title_path, ignore_errors=True)
                deleted += 1
            else:
                # Build regex pattern
                if episode is not None:
                    pat = re.compile(
                        rf"S{int(season):02d}E{int(episode):03d}(?!\d)", re.IGNORECASE
                    )
                else:
                    pat = re.compile(rf"S{int(season):02d}E\d{{2,3}}", re.IGNORECASE)

                for f in list(title_path.rglob("*")):
                    if f.is_file() and pat.search(f.name):
                        try:
                            f.unlink()
                            deleted += 1
                        except OSError:
                            pass

                # Cleanup empty directories bottom-up
                for dirpath in sorted(
                    title_path.rglob("*"), key=lambda p: len(p.parts), reverse=True
                ):
                    if dirpath.is_dir():
                        try:
                            dirpath.rmdir()  # only succeeds if empty
                        except OSError:
                            pass
                # Remove title folder itself if empty
                try:
                    title_path.rmdir()
                except OSError:
                    pass

        if deleted == 0:
            return jsonify({"error": "Nothing found to delete"}), 404
        _emit_ui_event("library", "dashboard", "nav")
        return jsonify({"ok": True, "deleted": deleted})

    if auth_enabled:
        from .auth import admin_required

        # Endpoints that require admin instead of just login
        _admin_only = {
            "settings_page",
            "api_settings",
            "api_settings_update",
            "api_library_delete",
            "api_custom_paths_add",
            "api_custom_paths_delete",
            "api_autosync_create",
            "api_autosync_update",
            "api_autosync_delete",
            "api_autosync_trigger",
        }

        # Wrap all non-auth, non-static view functions with login_required
        # (admin_required for settings endpoints)
        _exempt = {
            "static",
            "auth.login",
            "auth.logout",
            "auth.setup",
            "auth.oidc_login",
            "auth.oidc_callback",
        }
        for endpoint, view_func in list(app.view_functions.items()):
            if endpoint not in _exempt:
                if endpoint in _admin_only:
                    app.view_functions[endpoint] = admin_required(view_func)
                else:
                    app.view_functions[endpoint] = login_required(view_func)

        # Exempt JSON API routes from CSRF (they use Content-Type: application/json
        # which provides implicit cross-origin protection via CORS preflight)
        for endpoint in list(app.view_functions):
            if endpoint.startswith("api_") or endpoint.startswith("auth.admin_"):
                csrf.exempt(app.view_functions[endpoint])

    return app


def start_web_ui(
    host="127.0.0.1",
    port=8080,
    open_browser=True,
    auth_enabled=False,
    sso_enabled=False,
    force_sso=False,
):
    """Start the Flask web UI server."""
    import os
    import threading
    import webbrowser

    # Allow env var overrides (Docker-friendly)
    force_sso = force_sso or os.getenv("ANIWORLD_WEB_FORCE_SSO", "0") == "1"
    sso_enabled = sso_enabled or force_sso or os.getenv("ANIWORLD_WEB_SSO", "0") == "1"
    auth_enabled = (
        auth_enabled or force_sso or os.getenv("ANIWORLD_WEB_AUTH", "0") == "1"
    )

    app = create_app(
        auth_enabled=auth_enabled, sso_enabled=sso_enabled, force_sso=force_sso
    )
    app.config["WEB_HOST"] = host
    app.config["WEB_PORT"] = port
    if os.getenv("ANIWORLD_CACHE_WARM_ON_START", "1") == "1":
        _warm_runtime_caches_startup()
    _ensure_runtime_cache_warmer()
    display_host = "localhost" if host == "127.0.0.1" else host
    url = f"http://{display_host}:{port}"
    print(f"Starting AniWorld Web UI on {url}")

    debug = os.getenv("ANIWORLD_DEBUG_MODE", "0") == "1"

    # In debug mode, Flask's reloader spawns a child process that re-executes
    # this function. Only open the browser in the parent (reloader) process
    # to avoid opening it twice.
    is_reloader_child = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    if open_browser and not is_reloader_child:
        threading.Timer(0.5, webbrowser.open, args=(url,)).start()

    if debug:
        app.run(host=host, port=port, debug=True)
    else:
        from waitress import serve

        try:
            waitress_threads = int(os.environ.get("ANIWORLD_WEB_THREADS", "12"))
        except ValueError:
            waitress_threads = 12
        waitress_threads = max(4, min(waitress_threads, 64))

        serve(app, host=host, port=port, threads=waitress_threads)
