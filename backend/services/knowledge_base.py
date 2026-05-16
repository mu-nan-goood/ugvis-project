"""
services/knowledge_base.py - ChromaDB Knowledge Base for RAG

职责：
- 管理 ChromaDB 客户端和集合
- 将高好评历史建议入库
- 检索最相关的历史建议
"""
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ChromaDB 持久化路径
CHROMA_DB_PATH = Path(__file__).parent.parent / "data" / "chroma_db"
CHROMA_DB_PATH.mkdir(parents=True, exist_ok=True)

COLLECTION_ADVICE = "advice_history"


def _get_embedding_model() -> str:
    """从配置读取 embedding 模型名。"""
    try:
        from config import settings
        return settings.embedding_model or "nomic-embed-text"
    except Exception:
        return "nomic-embed-text"


# ─── ChromaDB Client (懒初始化) ──────────────────────────────────────────────

_client: Optional[Any] = None


def get_chroma_client() -> Any:
    """获取或创建 ChromaDB 客户端（嵌入式模式）。"""
    global _client
    if _client is not None:
        return _client

    try:
        import chromadb
        from chromadb.config import Settings

        _client = chromadb.PersistentClient(
            path=str(CHROMA_DB_PATH),
            settings=Settings(
                anonymized_telemetry=False,  # 关闭遥测
                allow_reset=True,
            ),
        )
        logger.info(f"ChromaDB initialized at {CHROMA_DB_PATH}")
        return _client
    except ImportError:
        logger.error("chromadb not installed. Run: pip install chromadb")
        return None
    except Exception as e:
        logger.error(f"Failed to initialize ChromaDB: {e}")
        return None


def get_or_create_collection(client: Any, name: str) -> Any:
    """获取或创建命名集合。"""
    try:
        return client.get_or_create_collection(
            name=name,
            metadata={"description": "Urban green planning advice history for RAG"},
        )
    except Exception as e:
        logger.error(f"Failed to get/create collection '{name}': {e}")
        return None


# ─── Knowledge Base Operations ────────────────────────────────────────────────

def init_knowledge_base() -> bool:
    """初始化知识库集合。"""
    client = get_chroma_client()
    if client is None:
        return False
    collection = get_or_create_collection(client, COLLECTION_ADVICE)
    return collection is not None


async def index_advice(
    advice_context: str,
    advice_text: str,
    vote: str,
    area_ids: Optional[str] = None,
    season: Optional[str] = None,
    embedding_api_key: Optional[str] = None,
    embedding_base_url: Optional[str] = None,
) -> bool:
    """
    将一条高好评建议索引到 ChromaDB。

    Args:
        advice_context: 建议的上下文/摘要（用于检索）
        advice_text: 完整建议文本
        vote: 投票结果 ('up' | 'down')
        area_ids: 关联的区域 ID 列表
        season: 季节
        embedding_api_key: OpenAI API key（用于生成向量）

    Returns:
        True if indexed successfully, False otherwise.
    """
    if vote != "up":
        logger.debug(f"Skipping index for vote={vote}")
        return False

    if not advice_context:
        logger.warning("advice_context is empty, skipping index")
        return False

    client = get_chroma_client()
    if client is None:
        return False

    collection = get_or_create_collection(client, COLLECTION_ADVICE)
    if collection is None:
        return False

    # 生成 embedding
    embedding: Optional[List[float]] = None
    if embedding_api_key:
        try:
            from services.embedding import get_embedding

            embedding = await get_embedding(
                advice_context,
                embedding_api_key,
                _get_embedding_model(),
                embedding_base_url,
            )
        except Exception as e:
            logger.warning(f"Embedding generation failed: {e}")

    # 如果 embedding 失败，跳过索引（避免低质量检索）
    if embedding is None:
        logger.warning("No embedding available, skipping ChromaDB index")
        return False

    # 生成唯一 ID
    import hashlib, time

    record_id = hashlib.sha256(
        f"{advice_context[:100]}{time.time()}".encode()
    ).hexdigest()[:16]

    metadata = {
        "vote": vote,
        "advice_text": advice_text[:500] if advice_text else "",  # ChromaDB metadata 有大小限制
        "area_ids": area_ids or "",
        "season": season or "",
    }

    try:
        collection.add(
            ids=[record_id],
            embeddings=[embedding],
            documents=[advice_context],
            metadatas=[metadata],
        )
        logger.info(f"Indexed advice record {record_id} (vote={vote})")
        return True
    except Exception as e:
        logger.error(f"Failed to add to ChromaDB: {e}")
        return False


