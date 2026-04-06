import json
import os
import sqlite3

from werkzeug.security import check_password_hash, generate_password_hash

from ..config import ANIWORLD_CONFIG_DIR
from ..logger import get_logger

logger = get_logger(__name__)

DB_PATH = ANIWORLD_CONFIG_DIR / "aniworld.db"

_CREATE_TABLE = """\
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    auth_method TEXT NOT NULL DEFAULT 'local',
    sso_subject TEXT,
    sso_issuer TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_SSO_INDEX = """\
CREATE UNIQUE INDEX IF NOT EXISTS idx_sso_identity
ON users (sso_issuer, sso_subject)
WHERE sso_issuer IS NOT NULL AND sso_subject IS NOT NULL;
"""

_CREATE_USER_PREFERENCES_TABLE = """\
CREATE TABLE IF NOT EXISTS user_preferences (
    username TEXT NOT NULL DEFAULT '',
    pref_key TEXT NOT NULL,
    pref_value TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (username, pref_key)
);
"""

_CREATE_AUDIT_LOG_TABLE = """\
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    subject_type TEXT,
    subject TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_AUDIT_LOG_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_audit_log_created_at "
    "ON audit_log (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_audit_log_username "
    "ON audit_log (username, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_audit_log_action "
    "ON audit_log (action, created_at DESC)",
)


def get_db():
    ANIWORLD_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _migrate_db(conn):
    rows = conn.execute("PRAGMA table_info(users)").fetchall()
    columns = {r["name"] for r in rows}

    if "auth_method" not in columns:
        conn.execute(
            "ALTER TABLE users ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'local'"
        )
    if "sso_subject" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN sso_subject TEXT")
    if "sso_issuer" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN sso_issuer TEXT")

    conn.execute(_CREATE_SSO_INDEX)
    conn.commit()


def init_db():
    conn = get_db()
    try:
        conn.execute(_CREATE_TABLE)
        conn.execute(_CREATE_SSO_INDEX)
        conn.commit()
        _migrate_db(conn)
    finally:
        conn.close()

    if not has_any_admin():
        env_user = os.environ.get("ANIWORLD_WEB_ADMIN_USER", "").strip()
        env_pass = os.environ.get("ANIWORLD_WEB_ADMIN_PASS", "").strip()
        if env_user and env_pass:
            create_user(env_user, env_pass, role="admin")
            logger.info("Auto-created admin user '%s' from environment", env_user)


def has_any_admin():
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'"
        ).fetchone()
        return row["cnt"] > 0
    finally:
        conn.close()


def create_user(username, password, role="user"):
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), role),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def verify_user(username, password):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, username, password_hash, role, auth_method FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if not row:
            return None, "Invalid username or password."
        if row["auth_method"] != "local":
            return None, "This account uses SSO. Please use the SSO login button."
        if check_password_hash(row["password_hash"], password):
            return {
                "id": row["id"],
                "username": row["username"],
                "role": row["role"],
            }, None
        return None, "Invalid username or password."
    finally:
        conn.close()


def find_or_create_sso_user(
    issuer, subject, username, admin_username=None, admin_subject=None
):
    def _should_be_admin():
        if admin_subject and subject == admin_subject:
            return True
        if admin_username and username == admin_username:
            return True
        return False

    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, username, role FROM users WHERE sso_issuer = ? AND sso_subject = ?",
            (issuer, subject),
        ).fetchone()

        if row:
            user = {"id": row["id"], "username": row["username"], "role": row["role"]}
            if _should_be_admin() and row["role"] != "admin":
                conn.execute(
                    "UPDATE users SET role = 'admin' WHERE id = ?", (row["id"],)
                )
                conn.commit()
                user["role"] = "admin"
            return user

        # Check for username conflict with local users
        existing = conn.execute(
            "SELECT id, auth_method FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if existing:
            raise ValueError(
                f"Username '{username}' is already taken by a local account."
            )

        role = "admin" if _should_be_admin() else "user"
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, role, auth_method, sso_subject, sso_issuer) "
            "VALUES (?, ?, ?, 'oidc', ?, ?)",
            (username, "", role, subject, issuer),
        )
        conn.commit()
        return {"id": cur.lastrowid, "username": username, "role": role}
    finally:
        conn.close()


def list_users():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT id, username, role, auth_method, created_at FROM users ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def delete_user(user_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            return False, "User not found"
        if row["role"] == "admin":
            cnt = conn.execute(
                "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'"
            ).fetchone()["cnt"]
            if cnt <= 1:
                return False, "Cannot delete the last admin"
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        return True, None
    finally:
        conn.close()


def update_user_role(user_id, new_role):
    if new_role not in ("admin", "user"):
        return False, "Invalid role"
    conn = get_db()
    try:
        row = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            return False, "User not found"
        if row["role"] == "admin" and new_role != "admin":
            cnt = conn.execute(
                "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'"
            ).fetchone()["cnt"]
            if cnt <= 1:
                return False, "Cannot demote the last admin"
        conn.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
        conn.commit()
        return True, None
    finally:
        conn.close()


# ===== Download Queue =====

_CREATE_QUEUE_TABLE = """\
CREATE TABLE IF NOT EXISTS download_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    series_url TEXT NOT NULL,
    episodes TEXT NOT NULL,
    total_episodes INTEGER NOT NULL,
    language TEXT NOT NULL,
    provider TEXT NOT NULL,
    username TEXT,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK(status IN ('queued','running','completed','failed','cancelled')),
    current_episode INTEGER NOT NULL DEFAULT 0,
    current_url TEXT,
    errors TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);
"""

_CREATE_DOWNLOAD_ARCHIVE_TABLE = """\
CREATE TABLE IF NOT EXISTS download_archive (
    queue_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    series_url TEXT NOT NULL,
    total_episodes INTEGER NOT NULL,
    language TEXT NOT NULL,
    provider TEXT NOT NULL,
    username TEXT,
    status TEXT NOT NULL
        CHECK(status IN ('completed','failed','cancelled')),
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    completed_at TEXT,
    custom_path_id INTEGER,
    errors TEXT NOT NULL DEFAULT '[]'
);
"""

_CREATE_DOWNLOAD_STATS_ARCHIVE_TABLE = """\
CREATE TABLE IF NOT EXISTS download_stats_archive (
    queue_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    series_url TEXT NOT NULL,
    total_episodes INTEGER NOT NULL,
    language TEXT NOT NULL,
    provider TEXT NOT NULL,
    username TEXT,
    status TEXT NOT NULL
        CHECK(status IN ('completed','failed','cancelled')),
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    completed_at TEXT,
    custom_path_id INTEGER,
    errors TEXT NOT NULL DEFAULT '[]'
);
"""

_CREATE_DOWNLOAD_ARCHIVE_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_download_archive_completed_at "
    "ON download_archive (completed_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_download_archive_status "
    "ON download_archive (status)",
    "CREATE INDEX IF NOT EXISTS idx_download_archive_provider "
    "ON download_archive (provider)",
)

_CREATE_DOWNLOAD_STATS_ARCHIVE_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_download_stats_archive_completed_at "
    "ON download_stats_archive (completed_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_download_stats_archive_status "
    "ON download_stats_archive (status)",
    "CREATE INDEX IF NOT EXISTS idx_download_stats_archive_provider "
    "ON download_stats_archive (provider)",
)


