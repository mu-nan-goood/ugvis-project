"""backend/routers/feedback.py - 建议质量反馈（含 RAG 自动索引）"""
import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db
from models import AdviceFeedback
from schemas import AdviceFeedbackCreate, AdviceFeedbackResponse, AdviceFeedbackStats
from services.auth import get_current_user
from schemas import UserResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/feedback", tags=["Feedback"])


def _index_advice_async(
    advice_context: str,
    advice_text: str,
    area_ids: Optional[str],
    season: Optional[str],
    embedding_api_key: str,
    embedding_api_base: Optional[str],
):
    """
    后台任务：将高好评建议索引到 ChromaDB。
    在独立线程中运行，避免阻塞请求。
    """
    try:
        import chromadb
        from services.knowledge_base import index_advice

        # 直接调用 async index_advice（在新事件循环中运行）
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(
                index_advice(
                    advice_context=advice_context,
                    advice_text=advice_text,
                    vote="up",
                    area_ids=area_ids,
                    season=season,
                    embedding_api_key=embedding_api_key,
                    embedding_base_url=embedding_api_base,
                )
            )
        finally:
            loop.close()
    except ImportError:
        logger.warning("chromadb not installed, skipping RAG index")
    except Exception as e:
        logger.warning(f"RAG indexing background task failed: {e}")


@router.post("", response_model=AdviceFeedbackResponse)
def submit_feedback(
    feedback: AdviceFeedbackCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    提交用户对 AI 改造建议的反馈。
    - vote: 'up' (👍 有用) 或 'down' (👎 无用)
    - comment: 可选的文字说明

    当 vote='up' 且 advice_context 非空时，自动将建议索引到 ChromaDB（RAG 知识库）。
    """
    if feedback.vote not in ("up", "down"):
        raise ValueError("vote must be 'up' or 'down'")

    db_feedback = AdviceFeedback(
        vote=feedback.vote,
        comment=feedback.comment,
        advice_context=feedback.advice_context,
        area_ids=feedback.area_ids,
        season=feedback.season,
    )
    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)

    logger.info(
        f"[Feedback] vote={feedback.vote}, "
        f"has_comment={'yes' if feedback.comment else 'no'}, "
        f"id={db_feedback.id}"
    )

    # ── RAG 自动索引：好评建议入库 ────────────────────────────────
    if feedback.vote == "up" and feedback.advice_context:
        try:
            from config import settings

            # 优先使用 DeepSeek API Key（已配置），也支持 OpenAI Key
            emb_key = settings.deepseek_api_key or settings.openai_api_key
            emb_base = settings.embedding_api_base
            if emb_key:
                # 在后台线程中运行索引（不阻塞响应）
                import threading

                t = threading.Thread(
                    target=_index_advice_async,
                    args=(
                        feedback.advice_context,
                        "",  # advice_text 暂无，从 context 即可
                        feedback.area_ids,
                        feedback.season,
                        emb_key,
                        emb_base,
                    ),
                    daemon=True,
                )
                t.start()
                logger.info(f"[RAG] Triggered background indexing for feedback id={db_feedback.id}")
            else:
                logger.debug("[RAG] No embedding API key configured, skipping index")
        except Exception as e:
            logger.warning(f"[RAG] Failed to trigger background indexing: {e}")

    return db_feedback


@router.get("", response_model=List[AdviceFeedbackResponse])
def list_feedback(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    vote: Optional[str] = Query(None, description="过滤: 'up' 或 'down'"),
    db: Session = Depends(get_db),
):
    """查询反馈记录列表（最新优先）。"""
    query = db.query(AdviceFeedback)
    if vote in ("up", "down"):
        query = query.filter(AdviceFeedback.vote == vote)
    return (
        query
        .order_by(desc(AdviceFeedback.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/stats", response_model=AdviceFeedbackStats)
def feedback_stats(db: Session = Depends(get_db)):
    """获取反馈统计：总数、好评数、差评数、好评率。"""
    total = db.query(AdviceFeedback).count()
    up_count = db.query(AdviceFeedback).filter(AdviceFeedback.vote == "up").count()
    down_count = db.query(AdviceFeedback).filter(AdviceFeedback.vote == "down").count()
    up_rate = round(up_count / total, 4) if total > 0 else 0.0
    return AdviceFeedbackStats(
        total=total,
        up_count=up_count,
        down_count=down_count,
        up_rate=up_rate,
    )


@router.get("/knowledge-base/stats")
def knowledge_base_stats():
    """查看 RAG 知识库状态（ChromaDB）。"""
    try:
        from services.knowledge_base import get_knowledge_base_stats

        return get_knowledge_base_stats()
    except Exception as e:
        return {"status": "error", "error": str(e), "total_records": 0}


@router.post("/knowledge-base/reset")
def reset_knowledge_base():
    """重置 RAG 知识库（删除所有历史建议索引）。"""
    try:
        from services.knowledge_base import reset_knowledge_base

        ok = reset_knowledge_base()
        return {"ok": ok, "message": "Knowledge base reset successfully" if ok else "Reset failed"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.delete("/{feedback_id}")
def delete_feedback(
    feedback_id: int,
    db: Session = Depends(get_db),
):
    """删除单条反馈记录。"""
    row = db.query(AdviceFeedback).filter(AdviceFeedback.id == feedback_id).first()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Feedback not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
