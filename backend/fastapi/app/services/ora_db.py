import os
import json
import sqlite3
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

class ORADatabaseManager:
    def __init__(self):
        self.db_url = os.getenv("DATABASE_URL")
        self.use_sqlite = False
        self.sqlite_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "ora_memory.db")
        self._init_db()

    def _init_db(self):
        # 1. Attempt PostgreSQL
        if self.db_url:
            if self.db_url.startswith("postgres://"):
                self.db_url = self.db_url.replace("postgres://", "postgresql://", 1)
            try:
                conn = psycopg2.connect(self.db_url, connect_timeout=3)
                conn.autocommit = True
                cursor = conn.cursor()
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS public.ora_conversations (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                    content TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
                );
                CREATE TABLE IF NOT EXISTS public.ora_user_profile (
                    user_id TEXT PRIMARY KEY,
                    summarized_memory TEXT NOT NULL DEFAULT '',
                    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_ora_conversations_user_id ON public.ora_conversations(user_id);
                """)
                cursor.close()
                conn.close()
                print("ORA database successfully initialized in PostgreSQL.")
                return
            except Exception as e:
                print(f"ORA: PostgreSQL initialization failed ({e}). Falling back to local SQLite.")
        
        # 2. Local SQLite Fallback
        self.use_sqlite = True
        try:
            conn = sqlite3.connect(self.sqlite_path)
            cursor = conn.cursor()
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS ora_conversations (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS ora_user_profile (
                user_id TEXT PRIMARY KEY,
                summarized_memory TEXT NOT NULL DEFAULT '',
                preferences TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_ora_conv_uid ON ora_conversations(user_id);")
            conn.commit()
            conn.close()
            print(f"ORA database successfully initialized in local SQLite: {self.sqlite_path}")
        except Exception as se:
            print(f"ORA SQLite initialization error: {se}")

    def _get_connection(self):
        if self.use_sqlite:
            conn = sqlite3.connect(self.sqlite_path)
            conn.row_factory = sqlite3.Row
            return conn
        else:
            return psycopg2.connect(self.db_url)

    async def add_message(self, user_id: str, role: str, content: str) -> Dict[str, Any]:
        """Saves a conversation message."""
        now_str = datetime.now(timezone.utc).isoformat()
        
        if self.use_sqlite:
            msg_id = str(uuid.uuid4())
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO ora_conversations (id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
                    (msg_id, user_id, role, content, now_str)
                )
                conn.commit()
                return {
                    "id": msg_id,
                    "user_id": user_id,
                    "role": role,
                    "content": content,
                    "created_at": now_str
                }
            finally:
                conn.close()
        else:
            conn = self._get_connection()
            try:
                cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                cursor.execute(
                    "INSERT INTO public.ora_conversations (user_id, role, content) VALUES (%s, %s, %s) RETURNING id, user_id, role, content, created_at",
                    (user_id, role, content)
                )
                res = cursor.fetchone()
                conn.commit()
                # Convert datetime to ISO string
                if res and "created_at" in res:
                    res["created_at"] = res["created_at"].isoformat()
                return dict(res) if res else {}
            finally:
                cursor.close()
                conn.close()

    async def get_history(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns the conversation history sorted by time (ascending for LLM context)."""
        if self.use_sqlite:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT id, role, content, created_at FROM ora_conversations WHERE user_id = ? ORDER BY created_at ASC LIMIT ?",
                    (user_id, limit)
                )
                rows = cursor.fetchall()
                return [dict(r) for r in rows]
            finally:
                conn.close()
        else:
            conn = self._get_connection()
            try:
                cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                cursor.execute(
                    "SELECT id, role, content, created_at FROM public.ora_conversations WHERE user_id = %s ORDER BY created_at ASC LIMIT %s",
                    (user_id, limit)
                )
                rows = cursor.fetchall()
                result = []
                for row in rows:
                    r = dict(row)
                    # Convert UUID objects and datetime objects
                    r["id"] = str(r["id"])
                    if r.get("created_at"):
                        r["created_at"] = r["created_at"].isoformat()
                    result.append(r)
                return result
            finally:
                cursor.close()
                conn.close()

    async def delete_history(self, user_id: str) -> bool:
        """Deletes history and profile data for the user."""
        if self.use_sqlite:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM ora_conversations WHERE user_id = ?", (user_id,))
                cursor.execute("DELETE FROM ora_user_profile WHERE user_id = ?", (user_id,))
                conn.commit()
                return True
            except Exception:
                return False
            finally:
                conn.close()
        else:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM public.ora_conversations WHERE user_id = %s", (user_id,))
                cursor.execute("DELETE FROM public.ora_user_profile WHERE user_id = %s", (user_id,))
                conn.commit()
                return True
            except Exception:
                return False
            finally:
                cursor.close()
                conn.close()

    async def get_user_profile(self, user_id: str) -> Dict[str, Any]:
        """Loads or creates user profile memory."""
        if self.use_sqlite:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT summarized_memory, preferences FROM ora_user_profile WHERE user_id = ?", (user_id,))
                row = cursor.fetchone()
                if row:
                    try:
                        prefs = json.loads(row["preferences"])
                    except Exception:
                        prefs = {}
                    return {
                        "user_id": user_id,
                        "summarized_memory": row["summarized_memory"],
                        "preferences": prefs
                    }
                else:
                    return {
                        "user_id": user_id,
                        "summarized_memory": "",
                        "preferences": {}
                    }
            finally:
                conn.close()
        else:
            conn = self._get_connection()
            try:
                cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                cursor.execute("SELECT summarized_memory, preferences FROM public.ora_user_profile WHERE user_id = %s", (user_id,))
                row = cursor.fetchone()
                if row:
                    r = dict(row)
                    return {
                        "user_id": user_id,
                        "summarized_memory": r["summarized_memory"],
                        "preferences": r["preferences"] or {}
                    }
                else:
                    return {
                        "user_id": user_id,
                        "summarized_memory": "",
                        "preferences": {}
                    }
            finally:
                cursor.close()
                conn.close()

    async def save_user_profile(self, user_id: str, summarized_memory: str, preferences: dict) -> bool:
        """Upserts user profile memory."""
        now_str = datetime.now(timezone.utc).isoformat()
        
        if self.use_sqlite:
            prefs_str = json.dumps(preferences)
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT OR REPLACE INTO ora_user_profile (user_id, summarized_memory, preferences, updated_at) VALUES (?, ?, ?, ?)",
                    (user_id, summarized_memory, prefs_str, now_str)
                )
                conn.commit()
                return True
            except Exception:
                return False
            finally:
                conn.close()
        else:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO public.ora_user_profile (user_id, summarized_memory, preferences, updated_at) 
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        summarized_memory = EXCLUDED.summarized_memory, 
                        preferences = EXCLUDED.preferences, 
                        updated_at = EXCLUDED.updated_at
                    """,
                    (user_id, summarized_memory, json.dumps(preferences), datetime.now(timezone.utc))
                )
                conn.commit()
                return True
            except Exception:
                return False
            finally:
                cursor.close()
                conn.close()

# Singleton instance
ora_db = ORADatabaseManager()