def _archive_terminal_downloads(conn, queue_id=None):
    query = (
        "INSERT OR REPLACE INTO download_archive ("
        "queue_id, title, series_url, total_episodes, language, provider, username, "
        "status, source, created_at, completed_at, custom_path_id, errors"
        ") "
        "SELECT id, title, series_url, total_episodes, language, provider, username, "
        "status, COALESCE(source, 'manual'), created_at, "
        "COALESCE(completed_at, datetime('now')), custom_path_id, COALESCE(errors, '[]') "
        "FROM download_queue WHERE status IN ('completed', 'failed', 'cancelled')"
    )
    params = ()
    if queue_id is not None:
        query += " AND id = ?"
        params = (queue_id,)
    conn.execute(query, params)
    conn.execute(query.replace("download_archive", "download_stats_archive", 1), params)


def _backfill_stats_archive(conn):
    conn.execute(
        "INSERT OR IGNORE INTO download_stats_archive ("
        "queue_id, title, series_url, total_episodes, language, provider, username, "
        "status, source, created_at, completed_at, custom_path_id, errors"
        ") "
        "SELECT queue_id, title, series_url, total_episodes, language, provider, username, "
        "status, COALESCE(source, 'manual'), created_at, completed_at, custom_path_id, "
        "COALESCE(errors, '[]') "
        "FROM download_archive"
    )


def init_queue_db():
    ANIWORLD_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    try:
        conn.execute(_CREATE_QUEUE_TABLE)
        conn.execute(_CREATE_DOWNLOAD_ARCHIVE_TABLE)
        conn.execute(_CREATE_DOWNLOAD_STATS_ARCHIVE_TABLE)
        for stmt in _CREATE_DOWNLOAD_ARCHIVE_INDEXES:
            conn.execute(stmt)
        for stmt in _CREATE_DOWNLOAD_STATS_ARCHIVE_INDEXES:
            conn.execute(stmt)
        # Add position column for queue reordering (migration for existing DBs)
        try:
            conn.execute(
                "ALTER TABLE download_queue ADD COLUMN position INTEGER NOT NULL DEFAULT 0"
            )
            # Backfill: set position = id for existing rows
            conn.execute("UPDATE download_queue SET position = id WHERE position = 0")
        except Exception:
            pass  # column already exists
        # Add custom_path_id column (migration for existing DBs)
        try:
            conn.execute("ALTER TABLE download_queue ADD COLUMN custom_path_id INTEGER")
        except Exception:
            pass  # column already exists
        # Add source column (migration for existing DBs) - marks origin: 'manual' or 'sync'
        try:
            conn.execute(
                "ALTER TABLE download_queue ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'"
            )
        except Exception:
            pass  # column already exists
        # Add captcha_url column (migration for existing DBs)
        try:
            conn.execute("ALTER TABLE download_queue ADD COLUMN captcha_url TEXT")
        except Exception:
            pass  # column already exists
        # Add archive columns for existing DBs created before the archive schema grew.
        try:
            conn.execute("ALTER TABLE download_archive ADD COLUMN username TEXT")
        except Exception:
            pass  # column already exists
        try:
            conn.execute(
                "ALTER TABLE download_archive ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'"
            )
        except Exception:
            pass  # column already exists
        try:
            conn.execute("ALTER TABLE download_archive ADD COLUMN custom_path_id INTEGER")
        except Exception:
            pass  # column already exists
        try:
            conn.execute(
                "ALTER TABLE download_archive ADD COLUMN errors TEXT NOT NULL DEFAULT '[]'"
            )
        except Exception:
            pass  # column already exists
        try:
            conn.execute("ALTER TABLE download_stats_archive ADD COLUMN username TEXT")
        except Exception:
            pass  # column already exists
        try:
            conn.execute(
                "ALTER TABLE download_stats_archive ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'"
            )
        except Exception:
            pass  # column already exists
        try:
            conn.execute(
                "ALTER TABLE download_stats_archive ADD COLUMN custom_path_id INTEGER"
            )
        except Exception:
            pass  # column already exists
        try:
            conn.execute(
                "ALTER TABLE download_stats_archive ADD COLUMN errors TEXT NOT NULL DEFAULT '[]'"
            )
        except Exception:
            pass  # column already exists
        _backfill_stats_archive(conn)
        _archive_terminal_downloads(conn)
        conn.commit()
    finally:
        conn.close()


def _queue_source_priority(source):
    value = str(source or "manual").strip().lower()
    if value.startswith("retry"):
        return 1
    if value.startswith("sync"):
        return 2
    return 0


def _rebalance_queued_positions(conn):
    rows = conn.execute(
        "SELECT id, source, total_episodes, created_at FROM download_queue "
        "WHERE status = 'queued'"
    ).fetchall()
    ordered = sorted(
        rows,
        key=lambda row: (
            _queue_source_priority(row["source"]),
            int(row["total_episodes"] or 0),
            row["created_at"] or "",
            row["id"],
        ),
    )
    for idx, row in enumerate(ordered, start=1):
        conn.execute(
            "UPDATE download_queue SET position = ? WHERE id = ?",
            (idx, row["id"]),
        )


def add_to_queue(
    title,
    series_url,
    episodes,
    language,
    provider,
    username=None,
    custom_path_id=None,
    source="manual",
):
    import json

    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO download_queue (title, series_url, episodes, total_episodes, language, provider, username, custom_path_id, source) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                title,
                series_url,
                json.dumps(episodes),
                len(episodes),
                language,
                provider,
                username,
                custom_path_id,
                source,
            ),
        )
        row_id = cur.lastrowid
        conn.execute(
            "UPDATE download_queue SET position = ? WHERE id = ?", (row_id, row_id)
        )
        _rebalance_queued_positions(conn)
        conn.commit()
        return row_id
    finally:
        conn.close()


def is_series_queued_or_running(series_url, language=None):
    """Check if a series already has a queued or running item in the download queue."""
    conn = get_db()
    try:
        query = (
            "SELECT COUNT(*) AS cnt FROM download_queue "
            "WHERE series_url = ? AND status IN ('queued', 'running')"
        )
        params = [series_url]
        if language:
            query += " AND language = ?"
            params.append(language)

        row = conn.execute(query, tuple(params)).fetchone()
        return row["cnt"] > 0
    finally:
        conn.close()


def get_queue():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM download_queue ORDER BY position ASC, id ASC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_next_queued():
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM download_queue WHERE status = 'queued' "
            "ORDER BY position ASC, id ASC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def move_queue_item(queue_id, direction):
    """Swap position of a queued item with its neighbor. direction: 'up' or 'down'."""
    conn = get_db()
    try:
        item = conn.execute(
            "SELECT id, position FROM download_queue WHERE id = ? AND status = 'queued'",
            (queue_id,),
        ).fetchone()
        if not item:
            return False, "Item not found or not queued"

        if direction == "up":
            neighbor = conn.execute(
                "SELECT id, position FROM download_queue "
                "WHERE status = 'queued' AND position < ? "
                "ORDER BY position DESC LIMIT 1",
                (item["position"],),
            ).fetchone()
        else:
            neighbor = conn.execute(
                "SELECT id, position FROM download_queue "
                "WHERE status = 'queued' AND position > ? "
                "ORDER BY position ASC LIMIT 1",
                (item["position"],),
            ).fetchone()

        if not neighbor:
            return False, "Already at the edge"

        # Swap positions
        conn.execute(
            "UPDATE download_queue SET position = ? WHERE id = ?",
            (neighbor["position"], item["id"]),
        )
        conn.execute(
            "UPDATE download_queue SET position = ? WHERE id = ?",
            (item["position"], neighbor["id"]),
        )
        _rebalance_queued_positions(conn)
        conn.commit()
        return True, None
    finally:
        conn.close()