async def retrieve_relevant_advice(
    query: str,
    top_k: int = 3,
    embedding_api_key: Optional[str] = None,
    embedding_base_url: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    检索与 query 最相关的高好评历史建议。

    Args:
        query: 检索查询（通常为当前区域/偏好上下文）
        top_k: 返回数量上限
        embedding_api_key: OpenAI API key

    Returns:
        List of dicts with keys: advice_context, advice_text, vote, area_ids, season, distance
    """
    if not query:
        return []

    client = get_chroma_client()
    if client is None:
        return []

    collection = get_or_create_collection(client, COLLECTION_ADVICE)
    if collection is None:
        return []

    # 生成 query embedding
    query_embedding: Optional[List[float]] = None
    if embedding_api_key:
        try:
            from services.embedding import get_embedding

            query_embedding = await get_embedding(
                query,
                embedding_api_key,
                _get_embedding_model(),
                embedding_base_url,
            )
        except Exception as e:
            logger.warning(f"Query embedding failed: {e}")

    if query_embedding is None:
        # Fallback: 无法 embedding 时返回空
        logger.warning("No query embedding, skipping retrieval")
        return []

    try:
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, 10),
            include=["documents", "metadatas", "distances"],
        )

        records: List[Dict[str, Any]] = []
        doc_ids = (results.get("ids") or [[]])[0]
        docs = (results.get("documents") or [[]])[0]
        metas = (results.get("metadatas") or [[]])[0]
        dists = (results.get("distances") or [[]])[0]

        for i, doc_id in enumerate(doc_ids):
            records.append({
                "id": doc_id,
                "advice_context": docs[i] if i < len(docs) else "",
                "advice_text": metas[i].get("advice_text", "") if i < len(metas) else "",
                "vote": metas[i].get("vote", "") if i < len(metas) else "",
                "area_ids": metas[i].get("area_ids", "") if i < len(metas) else "",
                "season": metas[i].get("season", "") if i < len(metas) else "",
                "distance": dists[i] if i < len(dists) else 1.0,
            })

        logger.debug(f"Retrieved {len(records)} relevant advice records")
        return records

    except Exception as e:
        logger.error(f"ChromaDB query failed: {e}")
        return []


def get_knowledge_base_stats() -> Dict[str, Any]:
    """返回知识库统计信息。"""
    client = get_chroma_client()
    if client is None:
        return {"status": "unavailable", "total_records": 0}

    try:
        collection = client.get_or_create_collection(
            name=COLLECTION_ADVICE,
            metadata={"description": "Urban green planning advice history for RAG"},
        )
        count = collection.count()
        return {
            "status": "ready",
            "total_records": count,
            "collection": COLLECTION_ADVICE,
            "embedding_model": _get_embedding_model(),
        }
    except Exception as e:
        logger.warning(f"Failed to get KB stats: {e}")
        return {"status": "error", "error": str(e), "total_records": 0}


def reset_knowledge_base() -> bool:
    """重置知识库（删除所有记录）。"""
    client = get_chroma_client()
    if client is None:
        return False
    try:
        client.delete_collection(COLLECTION_ADVICE)
        client.get_or_create_collection(
            name=COLLECTION_ADVICE,
            metadata={"description": "Urban green planning advice history for RAG"},
        )
        logger.warning("Knowledge base reset")
        return True
    except Exception as e:
        logger.error(f"Failed to reset knowledge base: {e}")
        return False
