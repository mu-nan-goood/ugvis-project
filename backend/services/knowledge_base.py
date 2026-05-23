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
    import uuid

    record_id = uuid.uuid4().hex[:16]

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


# ── R3-tech: Seed Knowledge Base ─────────────────────────────────────────────

# Curated seed advice records for RAG retrieval.
# These cover common urban greening scenarios relevant to Nanjing.
SEED_ADVICE_RECORDS = [
    {
        "context": "南京老城区主干道GVI冬季低于5%，行道树以法国梧桐为主，落叶后绿化视野几乎为零。建议增植常绿灌木层和垂直绿化。",
        "text": "老城区主干道冬季绿化薄弱，推荐在现有梧桐行道树间增植桂花、石楠等常绿灌木，并在建筑立面推广爬山虎、常春藤垂直绿化，可提升冬季GVI 8-12个百分点。预算约15-20万元/公里。",
        "season": "winter",
        "area_ids": "old-town-main",
    },
    {
        "context": "新建住宅区道路GVI春夏季达35-45%，但秋冬降至15%以下。落叶树种比例过高，缺乏四季常绿配置。",
        "text": "住宅区道路绿化季节差异大，建议采用常绿落叶7:3混交配置。推荐香樟+广玉兰为骨干，搭配红叶石楠、金叶女贞色块。春秋GVI波动可控制在10%以内。",
        "season": "autumn",
        "area_ids": "residential-new",
    },
    {
        "context": "工业开发区道路GVI普遍低于8%，路面硬质铺装为主，绿化带窄且植物单一。高温热岛效应明显。",
        "text": "工业区绿化需注重降温和防护功能。建议建设10-15米宽防护林带（雪松+女贞+夹竹桃），道路绿化带扩至3米以上，采用耐污染树种（构树、女贞）。预计降低局部温度2-3℃。",
        "season": "summer",
        "area_ids": "industrial",
    },
    {
        "context": "滨河步道绿化视野较好但NDVI偏低，草坪为主缺乏乔木层。夏季遮荫不足，行人舒适度低。",
        "text": "滨河区域建议构建复层绿化：上层柳树+水杉（遮荫），中层紫薇+木槿（观赏），下层鸢尾+萱草+麦冬（地被）。亲水平台设藤蔓花架。可将GVI提升至40%以上，夏季遮荫面积增加60%。",
        "season": "summer",
        "area_ids": "riverside",
    },
    {
        "context": "商业中心区GVI均值仅6%，建筑密度高，可用绿化空间有限。需要立体绿化和微型绿地创新方案。",
        "text": "商业区建议采用立体绿化策略：屋顶花园（轻质基质+景天科植物）、墙面垂直绿化模块、公交站亭绿化、移动花箱。每处投入1-3万元，GVI可提升5-8个百分点。优先在高人流量区域实施。",
        "season": "spring",
        "area_ids": "commercial",
    },
    {
        "context": "校园周边道路GVI春季较高但冬季骤降，法梧落叶后仅剩灌木层。行人以学生为主，对环境品质敏感度高。",
        "text": "校园周边推荐四季景观设计：保留法梧秋叶景观价值，增植常绿中层（桂花、含笑、茶花），底层配置书带草+沿阶草。冬季用茶梅+腊梅营造节点景观。总投资约8-12万元/公里。",
        "season": "winter",
        "area_ids": "campus",
    },
    {
        "context": "城市快速路绿化带GVI随距离衰减明显，50米内15%，100米外降至5%以下。噪声和尾气污染严重。",
        "text": "快速路绿化建议建设30米宽生态隔离带：内层密植夹竹桃+珊瑚树（降噪5-8dB），中层雪松+龙柏（防尘），外层香樟+广玉兰（景观）。绿化带内设微地形，增加种植深度。预计100米内GVI提升至25%以上。",
        "season": "spring",
        "area_ids": "expressway",
    },
    {
        "context": "老旧小区内部道路GVI不足3%，无正规绿化带，居民自行种植杂乱。空间狭窄，车辆占道严重。",
        "text": "老旧小区绿化改造需与停车位协调。建议：透水铺装替代硬化地面，停车位间设1.2米绿化岛（桂花+红叶石楠），墙根设花槽（月季+迎春），拐角处设口袋花园（3-5㎡）。居民参与式设计提升接受度。预计GVI提升至10-15%。",
        "season": "summer",
        "area_ids": "old-residential",
    },
    {
        "context": "公园连接道绿化连续性差，存在多处绿化断点。部分路段行道树缺失，视觉体验割裂。",
        "text": "公园连接道需确保绿化连续性。断点处优先补植与两侧一致的行道树，间距6-8米。过渡段设花境（绣球+鸢尾+玉簪），形成视觉引导。全线铺设透水步道，两侧设0.5米花带。投资约20万元/公里。",
        "season": "autumn",
        "area_ids": "park-corridor",
    },
    {
        "context": "地铁站出入口周边GVI极低，硬质铺装为主，缺乏遮荫。人流密集但停留舒适度差。",
        "text": "地铁站口绿化建议：出入口5米范围设乔木遮荫阵（香樟或银杏），等候区设绿篱围合空间（红叶石楠+金森女贞），地面设移动花钵。结合市政设施做垂直绿化墙。投资3-5万元/站口，GVI可提升10-15个百分点。",
        "season": "summer",
        "area_ids": "metro-entrance",
    },
    {
        "context": "南京玄武区春季GVI均值28%但空间变异大，部分历史街区GVI低于10%。需平衡历史风貌与绿化提升。",
        "text": "历史街区绿化需尊重风貌：选用传统园林植物（梅花、桂花、竹子），采用院落绿化而非行道树方式。沿墙设花台，门头设花篮，天井设盆景。墙角植芭蕉、南天竹。保持粉墙黛瓦与绿植的江南意境。预算约10-15万元/街区。",
        "season": "spring",
        "area_ids": "historic-xuanwu",
    },
    {
        "context": "城市主干道交叉口GVI普遍偏低，渠化岛硬质化，信号等待区无遮荫。夏季高温安全隐患大。",
        "text": "交叉口渠化岛绿化：中心岛植造型灌木（红叶石楠球+金叶女贞球），导流岛植乔木遮荫（香樟+银杏），安全岛设藤蔓花架。采用滴灌系统节水。每个交叉口改造约5-8万元，可增加遮荫面积40㎡以上。",
        "season": "summer",
        "area_ids": "intersection",
    },
    {
        "context": "新城开发区道路宽阔但绿化带种植密度低，GVI仅12-15%。绿化带以草坪为主，乔木间距过大。",
        "text": "新城道路绿化提密方案：现有乔木间补植（间距从10米缩至6米），灌木层从单一红叶石楠增配金叶女贞+春鹃形成色带，地被从草坪改为麦冬+沿阶草减少维护。3年后GVI可达30%以上。预算约8万元/公里。",
        "season": "spring",
        "area_ids": "new-town",
    },
    {
        "context": "城中村道路GVI极低（<3%），建筑密集，违建占道，几乎无绿化空间。卫生环境差。",
        "text": "城中村绿化需分步实施：短期设移动花箱+墙面绿化（爬山虎容器苗）；中期拆违建绿，建口袋公园（50-100㎡）；长期结合改造规划预留绿化带。优先选用耐粗放管理品种（夹竹桃、构树、沿阶草）。社区共建模式降低维护成本。",
        "season": "autumn",
        "area_ids": "urban-village",
    },
    {
        "context": "南京鼓楼区冬季GVI下降最为显著，从秋季25%降至8%。法梧为主的行道树全面落叶，街面灰暗。",
        "text": "鼓楼区冬季绿化提升策略：1）主干道补植常绿行道树（香樟替代部分法梧，比例1:3）；2）重要节点设常绿花境（茶梅+腊梅+南天竹+构骨）；3）商业街设LED植物灯补充视觉绿意；4）广场铺设常绿草坪（高羊茅混播）。预计冬季GVI提升至15%以上。",
        "season": "winter",
        "area_ids": "gulou-winter",
    },
    {
        "context": "河道两侧绿道NDVI值高但GVI低，说明植被覆盖好但视野可见度差。树冠过密遮挡视线，通透性不足。",
        "text": "绿道通透性优化：疏伐过密中层灌木，保留上层乔木和底层地被，形成框景效果。临水侧保持视线通廊（每50米设5米宽视口），远水侧密植隔音。疏伐材用于生态堆肥。施工后NDVI略降0.02但GVI可提升10-15个百分点。",
        "season": "spring",
        "area_ids": "greenway-ndvi",
    },
    {
        "context": "高铁站周边道路GVI不足5%，大型交通设施占地导致绿化率极低。旅客第一印象差。",
        "text": "高铁站周边绿化形象提升：站前广场设树阵（银杏+香樟各2排），落客区设花箱隔离带，匝道下设耐荫地被（玉簪+八角金盘），停车场设植草砖+乔木。绿化标识系统统一设计。投资约50-80万元，GVI提升至15-20%。",
        "season": "autumn",
        "area_ids": "hsr-station",
    },
    {
        "context": "学校操场周边GVI季节差异大，春秋季围墙外树木遮挡导致测量值偏高，实际绿化面积有限。",
        "text": "校园绿化应注重实际可达性：操场边界设3米宽绿化缓冲带（香樟+石楠+麦冬），教学楼间设休闲绿地（桂花+紫薇+草坪），校门两侧设花境。避免仅依赖围墙外行道树提升GVI统计值。预算约15-25万元/校。",
        "season": "spring",
        "area_ids": "school-perimeter",
    },
    {
        "context": "南京雨花台区产业园区GVI仅6%，道路绿化带宽度不足1米，植物品种单一。员工户外活动意愿低。",
        "text": "产业园区绿化升级：拓宽绿化带至2-3米，种植香樟+紫荆+红叶石楠组合。休憩区设林荫广场（胸径15cm+乔木+环形座椅）。建筑入口设容器绿化（造型罗汉松+时令花卉）。投资约25万元，可提升员工满意度15-20%。",
        "season": "summer",
        "area_ids": "industrial-park",
    },
    {
        "context": "城市绿道网络连通性差，断点率30%以上。独立绿道段GVI良好但无法形成连续通行体验。",
        "text": "绿道断点连通策略：道路交叉口设二次过街安全岛+遮荫乔木；河道断点设景观桥（宽4米+两侧花槽）；地块断点协商借道通行权（最小2米通道）。3年消除80%断点，形成环线。总投资约200-300万元/10公里。",
        "season": "autumn",
        "area_ids": "greenway-network",
    },
]