def get_running():
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM download_queue WHERE status = 'running' LIMIT 1"
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def update_queue_progress(queue_id, current_episode, current_url):
    conn = get_db()
    try:
        conn.execute(
            "UPDATE download_queue SET current_episode = ?, current_url = ? WHERE id = ?",
            (current_episode, current_url, queue_id),
        )
        conn.commit()
    finally:
        conn.close()


def set_queue_status(queue_id, status):
    conn = get_db()
    try:
        if status in ("completed", "failed", "cancelled"):
            conn.execute(
                "UPDATE download_queue SET status = ?, completed_at = datetime('now') WHERE id = ?",
                (status, queue_id),
            )
        else:
            conn.execute(
                "UPDATE download_queue SET status = ? WHERE id = ?",
                (status, queue_id),
            )
        if status in ("completed", "failed", "cancelled"):
            _archive_terminal_downloads(conn, queue_id)
        conn.commit()
    finally:
        conn.close()


def update_queue_errors(queue_id, errors_json):
    conn = get_db()
    try:
        conn.execute(
            "UPDATE download_queue SET errors = ? WHERE id = ?",
            (errors_json, queue_id),
        )
        conn.commit()
    finally:
        conn.close()


def requeue_running_item(queue_id, errors_json=None, clear_current_url=True):
    conn = get_db()
    try:
        current_url = "" if clear_current_url else None
        if errors_json is None and current_url is None:
            conn.execute(
                "UPDATE download_queue SET status = 'queued', completed_at = NULL "
                "WHERE id = ?",
                (queue_id,),
            )
        elif errors_json is None:
            conn.execute(
                "UPDATE download_queue SET status = 'queued', completed_at = NULL, current_url = ? "
                "WHERE id = ?",
                (current_url, queue_id),
            )
        elif current_url is None:
            conn.execute(
                "UPDATE download_queue SET status = 'queued', completed_at = NULL, errors = ? "
                "WHERE id = ?",
                (errors_json, queue_id),
            )
        else:
            conn.execute(
                "UPDATE download_queue SET status = 'queued', completed_at = NULL, current_url = ?, errors = ? "
                "WHERE id = ?",
                (current_url, errors_json, queue_id),
            )
        conn.commit()
    finally:
        conn.close()


def set_captcha_url(queue_id: int, url: str):
    """Set the captcha_url field to signal the Web UI that a captcha needs solving."""
    conn = get_db()
    try:
        conn.execute(
            "UPDATE download_queue SET captcha_url = ? WHERE id = ?",
            (url, queue_id),
        )
        conn.commit()
    finally:
        conn.close()


def clear_captcha_url(queue_id: int):
    """Clear the captcha_url field after the captcha has been solved."""
    conn = get_db()
    try:
        conn.execute(
            "UPDATE download_queue SET captcha_url = NULL WHERE id = ?",
            (queue_id,),
        )
        conn.commit()
    finally:
        conn.close()


def cancel_queue_item(queue_id):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT status FROM download_queue WHERE id = ?", (queue_id,)
        ).fetchone()
        if not row:
            return False, "Item not found"
        if row["status"] != "running":
            return False, "Can only cancel running items"
        conn.execute(
            "UPDATE download_queue SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?",
            (queue_id,),
        )
        _archive_terminal_downloads(conn, queue_id)
        conn.commit()
        return True, None
    finally:
        conn.close()


def is_queue_cancelled(queue_id):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT status FROM download_queue WHERE id = ?", (queue_id,)
        ).fetchone()
        return row and row["status"] == "cancelled"
    finally:
        conn.close()


def remove_from_queue(queue_id):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT status FROM download_queue WHERE id = ?", (queue_id,)
        ).fetchone()
        if not row:
            return False, "Item not found"
        if row["status"] != "queued":
            return False, "Can only remove queued items"
        conn.execute("DELETE FROM download_queue WHERE id = ?", (queue_id,))
        _rebalance_queued_positions(conn)
        conn.commit()
        return True, None
    finally:
        conn.close()


def delete_completed_queue_item(queue_id):
    """Delete a queue item only if its status is 'completed'. Used by auto-sync cleanup."""
    conn = get_db()
    try:
        _archive_terminal_downloads(conn, queue_id)
        conn.execute(
            "DELETE FROM download_queue WHERE id = ? AND status = 'completed'",
            (queue_id,),
        )
        conn.commit()
    finally:
        conn.close()


def clear_completed():
    conn = get_db()
    try:
        _archive_terminal_downloads(conn)
        conn.execute(
            "DELETE FROM download_queue WHERE status IN ('completed', 'failed', 'cancelled')"
        )
        _rebalance_queued_positions(conn)
        conn.commit()
    finally:
        conn.close()


def delete_download_history_item(queue_id, username=None):
    scope_username = _scope_username(username)
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT queue_id, title, status FROM download_archive "
            "WHERE queue_id = ? AND COALESCE(username, '') = ?",
            (queue_id, scope_username),
        ).fetchone()
        if not row:
            return None
        conn.execute(
            "DELETE FROM download_archive WHERE queue_id = ? AND COALESCE(username, '') = ?",
            (queue_id, scope_username),
        )
        conn.commit()
        return dict(row)
    finally:
        conn.close()


# ===== Custom Download Paths =====

_CREATE_CUSTOM_PATHS_TABLE = """\
CREATE TABLE IF NOT EXISTS custom_paths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL
);
"""


def init_custom_paths_db():
    ANIWORLD_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    try:
        conn.execute(_CREATE_CUSTOM_PATHS_TABLE)
        conn.commit()
    finally:
        conn.close()


def get_custom_paths():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT id, name, path FROM custom_paths ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def add_custom_path(name, path):
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO custom_paths (name, path) VALUES (?, ?)",
            (name, path),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def remove_custom_path(path_id):
    conn = get_db()
    try:
        conn.execute("DELETE FROM custom_paths WHERE id = ?", (path_id,))
        conn.commit()
    finally:
        conn.close()


def get_custom_path_by_id(path_id):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, name, path FROM custom_paths WHERE id = ?", (path_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


# ===== Auto-Sync Jobs =====

