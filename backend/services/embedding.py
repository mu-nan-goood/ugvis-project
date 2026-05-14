"""
services/embedding.py - OpenAI Embedding API + Local TF-IDF Fallback
"""
import logging
from typing import List, Optional

import httpx
import numpy as np

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-nomic-embed-text-v2-moe"
EMBEDDING_URL = "http://localhost:1234/v1/embeddings"


def is_embedding_available(api_key: Optional[str]) -> bool:
    """检查是否配置了有效的 embedding API key。"""
    return bool(api_key and api_key.strip())


async def get_embedding(
    text: str,
    api_key: str,
    model: str = EMBEDDING_MODEL,
    base_url: Optional[str] = None,
) -> Optional[List[float]]:
    """
    调用 OpenAI Embedding API 获取单个文本的向量。
    失败时返回 None（触发 fallback）。
    """
    if not text or not api_key:
        return None

    url = (base_url or EMBEDDING_URL).rstrip("/") + "/embeddings"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "input": text[:8000],  # 截断超长文本
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            embedding = data["data"][0]["embedding"]
            logger.debug(f"Embedding generated, dim={len(embedding)}")
            return embedding
    except Exception as e:
        logger.warning(f"Embedding API failed: {e}, will use TF-IDF fallback")
        return None


async def get_embeddings(
    texts: List[str],
    api_key: str,
    model: str = EMBEDDING_MODEL,
    base_url: Optional[str] = None,
) -> Optional[List[List[float]]]:
    """
    批量调用 OpenAI Embedding API。
    失败时返回 None。
    """
    if not texts or not api_key:
        return None

    url = (base_url or EMBEDDING_URL).rstrip("/") + "/embeddings"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "input": [text[:8000] for text in texts],
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            embeddings = [item["embedding"] for item in data["data"]]
            return embeddings
    except Exception as e:
        logger.warning(f"Batch embedding API failed: {e}")
        return None


# ─── TF-IDF Fallback ────────────────────────────────────────────────────────────

_tfidf_vectorizer: Optional["sklearn.feature_extraction.text.TfidfVectorizer"] = None
_tfidf_fitted: bool = False


def _get_tfidf_vectorizer():
    """懒加载 TF-IDF 向量器（用于 API 不可用时的 fallback）。"""
    global _tfidf_vectorizer
    if _tfidf_vectorizer is None:
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            _tfidf_vectorizer = TfidfVectorizer(
                max_features=384,
                ngram_range=(1, 2),
                stop_words="english",
            )
        except ImportError:
            logger.error("scikit-learn not installed, TF-IDF fallback unavailable")
            return None
    return _tfidf_vectorizer


def compute_tfidf_fallback(texts: List[str]) -> Optional[np.ndarray]:
    """
    使用 TF-IDF 生成伪嵌入向量（用于 API 不可用时的 fallback）。
    返回 (n, max_features) numpy 数组，n = len(texts)。
    """
    vectorizer = _get_tfidf_vectorizer()
    if vectorizer is None:
        return None

    global _tfidf_fitted
    try:
        if not _tfidf_fitted:
            # 预热：用一个空列表初始化，使 vectorizer 可用
            vectorizer.fit(["placeholder"])
            _tfidf_fitted = True

        # fit_transform 模式：对输入文本生成 TF-IDF 向量
        # 注意：实际生产中建议预先 fit 好，这里简化处理
        matrix = vectorizer.fit_transform(texts)
        return matrix.toarray()
    except Exception as e:
        logger.warning(f"TF-IDF fallback failed: {e}")
        return None


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """计算两个向量的余弦相似度。"""
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))
