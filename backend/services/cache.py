"""
Simple in-memory cache with TTL support.
Useful for expensive DB queries that don't change frequently (stats, seasonal analysis, etc.)
"""
import time
from typing import Any, Optional, Dict
import threading
import logging

logger = logging.getLogger(__name__)


class TTLCache:
    """Thread-safe in-memory cache with per-key TTL."""

    def __init__(self, default_ttl: int = 300):
        """
        Args:
            default_ttl: Default time-to-live in seconds (default: 5 minutes)
        """
        self._cache: Dict[str, tuple[Any, float]] = {}
        self._lock = threading.Lock()
        self.default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache. Returns None if expired or missing."""
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if time.time() > expires_at:
                del self._cache[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value with TTL."""
        ttl = ttl if ttl is not None else self.default_ttl
        with self._lock:
            self._cache[key] = (value, time.time() + ttl)

    def invalidate(self, key: str) -> None:
        """Remove a specific key from cache."""
        with self._lock:
            self._cache.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> int:
        """Remove all keys starting with prefix. Returns count of removed keys."""
        with self._lock:
            keys_to_remove = [k for k in self._cache if k.startswith(prefix)]
            for k in keys_to_remove:
                del self._cache[k]
            return len(keys_to_remove)

    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            self._cache.clear()

    def stats(self) -> Dict[str, Any]:
        """Return cache statistics."""
        with self._lock:
            now = time.time()
            active = sum(1 for _, (_, exp) in self._cache.items() if now < exp)
            expired = len(self._cache) - active
            return {
                "total_keys": len(self._cache),
                "active": active,
                "expired": expired,
                "keys": list(self._cache.keys()),
            }


# Global cache instance — 5 minute default TTL
cache = TTLCache(default_ttl=300)