_CREATE_AUTOSYNC_TABLE = """\
CREATE TABLE IF NOT EXISTS autosync_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    series_url TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'German Dub',
    provider TEXT NOT NULL DEFAULT 'VOE',
    custom_path_id INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1,
    added_by TEXT,
    last_check TEXT,
    last_new_found TEXT,
    episodes_found INTEGER NOT NULL DEFAULT 0,
    last_diff_json TEXT NOT NULL DEFAULT '{}',
    last_queued_json TEXT NOT NULL DEFAULT '[]',
    last_skipped_json TEXT NOT NULL DEFAULT '[]',
    last_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def init_autosync_db():
    ANIWORLD_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    try:
        conn.execute(_CREATE_AUTOSYNC_TABLE)
        columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(autosync_jobs)")
        }
        if "last_diff_json" not in columns:
            conn.execute(
                "ALTER TABLE autosync_jobs ADD COLUMN last_diff_json TEXT NOT NULL DEFAULT '{}'"
            )
        if "last_queued_json" not in columns:
            conn.execute(
                "ALTER TABLE autosync_jobs ADD COLUMN last_queued_json TEXT NOT NULL DEFAULT '[]'"
            )
        if "last_skipped_json" not in columns:
            conn.execute(
                "ALTER TABLE autosync_jobs ADD COLUMN last_skipped_json TEXT NOT NULL DEFAULT '[]'"
            )
        if "last_error" not in columns:
            conn.execute(
                "ALTER TABLE autosync_jobs ADD COLUMN last_error TEXT NOT NULL DEFAULT ''"
            )
        # Add UNIQUE index on series_url (migration for existing DBs)
        try:
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_autosync_series_url "
                "ON autosync_jobs (series_url)"
            )
        except sqlite3.IntegrityError:
            # Duplicates already exist — deduplicate keeping the lowest id
            conn.execute(
                "DELETE FROM autosync_jobs WHERE id NOT IN "
                "(SELECT MIN(id) FROM autosync_jobs GROUP BY series_url)"
            )
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_autosync_series_url "
                "ON autosync_jobs (series_url)"
            )
        conn.commit()
    finally:
        conn.close()


def add_autosync_job(
    title, series_url, language, provider, custom_path_id=None, added_by=None
):
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO autosync_jobs "
            "(title, series_url, language, provider, custom_path_id, added_by) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (title, series_url, language, provider, custom_path_id, added_by),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def get_autosync_jobs(username=None):
    """Return all sync jobs. If *username* is given, only that user's jobs."""
    conn = get_db()
    try:
        if username:
            rows = conn.execute(
                "SELECT * FROM autosync_jobs WHERE added_by = ? ORDER BY id",
                (username,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM autosync_jobs ORDER BY id").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_autosync_job(job_id):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM autosync_jobs WHERE id = ?", (job_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def find_autosync_by_url(series_url):
    """Return the first sync job that matches *series_url*, or None."""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM autosync_jobs WHERE series_url = ? LIMIT 1",
            (series_url,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def update_autosync_job(job_id, **fields):
    """Update arbitrary columns on a sync job."""
    if not fields:
        return
    allowed = {
        "title",
        "series_url",
        "language",
        "provider",
        "custom_path_id",
        "enabled",
        "last_check",
        "last_new_found",
        "episodes_found",
        "last_diff_json",
        "last_queued_json",
        "last_skipped_json",
        "last_error",
    }
    filtered = {k: v for k, v in fields.items() if k in allowed}
    if not filtered:
        return
    set_clause = ", ".join(f"{k} = ?" for k in filtered)
    values = list(filtered.values()) + [job_id]
    conn = get_db()
    try:
        conn.execute(f"UPDATE autosync_jobs SET {set_clause} WHERE id = ?", values)
        conn.commit()
    finally:
        conn.close()


def remove_autosync_job(job_id):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id FROM autosync_jobs WHERE id = ?", (job_id,)
        ).fetchone()
        if not row:
            return False, "Job not found"
        conn.execute("DELETE FROM autosync_jobs WHERE id = ?", (job_id,))
        conn.commit()
        return True, None
    finally:
        conn.close()


# ===== Favorites / Series Metadata =====

_CREATE_FAVORITES_TABLE = """\
CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    series_url TEXT NOT NULL,
    poster_url TEXT,
    site TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_opened_at TEXT
);
"""

_CREATE_FAVORITES_UNIQUE_INDEX = """\
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_username_series
ON favorites (username, series_url);
"""

_CREATE_SERIES_META_TABLE = """\
CREATE TABLE IF NOT EXISTS series_meta_cache (
    series_url TEXT PRIMARY KEY,
    title TEXT,
    poster_url TEXT,
    description TEXT,
    release_year TEXT,
    genres_json TEXT,
    last_downloaded_at TEXT,
    last_synced_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_PROVIDER_SCORE_HISTORY_TABLE = """\
CREATE TABLE IF NOT EXISTS provider_score_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    snapshot_at TEXT NOT NULL DEFAULT (datetime('now')),
    health TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    success_rate INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    cancelled INTEGER NOT NULL DEFAULT 0,
    running INTEGER NOT NULL DEFAULT 0,
    queued INTEGER NOT NULL DEFAULT 0,
    failed_24h INTEGER NOT NULL DEFAULT 0,
    episodes INTEGER NOT NULL DEFAULT 0
);
"""

_CREATE_PROVIDER_SCORE_HISTORY_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_provider_score_history_provider_time "
    "ON provider_score_history (provider, snapshot_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_provider_score_history_snapshot_at "
    "ON provider_score_history (snapshot_at DESC)",
)

_CREATE_SEARCH_HISTORY_TABLE = """\
CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL DEFAULT '',
    site TEXT NOT NULL,
    keyword TEXT NOT NULL,
    normalized_keyword TEXT NOT NULL,
    last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_CREATE_SEARCH_HISTORY_INDEX = """\
CREATE INDEX IF NOT EXISTS idx_search_history_user_site_keyword
ON search_history (username, site, normalized_keyword, last_used_at DESC);
"""


def _scope_username(username):
    return (username or "").strip()


def init_user_preferences_db():
    ANIWORLD_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    try:
        conn.execute(_CREATE_USER_PREFERENCES_TABLE)
        conn.commit()
    finally:
        conn.close()


def get_user_preference(username, pref_key, default=None):
    scope_username = _scope_username(username)
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT pref_value FROM user_preferences WHERE username = ? AND pref_key = ?",
            (scope_username, pref_key),
        ).fetchone()
        return row["pref_value"] if row else default
    finally:
        conn.close()


def set_user_preference(username, pref_key, pref_value):
    scope_username = _scope_username(username)
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO user_preferences (username, pref_key, pref_value, updated_at) "
            "VALUES (?, ?, ?, datetime('now')) "
            "ON CONFLICT(username, pref_key) DO UPDATE SET "
            "pref_value = excluded.pref_value, updated_at = datetime('now')",
            (scope_username, pref_key, pref_value),
        )
        conn.commit()
    finally:
        conn.close()


def init_audit_log_db():
    ANIWORLD_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    try:
        conn.execute(_CREATE_AUDIT_LOG_TABLE)
        for stmt in _CREATE_AUDIT_LOG_INDEXES:
            conn.execute(stmt)
        conn.commit()
    finally:
        conn.close()


def record_audit_event(
    action, username=None, subject_type=None, subject=None, details=None
):
    scope_username = _scope_username(username)
    payload = json.dumps(details or {}, ensure_ascii=False)
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO audit_log (username, action, subject_type, subject, details_json) "
            "VALUES (?, ?, ?, ?, ?)",
            (scope_username, action, subject_type, subject, payload),
        )
        conn.commit()
    finally:
        conn.close()


def list_audit_events(limit=80, username=None, action=None):
    limit = max(1, min(int(limit or 80), 200))
    conn = get_db()
    try:
        where = []
        params = []
        if username is not None:
            where.append("COALESCE(username, '') = ?")
            params.append(_scope_username(username))
        if action:
            where.append("action = ?")
            params.append(action)
        where_clause = f"WHERE {' AND '.join(where)}" if where else ""
        rows = conn.execute(
            "SELECT id, username, action, subject_type, subject, details_json, created_at "
            f"FROM audit_log {where_clause} "
            "ORDER BY created_at DESC, id DESC LIMIT ?",
            (*params, limit),
        ).fetchall()
        items = []
        for row in rows:
            item = dict(row)
            try:
                item["details"] = json.loads(item.pop("details_json") or "{}")
            except Exception:
                item["details"] = {}
            items.append(item)
        return items
    finally:
        conn.close()