def seed_knowledge_base(
    embedding_api_key: Optional[str] = None,
    embedding_base_url: Optional[str] = None,
) -> int:
    """
    Populate the knowledge base with curated seed advice records.

    R3-tech fix: Expands ChromaDB from ~30 records to ~50+
    by adding domain-specific urban greening advice for Nanjing.

    Returns the number of records successfully indexed.
    """
    import asyncio as _asyncio

    client = get_chroma_client()
    if client is None:
        logger.error("ChromaDB not available for seeding")
        return 0

    collection = get_or_create_collection(client, COLLECTION_ADVICE)
    if collection is None:
        return 0

    existing = collection.count()
    logger.info(f"Knowledge base currently has {existing} records")

    # Skip seeding if already well-populated
    if existing >= len(SEED_ADVICE_RECORDS):
        logger.info("Knowledge base already sufficiently populated, skipping seed")
        return 0

    # Try to get a running event loop; if none, create one
    try:
        loop = _asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    indexed = 0
    for record in SEED_ADVICE_RECORDS:
        try:
            if loop and loop.is_running():
                # We're inside an async context — schedule and wait
                future = _asyncio.run_coroutine_threadsafe(
                    index_advice(
                        advice_context=record["context"],
                        advice_text=record["text"],
                        vote="up",
                        area_ids=record.get("area_ids"),
                        season=record.get("season"),
                        embedding_api_key=embedding_api_key,
                        embedding_base_url=embedding_base_url,
                    ),
                    loop,
                )
                index_result = future.result(timeout=30)
            else:
                # No running loop — create one
                index_result = _asyncio.run(
                    index_advice(
                        advice_context=record["context"],
                        advice_text=record["text"],
                        vote="up",
                        area_ids=record.get("area_ids"),
                        season=record.get("season"),
                        embedding_api_key=embedding_api_key,
                        embedding_base_url=embedding_base_url,
                    )
                )
            if index_result:
                indexed += 1
        except Exception as e:
            logger.warning(f"Failed to seed record: {e}")

    logger.info(f"Seeded {indexed}/{len(SEED_ADVICE_RECORDS)} records")
    return indexed
