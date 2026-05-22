"""
services/embedding.py - OpenAI-compatible Embedding API

支持任意 OpenAI 兼容的 Embedding 服务：
- LM Studio: http://localhost:1234/v1 (模型: text-embedding-nomic-embed-text-v2-moe)
- Ollama:    http://localhost:11434/v1 (模型: nomic-embed-text)

切换只需修改 .env 中的 EMBEDDING_API_BASE 和 EMBEDDING_MODEL。

注意：使用 requests（同步）而非 httpx 调用 embedding API，
因为 LM Studio 本地服务与 httpx 存在 HTTP 协议兼容性问题（持续 502），
而 requests 库工作正常。async 函数通过 asyncio.to_thread 包装同步调用。
"""
import asyncio
import logging
from typing import List, Optional

import numpy as np
import requests

logger = logging.getLogger(__name__)

# Default values — overridden by config.py settings from .env
DEFAULT_EMBEDDING_MODEL = "nomic-embed-text"
DEFAULT_EMBEDDING_URL = "http://localhost:11434/v1/embeddings"


def is_embedding_available(api_key: Optional[str]) -> bool:
    """检查是否配置了有效的 embedding API key。"""
    return bool(api_key and api_key.strip())


def _call_embedding_api_sync(
    url: str,
    headers: dict,
    payload: dict,
    timeout: float = 30.0,
) -> Optional[dict]:
    """
    同步调用 Embedding API（使用 requests 库）。
    返回完整 JSON 响应，失败返回 None。
    """
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=timeout)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.warning(f"Embedding API call failed: {e}")
        return None


async def get_embedding(
    text: str,
    api_key: str,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Optional[List[float]]:
    """
    调用 OpenAI 兼容 Embedding API 获取单个文本的向量。
    失败时返回 None（触发 fallback）。
    """
    from config import settings

    if not text or not api_key:
        return None

    _model = model or settings.embedding_model or DEFAULT_EMBEDDING_MODEL
    _url = (base_url or settings.embedding_api_base or "http://localhost:11434/v1").rstrip("/") + "/embeddings"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _model,
        "input": text[:8000],  # 截断超长文本
    }

    data = await asyncio.to_thread(_call_embedding_api_sync, _url, headers, payload, 30.0)
    if data is None:
        logger.warning("Embedding API returned None")
        return None

    try:
        embedding = data["data"][0]["embedding"]
        logger.debug(f"Embedding generated, dim={len(embedding)}")
        return embedding
    except (KeyError, IndexError) as e:
        logger.warning(f"Embedding response parse error: {e}")
        return None


async def get_embeddings(
    texts: List[str],
    api_key: str,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Optional[List[List[float]]]:
    """
    批量调用 OpenAI 兼容 Embedding API。
    失败时返回 None。
    """
    from config import settings

    if not texts or not api_key:
        return None

    _model = model or settings.embedding_model or DEFAULT_EMBEDDING_MODEL
    _url = (base_url or settings.embedding_api_base or "http://localhost:11434/v1").rstrip("/") + "/embeddings"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _model,
        "input": [text[:8000] for text in texts],
    }

    data = await asyncio.to_thread(_call_embedding_api_sync, _url, headers, payload, 60.0)
    if data is None:
        logger.warning("Batch embedding API returned None")
        return None

    try:
        embeddings = [item["embedding"] for item in data["data"]]
        return embeddings
    except (KeyError, IndexError) as e:
        logger.warning(f"Batch embedding response parse error: {e}")
        return None


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """计算两个向量的余弦相似度。"""
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))