def list_audit_users():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT username, COUNT(*) AS cnt, MAX(created_at) AS last_seen "
            "FROM audit_log GROUP BY username ORDER BY cnt DESC, username ASC"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def init_favorites_db():
    ANIWORLD_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    try:
        conn.execute(_CREATE_FAVORITES_TABLE)
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(favorites)")}
        if "username" not in columns:
            conn.execute(
                "ALTER TABLE favorites RENAME TO favorites_legacy"
            )
            conn.execute(_CREATE_FAVORITES_TABLE)
            conn.execute(
                "INSERT INTO favorites (id, username, title, series_url, poster_url, site, created_at, last_opened_at) "
                "SELECT id, '', title, series_url, poster_url, site, created_at, last_opened_at "
                "FROM favorites_legacy"
            )
            conn.execute("DROP TABLE favorites_legacy")
        conn.execute(_CREATE_FAVORITES_UNIQUE_INDEX)
        conn.commit()
    finally:
        conn.close()


def init_series_meta_db():
    ANIWORLD_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    try:
        conn.execute(_CREATE_SERIES_META_TABLE)
        columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(series_meta_cache)")
        }
        if "last_downloaded_at" not in columns:
            conn.execute(
                "ALTER TABLE series_meta_cache ADD COLUMN last_downloaded_at TEXT"
            )
        if "last_synced_at" not in columns:
            conn.execute("ALTER TABLE series_meta_cache ADD COLUMN last_synced_at TEXT")
        conn.commit()
    finally:
        conn.close()


def init_provider_score_history_db():
    ANIWORLD_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    try:
        conn.execute(_CREATE_PROVIDER_SCORE_HISTORY_TABLE)
        for stmt in _CREATE_PROVIDER_SCORE_HISTORY_INDEXES:
            conn.execute(stmt)
        conn.commit()
    finally:
        conn.close()


def init_search_history_db():
    ANIWORLD_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    try:
        conn.execute(_CREATE_SEARCH_HISTORY_TABLE)
        columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(search_history)")
        }
        if "username" not in columns:
            conn.execute(
                "ALTER TABLE search_history ADD COLUMN username TEXT NOT NULL DEFAULT ''"
            )
        conn.execute(_CREATE_SEARCH_HISTORY_INDEX)
        conn.commit()
    finally:
        conn.close()


def add_favorite(title, series_url, poster_url=None, site=None, username=None):
    scope_username = _scope_username(username)
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, poster_url, site FROM favorites WHERE username = ? AND series_url = ?",
            (scope_username, series_url),
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE favorites SET title = ?, poster_url = ?, site = ? WHERE id = ?",
                (
                    title,
                    poster_url or row["poster_url"],
                    site or row["site"],
                    row["id"],
                ),
            )
            conn.commit()
            return row["id"]
        cur = conn.execute(
            "INSERT INTO favorites (username, title, series_url, poster_url, site) VALUES (?, ?, ?, ?, ?)",
            (scope_username, title, series_url, poster_url, site),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def remove_favorite(series_url, username=None):
    scope_username = _scope_username(username)
    conn = get_db()
    try:
        conn.execute(
            "DELETE FROM favorites WHERE username = ? AND series_url = ?",
            (scope_username, series_url),
        )
        conn.commit()
    finally:
        conn.close()


def list_favorites(username=None):
    scope_username = _scope_username(username)
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM favorites WHERE username = ? "
            "ORDER BY COALESCE(last_opened_at, created_at) DESC, id DESC",
            (scope_username,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def touch_favorite(series_url, username=None):
    scope_username = _scope_username(username)
    conn = get_db()
    try:
        conn.execute(
            "UPDATE favorites SET last_opened_at = datetime('now') "
            "WHERE username = ? AND series_url = ?",
            (scope_username, series_url),
        )
        conn.commit()
    finally:
        conn.close()


def get_favorite(series_url, username=None):
    scope_username = _scope_username(username)
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM favorites WHERE username = ? AND series_url = ?",
            (scope_username, series_url),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def upsert_series_meta(
    series_url,
    title=None,
    poster_url=None,
    description=None,
    release_year=None,
    genres=None,
    last_downloaded_at=None,
    last_synced_at=None,
):
    import json

    genres_json = json.dumps(genres or []) if genres is not None else None
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO series_meta_cache "
            "("
            "series_url, title, poster_url, description, release_year, genres_json, "
            "last_downloaded_at, last_synced_at, updated_at"
            ") "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) "
            "ON CONFLICT(series_url) DO UPDATE SET "
            "title = COALESCE(excluded.title, series_meta_cache.title), "
            "poster_url = COALESCE(excluded.poster_url, series_meta_cache.poster_url), "
            "description = COALESCE(excluded.description, series_meta_cache.description), "
            "release_year = COALESCE(excluded.release_year, series_meta_cache.release_year), "
            "genres_json = COALESCE(excluded.genres_json, series_meta_cache.genres_json), "
            "last_downloaded_at = COALESCE(excluded.last_downloaded_at, series_meta_cache.last_downloaded_at), "
            "last_synced_at = COALESCE(excluded.last_synced_at, series_meta_cache.last_synced_at), "
            "updated_at = datetime('now')",
            (
                series_url,
                title,
                poster_url,
                description,
                release_year,
                genres_json,
                last_downloaded_at,
                last_synced_at,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def touch_series_last_downloaded(series_url):
    if not str(series_url or "").strip():
        return
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO series_meta_cache (series_url, last_downloaded_at, updated_at) "
            "VALUES (?, datetime('now'), datetime('now')) "
            "ON CONFLICT(series_url) DO UPDATE SET "
            "last_downloaded_at = datetime('now'), "
            "updated_at = datetime('now')",
            (series_url,),
        )
        conn.commit()
    finally:
        conn.close()


def touch_series_last_synced(series_url):
    if not str(series_url or "").strip():
        return
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO series_meta_cache (series_url, last_synced_at, updated_at) "
            "VALUES (?, datetime('now'), datetime('now')) "
            "ON CONFLICT(series_url) DO UPDATE SET "
            "last_synced_at = datetime('now'), "
            "updated_at = datetime('now')",
            (series_url,),
        )
        conn.commit()
    finally:
        conn.close()


def get_series_meta(series_url):
    import json

    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM series_meta_cache WHERE series_url = ?", (series_url,)
        ).fetchone()
        if not row:
            return None
        data = dict(row)
        try:
            data["genres"] = json.loads(data.pop("genres_json") or "[]")
        except Exception:
            data["genres"] = []
        return data
    finally:
        conn.close()


def list_series_meta():
    import json

    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM series_meta_cache ORDER BY updated_at DESC"
        ).fetchall()
        items = []
        for row in rows:
            data = dict(row)
            try:
                data["genres"] = json.loads(data.pop("genres_json") or "[]")
            except Exception:
                data["genres"] = []
            items.append(data)
        return items
    finally:
        conn.close()


def get_recent_series_references(limit=500):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT title, series_url, MAX(last_seen) AS last_seen "
            "FROM ("
            "  SELECT title, series_url, created_at AS last_seen "
            "  FROM download_queue "
            "  WHERE series_url IS NOT NULL AND TRIM(series_url) != '' "
            "  UNION ALL "
            "  SELECT title, series_url, COALESCE(completed_at, created_at) AS last_seen "
            "  FROM download_archive "
            "  WHERE series_url IS NOT NULL AND TRIM(series_url) != ''"
            ") refs "
            "GROUP BY title, series_url "
            "ORDER BY last_seen DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def record_search_query(site, keyword, username=None):
    normalized = " ".join((keyword or "").strip().lower().split())
    if not normalized:
        return

    scope_username = _scope_username(username)
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id FROM search_history WHERE username = ? AND site = ? AND normalized_keyword = ?",
            (scope_username, site, normalized),
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE search_history SET keyword = ?, last_used_at = datetime('now') "
                "WHERE id = ?",
                (keyword.strip(), row["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO search_history (username, site, keyword, normalized_keyword) "
                "VALUES (?, ?, ?, ?)",
                (scope_username, site, keyword.strip(), normalized),
            )
        conn.commit()
    finally:
        conn.close()


def list_recent_searches(site, limit=6, username=None):
    scope_username = _scope_username(username)
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT keyword, last_used_at FROM search_history "
            "WHERE username = ? AND site = ? "
            "ORDER BY last_used_at DESC LIMIT ?",
            (scope_username, site, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_search_suggestions(site, query="", limit=8, username=None):
    normalized = " ".join((query or "").strip().lower().split())
    scope_username = _scope_username(username)
    conn = get_db()
    try:
        if normalized:
            rows = conn.execute(
                "SELECT keyword, last_used_at FROM search_history "
                "WHERE username = ? AND site = ? AND normalized_keyword LIKE ? "
                "ORDER BY "
                "CASE WHEN normalized_keyword = ? THEN 0 "
                "WHEN normalized_keyword LIKE ? THEN 1 "
                "ELSE 2 END, "
                "last_used_at DESC "
                "LIMIT ?",
                (
                    scope_username,
                    site,
                    f"%{normalized}%",
                    normalized,
                    f"{normalized}%",
                    limit,
                ),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT keyword, last_used_at FROM search_history "
                "WHERE username = ? AND site = ? "
                "ORDER BY last_used_at DESC LIMIT ?",
                (scope_username, site, limit),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ===== Statistics =====


def get_sync_stats(username=None):
    conn = get_db()
    try:
        total = conn.execute("SELECT COUNT(*) AS cnt FROM autosync_jobs").fetchone()[
            "cnt"
        ]
        enabled = conn.execute(
            "SELECT COUNT(*) AS cnt FROM autosync_jobs WHERE enabled = 1"
        ).fetchone()["cnt"]
        disabled = total - enabled
        last_check = conn.execute(
            "SELECT MAX(last_check) AS lc FROM autosync_jobs"
        ).fetchone()["lc"]
        last_new = conn.execute(
            "SELECT MAX(last_new_found) AS ln FROM autosync_jobs"
        ).fetchone()["ln"]
        total_eps = conn.execute(
            "SELECT COALESCE(SUM(episodes_found), 0) AS s FROM autosync_jobs"
        ).fetchone()["s"]
        jobs = conn.execute(
            "SELECT id, title, series_url, language, provider, enabled, "
            "last_check, last_new_found, episodes_found, added_by, created_at "
            "FROM autosync_jobs ORDER BY id",
        ).fetchall()
        return {
            "total_jobs": total,
            "enabled": enabled,
            "disabled": disabled,
            "last_check": last_check,
            "last_new_found": last_new,
            "total_episodes_found": total_eps,
            "jobs": [dict(r) for r in jobs],
        }
    finally:
        conn.close()


def get_queue_stats(username=None):
    conn = get_db()
    try:
        total = conn.execute("SELECT COUNT(*) AS cnt FROM download_queue").fetchone()[
            "cnt"
        ]
        by_status = {}
        for row in conn.execute(
            "SELECT status, COUNT(*) AS cnt FROM download_queue GROUP BY status",
        ).fetchall():
            by_status[row["status"]] = row["cnt"]
        running = conn.execute(
            "SELECT title, current_episode, total_episodes FROM download_queue "
            "WHERE status = 'running' LIMIT 1",
        ).fetchone()
        return {
            "total": total,
            "by_status": by_status,
            "currently_running": dict(running) if running else None,
        }
    finally:
        conn.close()


def get_general_stats(username=None):
    conn = get_db()
    try:
        total_downloads = conn.execute(
            "SELECT COUNT(*) AS cnt FROM download_stats_archive "
            "WHERE status IN ('completed', 'failed')",
        ).fetchone()["cnt"]
        completed = conn.execute(
            "SELECT COUNT(*) AS cnt FROM download_stats_archive "
            "WHERE status = 'completed'",
        ).fetchone()["cnt"]
        failed = conn.execute(
            "SELECT COUNT(*) AS cnt FROM download_stats_archive "
            "WHERE status = 'failed'",
        ).fetchone()["cnt"]
        total_episodes = conn.execute(
            "SELECT COALESCE(SUM(total_episodes), 0) AS s FROM download_stats_archive "
            "WHERE status = 'completed'",
        ).fetchone()["s"]
        last_24h = conn.execute(
            "SELECT COUNT(*) AS cnt FROM download_stats_archive "
            "WHERE status = 'completed' "
            "AND completed_at >= datetime('now', '-1 day')",
        ).fetchone()["cnt"]
        # Average duration (completed items with both timestamps)
        avg_dur = conn.execute(
            "SELECT AVG("
            "  (julianday(completed_at) - julianday(created_at)) * 86400"
            ") AS avg_s FROM download_stats_archive "
            "WHERE status = 'completed' AND completed_at IS NOT NULL",
        ).fetchone()["avg_s"]
        avg_eps = conn.execute(
            "SELECT AVG(total_episodes) AS avg_eps FROM download_stats_archive "
            "WHERE status = 'completed'",
        ).fetchone()["avg_eps"]
        # Most downloaded titles
        top_titles = conn.execute(
            "SELECT title, COUNT(*) AS cnt FROM download_stats_archive "
            "WHERE status = 'completed' "
            "GROUP BY title ORDER BY cnt DESC LIMIT 10",
        ).fetchall()
        # Episodes per language
        by_language = conn.execute(
            "SELECT language, COUNT(*) AS cnt, "
            "COALESCE(SUM(total_episodes), 0) AS eps "
            "FROM download_stats_archive WHERE status = 'completed' "
            "GROUP BY language ORDER BY cnt DESC",
        ).fetchall()
        # Anime vs Series (heuristic: aniworld.to = anime, s.to = series)
        anime_count = conn.execute(
            "SELECT COUNT(*) AS cnt FROM download_stats_archive "
            "WHERE status = 'completed' AND series_url LIKE '%aniworld.to%'",
        ).fetchone()["cnt"]
        series_count = conn.execute(
            "SELECT COUNT(*) AS cnt FROM download_stats_archive "
            "WHERE status = 'completed' AND series_url LIKE '%s.to%'",
        ).fetchone()["cnt"]
        return {
            "total_downloads": total_downloads,
            "completed": completed,
            "failed": failed,
            "total_episodes": total_episodes,
            "last_24h_completed": last_24h,
            "average_duration_seconds": round(avg_dur, 1) if avg_dur else None,
            "average_episodes_per_download": round(avg_eps, 1) if avg_eps else None,
            "average_seconds_per_episode": (
                round(avg_dur / avg_eps, 1) if avg_dur and avg_eps else None
            ),
            "top_titles": [
                {"title": r["title"], "count": r["cnt"]} for r in top_titles
            ],
            "by_language": [
                {"language": r["language"], "downloads": r["cnt"], "episodes": r["eps"]}
                for r in by_language
            ],
            "anime_downloads": anime_count,
            "series_downloads": series_count,
        }
    finally:
        conn.close()


def get_recent_activity(limit=10, username=None):
    scope_username = _scope_username(username)
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT id, title, series_url, language, provider, status, total_episodes, "
            "source, created_at, completed_at, username, custom_path_id, errors "
            "FROM download_queue "
            "WHERE COALESCE(username, '') = ? "
            "ORDER BY COALESCE(completed_at, created_at) DESC, id DESC LIMIT ?",
            (scope_username, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_download_history(limit=40, username=None):
    scope_username = _scope_username(username)
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT queue_id AS id, title, series_url, language, provider, status, total_episodes, "
            "source, created_at, completed_at, username, custom_path_id, errors "
            "FROM download_archive "
            "WHERE COALESCE(username, '') = ? "
            "ORDER BY COALESCE(completed_at, created_at) DESC, queue_id DESC LIMIT ?",
            (scope_username, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_provider_quality(username=None):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT provider, "
            "SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed, "
            "SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed, "
            "SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled, "
            "COALESCE(SUM(CASE WHEN status = 'completed' THEN total_episodes ELSE 0 END), 0) AS episodes "
            "FROM download_stats_archive "
            "GROUP BY provider ORDER BY completed DESC, failed ASC, provider ASC",
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_provider_health(username=None):
    conn = get_db()
    try:
        archive_rows = conn.execute(
            "SELECT provider, "
            "SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed, "
            "SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed, "
            "SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled, "
            "COALESCE(SUM(CASE WHEN status = 'completed' THEN total_episodes ELSE 0 END), 0) AS episodes, "
            "MAX(CASE WHEN status = 'completed' THEN completed_at END) AS last_success_at, "
            "MAX(CASE WHEN status = 'failed' THEN completed_at END) AS last_failure_at, "
            "SUM(CASE WHEN status = 'failed' AND completed_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS failed_24h "
            "FROM download_stats_archive "
            "GROUP BY provider",
        ).fetchall()
        queue_rows = conn.execute(
            "SELECT provider, "
            "SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running, "
            "SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued "
            "FROM download_queue "
            "GROUP BY provider",
        ).fetchall()

        items = {}
        for row in archive_rows:
            items[row["provider"]] = {
                "provider": row["provider"],
                "completed": int(row["completed"] or 0),
                "failed": int(row["failed"] or 0),
                "cancelled": int(row["cancelled"] or 0),
                "episodes": int(row["episodes"] or 0),
                "running": 0,
                "queued": 0,
                "failed_24h": int(row["failed_24h"] or 0),
                "last_success_at": row["last_success_at"],
                "last_failure_at": row["last_failure_at"],
            }

        for row in queue_rows:
            item = items.setdefault(
                row["provider"],
                {
                    "provider": row["provider"],
                    "completed": 0,
                    "failed": 0,
                    "cancelled": 0,
                    "episodes": 0,
                    "running": 0,
                    "queued": 0,
                    "failed_24h": 0,
                    "last_success_at": None,
                    "last_failure_at": None,
                },
            )
            item["running"] = int(row["running"] or 0)
            item["queued"] = int(row["queued"] or 0)

        ordered = []
        for item in items.values():
            total_finished = item["completed"] + item["failed"]
            success_rate = (
                round((item["completed"] / total_finished) * 100)
                if total_finished
                else 0
            )
            if item["running"] > 0:
                health = "active"
            elif total_finished == 0 and item["queued"] == 0:
                health = "idle"
            elif success_rate >= 85 and item["failed_24h"] <= 1:
                health = "healthy"
            elif success_rate >= 60:
                health = "watch"
            else:
                health = "poor"
            score = max(
                0,
                min(
                    100,
                    round(
                        success_rate
                        + min(item["completed"], 25)
                        - min(item["failed"] * 4, 28)
                        - min(item["failed_24h"] * 6, 18)
                        + min(item["running"] * 2 + item["queued"], 8)
                    ),
                ),
            )
            ordered.append(
                {
                    **item,
                    "success_rate": success_rate,
                    "health": health,
                    "score": score,
                }
            )

        priority = {"active": 0, "healthy": 1, "watch": 2, "poor": 3, "idle": 4}
        ordered.sort(
            key=lambda item: (
                priority.get(item["health"], 9),
                -item["score"],
                -(item["running"] + item["queued"]),
                -(item["completed"] + item["failed"]),
                item["provider"],
            )
        )
        for rank, item in enumerate(ordered, start=1):
            item["rank"] = rank
        return ordered
    finally:
        conn.close()


def snapshot_provider_score_history(items, minimum_interval_minutes=30):
    rows = [dict(item) for item in (items or []) if item.get("provider")]
    if not rows:
        return 0
    conn = get_db()
    try:
        latest = conn.execute(
            "SELECT MAX(snapshot_at) AS latest FROM provider_score_history"
        ).fetchone()["latest"]
        if latest:
            diff_minutes = conn.execute(
                "SELECT CAST((julianday('now') - julianday(?)) * 24 * 60 AS INTEGER) AS diff",
                (latest,),
            ).fetchone()["diff"]
            if diff_minutes is not None and int(diff_minutes) < int(
                minimum_interval_minutes
            ):
                return 0

        for item in rows:
            conn.execute(
                "INSERT INTO provider_score_history ("
                "provider, health, score, success_rate, completed, failed, cancelled, "
                "running, queued, failed_24h, episodes"
                ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    item.get("provider"),
                    item.get("health") or "idle",
                    int(item.get("score") or 0),
                    int(item.get("success_rate") or 0),
                    int(item.get("completed") or 0),
                    int(item.get("failed") or 0),
                    int(item.get("cancelled") or 0),
                    int(item.get("running") or 0),
                    int(item.get("queued") or 0),
                    int(item.get("failed_24h") or 0),
                    int(item.get("episodes") or 0),
                ),
            )
        conn.commit()
        return len(rows)
    finally:
        conn.close()


def get_provider_score_history(hours=168):
    hours = max(1, min(int(hours or 168), 24 * 30))
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT provider, snapshot_at, health, score, success_rate, completed, failed, "
            "running, queued, failed_24h, episodes "
            "FROM provider_score_history "
            "WHERE snapshot_at >= datetime('now', ?) "
            "ORDER BY snapshot_at ASC, provider ASC",
            (f"-{hours} hours",),
        ).fetchall()
        grouped = {}
        for row in rows:
            item = dict(row)
            grouped.setdefault(item["provider"], []).append(item)
        return grouped
    finally:
        conn.close()


def get_provider_failure_analytics(limit_reasons=6):
    limit_reasons = max(1, min(int(limit_reasons or 6), 12))
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT provider, title, completed_at, errors "
            "FROM download_stats_archive "
            "WHERE status = 'failed' "
            "ORDER BY COALESCE(completed_at, created_at) DESC",
        ).fetchall()

        analytics = {}
        for row in rows:
            provider = row["provider"] or "Unknown"
            item = analytics.setdefault(
                provider,
                {
                    "provider": provider,
                    "failed_total": 0,
                    "latest_failure_at": None,
                    "top_reasons": {},
                    "latest_titles": [],
                },
            )
            item["failed_total"] += 1
            if not item["latest_failure_at"] and row["completed_at"]:
                item["latest_failure_at"] = row["completed_at"]
            title = row["title"] or "Unknown Title"
            if title not in item["latest_titles"]:
                item["latest_titles"].append(title)
                item["latest_titles"] = item["latest_titles"][:5]

            try:
                errors = json.loads(row["errors"] or "[]")
            except Exception:
                errors = []
            if not isinstance(errors, list):
                errors = []

            for entry in errors:
                if not isinstance(entry, dict):
                    continue
                raw_message = (
                    entry.get("error")
                    or entry.get("message")
                    or entry.get("type")
                    or "Unknown failure"
                )
                reason = str(raw_message).strip().splitlines()[0][:140] or "Unknown failure"
                item["top_reasons"][reason] = item["top_reasons"].get(reason, 0) + 1

        ordered = []
        for item in analytics.values():
            top_reasons = sorted(
                item["top_reasons"].items(),
                key=lambda reason_item: (-reason_item[1], reason_item[0].lower()),
            )[:limit_reasons]
            ordered.append(
                {
                    "provider": item["provider"],
                    "failed_total": item["failed_total"],
                    "latest_failure_at": item["latest_failure_at"],
                    "top_reasons": [
                        {"reason": reason, "count": count}
                        for reason, count in top_reasons
                    ],
                    "latest_titles": item["latest_titles"],
                }
            )

        ordered.sort(
            key=lambda item: (
                -int(item["failed_total"] or 0),
                -(len(item["top_reasons"])),
                item["provider"].lower(),
            )
        )
        return ordered
    finally:
        conn.close()


def get_download_session_history(limit=80):
    limit = max(1, min(int(limit or 80), 300))
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT queue_id AS id, title, series_url, language, provider, username, status, "
            "source, total_episodes, created_at, completed_at, custom_path_id, errors, "
            "ROUND((julianday(COALESCE(completed_at, created_at)) - julianday(created_at)) * 86400, 1) AS duration_seconds "
            "FROM download_stats_archive "
            "ORDER BY COALESCE(completed_at, created_at) DESC, queue_id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        sessions = []
        for row in rows:
            item = dict(row)
            try:
                item["errors"] = json.loads(item.get("errors") or "[]")
            except Exception:
                item["errors"] = []
            sessions.append(item)
        return sessions
    finally:
        conn.close()


def get_activity_chart(days=7, username=None):
    from datetime import datetime, timedelta

    conn = get_db()
    try:
        since = (datetime.utcnow() - timedelta(days=max(days - 1, 0))).strftime(
            "%Y-%m-%d 00:00:00"
        )
        rows = conn.execute(
            "SELECT substr(completed_at, 1, 10) AS day, COUNT(*) AS completed "
            "FROM download_stats_archive "
            "WHERE status = 'completed' AND completed_at >= ? "
            "GROUP BY substr(completed_at, 1, 10)",
            (since,),
        ).fetchall()
        row_map = {r["day"]: r["completed"] for r in rows}
        result = []
        for offset in range(days):
            day = datetime.utcnow().date() - timedelta(days=days - offset - 1)
            key = day.strftime("%Y-%m-%d")
            result.append({"day": key, "completed": row_map.get(key, 0)})
        return result
    finally:
        conn.close()


def retry_queue_item(queue_id, provider_override=None):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT title, series_url, episodes, total_episodes, language, provider, username, "
            "custom_path_id, source, status "
            "FROM download_queue WHERE id = ?",
            (queue_id,),
        ).fetchone()
        if not row:
            return None, "Item not found"
        if row["status"] not in ("failed", "cancelled"):
            return None, "Only failed or cancelled items can be retried"
        cur = conn.execute(
            "INSERT INTO download_queue "
            "(title, series_url, episodes, total_episodes, language, provider, username, custom_path_id, source) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                row["title"],
                row["series_url"],
                row["episodes"],
                row["total_episodes"],
                row["language"],
                provider_override or row["provider"],
                row["username"],
                row["custom_path_id"],
                f"retry:{row['source'] or 'manual'}",
            ),
        )
        new_id = cur.lastrowid
        conn.execute(
            "UPDATE download_queue SET position = ? WHERE id = ?", (new_id, new_id)
        )
        _rebalance_queued_positions(conn)
        conn.commit()
        return new_id, None
    finally:
        conn.close()


def retry_failed_queue_items(provider_overrides=None):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT id, title, series_url, episodes, total_episodes, language, provider, username, "
            "custom_path_id, source "
            "FROM download_queue WHERE status = 'failed' ORDER BY id ASC"
        ).fetchall()
        created = 0
        for row in rows:
            cur = conn.execute(
                "INSERT INTO download_queue "
                "(title, series_url, episodes, total_episodes, language, provider, username, custom_path_id, source) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    row["title"],
                    row["series_url"],
                    row["episodes"],
                    row["total_episodes"],
                    row["language"],
                    (provider_overrides or {}).get(row["id"]) or row["provider"],
                    row["username"],
                    row["custom_path_id"],
                    f"retry:{row['source'] or 'manual'}",
                ),
            )
            new_id = cur.lastrowid
            conn.execute(
                "UPDATE download_queue SET position = ? WHERE id = ?",
                (new_id, new_id),
            )
            created += 1
        _rebalance_queued_positions(conn)
        conn.commit()
        return created
    finally:
        conn.close()


def export_app_state():
    tables = [
        "custom_paths",
        "favorites",
        "autosync_jobs",
        "series_meta_cache",
        "search_history",
        "user_preferences",
        "download_stats_archive",
        "provider_score_history",
    ]
    conn = get_db()
    try:
        state = {}
        for table in tables:
            rows = conn.execute(f"SELECT * FROM {table}").fetchall()
            state[table] = [dict(row) for row in rows]
        return state
    finally:
        conn.close()


def import_app_state(payload):
    if not isinstance(payload, dict):
        raise ValueError("Invalid backup payload")

    allowed_tables = {
        "custom_paths",
        "favorites",
        "autosync_jobs",
        "series_meta_cache",
        "search_history",
        "user_preferences",
        "download_stats_archive",
        "provider_score_history",
    }
    conn = get_db()
    try:
        counts = {}
        for table, rows in payload.items():
            if table not in allowed_tables:
                continue
            if not isinstance(rows, list):
                continue
            columns = [
                row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
            ]
            if not columns:
                continue
            placeholders = ", ".join(["?"] * len(columns))
            column_sql = ", ".join(columns)
            imported = 0
            for row in rows:
                if not isinstance(row, dict):
                    continue
                values = [row.get(column) for column in columns]
                conn.execute(
                    f"INSERT OR REPLACE INTO {table} ({column_sql}) VALUES ({placeholders})",
                    values,
                )
                imported += 1
            counts[table] = imported
        conn.commit()
        return counts
    finally:
        conn.close()
