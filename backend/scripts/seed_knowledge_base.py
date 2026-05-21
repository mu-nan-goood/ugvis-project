"""
scripts/seed_knowledge_base.py — 向 ChromaDB 注入 RAG 种子数据

生成 30 条典型城市绿视率规划建议，覆盖不同区域/季节/道路类型，
让 RAG 检索功能有基础数据支撑。

用法: python scripts/seed_knowledge_base.py
"""
import asyncio
import hashlib
import os
import sys
from pathlib import Path

# 确保可以 import 项目模块
_project_root = str(Path(__file__).parent.parent)
sys.path.insert(0, _project_root)
os.chdir(_project_root)  # 确保 .env 可被 Pydantic Settings 读取

from services.knowledge_base import (
    get_chroma_client,
    get_or_create_collection,
    COLLECTION_ADVICE,
)
from services.embedding import get_embedding
from config import settings

# ── 种子建议数据 ──────────────────────────────────────────────────────────────

SEED_ADVICE = [
    {
        "context": "快速路沿线GVI低于5%，绿化覆盖严重不足，建议增设隔离带绿篱和攀爬植物",
        "text": "针对快速路(rc1)沿线GVI极低(<5%)的区域，建议：(1)在中央隔离带增设1.5m高绿篱，选用海桐、红叶石楠等常绿灌木；(2)护栏外缘安装攀爬式绿化模块，种植爬山虎、常春藤；(3)互通立交桥柱采用垂直绿化，预计可提升GVI 8-12个百分点。参考案例：上海中环路垂直绿化改造项目。",
        "season": "winter",
        "area_ids": "rc1-low",
    },
    {
        "context": "主干道春季GVI普遍偏低，建议利用行道树更新计划补植常绿树种",
        "text": "主干道(rc2)春季GVI均值仅6.3%，落叶树种比例过高是主因。建议：(1)行道树更新时将常绿树种比例提升至40%以上（香樟、广玉兰、桂花）；(2)人行道绿化带补植春季开花灌木（紫荆、迎春），兼固景观与GVI；(3)公交站台周边增设花箱。预计春季GVI可提升5-8个百分点。",
        "season": "spring",
        "area_ids": "rc2-spring",
    },
    {
        "context": "次干道夏季GVI良好但冬季骤降，建议增加常绿灌木地被层",
        "text": "次干道(rc3)夏季GVI达15%但冬季降至4%，季节波动CV>50%。核心策略：增加常绿地被层稳定性。(1)行道树下补植麦冬、沿阶草等常绿地被，覆盖裸土；(2)建筑前区绿化带选用龟甲冬青、金叶女贞等常绿灌木；(3)冬季落叶后树冠层GVI损失由地被层补偿。目标：冬季GVI不低于8%。",
        "season": "winter",
        "area_ids": "rc3-unstable",
    },
    {
        "context": "支路GVI空间变异大，部分区域存在绿化盲区，建议口袋公园补缺",
        "text": "支路(rc4)GVI标准差达6.8，变异系数45%，空间分布极不均匀。建议：(1)识别GVI<3%的连续盲区段（通常为老旧小区沿街面）；(2)利用拆违空地、边角地块建设口袋公园（≥400m²）；(3)墙面绿化+花箱组合补缺宽度不足2m的路段。参考：南京老城微更新口袋公园计划。",
        "season": "spring",
        "area_ids": "rc4-blind",
    },
    {
        "context": "商业街区GVI普遍偏低，建议立体绿化和屋顶花园提升垂直绿视率",
        "text": "商业街区建筑密度高、硬质铺装多，平面绿化空间不足。建议转向立体绿化：(1)沿街商铺门头安装模块化花箱（宽0.4m×高0.6m）；(2)大型商业体屋顶建设空中花园，对行人可见的2-3层高度优先；(3)停车场采用植草砖+树阵。立体绿化对GVI的贡献主要在垂直视角，可补充平面绿化的不足。",
        "season": "summer",
        "area_ids": "commercial",
    },
    {
        "context": "滨水区域GVI季节性波动大，建议增加常绿乔木稳定冬季绿视率",
        "text": "滨水区域夏季GVI达18%但冬季仅5%，波动率CV=72%。原因：柳树、水杉等落叶乔木占比过高。建议：(1)逐步替换为池杉、水杉混植（池杉半常绿）；(2)驳岸绿化带增加常绿灌木层（云南黄馨、八角金盘）；(3)亲水平台花境改用常绿+冬季开花组合（茶梅、腊梅）。目标CV降至40%以下。",
        "season": "winter",
        "area_ids": "waterfront",
    },
    {
        "context": "学校周边GVI提升建议，兼顾学生视野健康和校园安全",
        "text": "学校周边300m范围内GVI均值7.2%，低于城市均值。建议：(1)校门前缓冲带增设绿化岛，兼做交通安全隔离；(2)围墙外2m宽绿化带，选用无刺无毒品种（海桐、瓜子黄杨）；(3)放学等候区增加遮荫乔木（重阳木、榉树）。注意事项：避免种植带刺、有毒、花粉过敏源植物。",
        "season": "spring",
        "area_ids": "school-zone",
    },
    {
        "context": "老旧住区GVI极低且改造空间有限，建议墙面绿化和阳台绿化策略",
        "text": "老旧住区GVI均值3.5%，道路宽度仅4-6m，无行道树种植空间。建议：(1)沿街墙面安装网架式爬藤绿化（凌霄、常春藤），成本约80元/m²；(2)鼓励阳台绿化，社区提供花箱+植物；(3)电杆、灯杆缠绕式绿化；(4)小区出入口节点绿化提升。墙面绿化6个月后覆盖率可达60%，GVI可提升4-6个百分点。",
        "season": "autumn",
        "area_ids": "old-residential",
    },
    {
        "context": "交通枢纽周边绿化碎片化，建议绿道连接实现网络化提升",
        "text": "地铁站、公交枢纽周边GVI碎片化严重，相邻绿化斑块间距>200m。建议：(1)以枢纽为节点建设放射状绿道（≥2m宽连续绿化带）；(2)利用退让红线空间建设带状绿地；(3)过街设施结合绿化（人行天桥挂花槽、地下通道出入口绿化）。目标是实现500m半径内绿道连通率>80%。",
        "season": "summer",
        "area_ids": "transport-hub",
    },
    {
        "context": "工业区GVI极低，建议防污树种选择和隔离绿带建设",
        "text": "工业区GVI均值2.1%，全市最低。建议：(1)厂区外围建设20m宽隔离绿带，选用抗污树种（女贞、构树、夹竹桃）；(2)厂内道路行道树选耐污染品种（国槐、白蜡）；(3)围墙内侧种植高大乔木形成绿色屏障；(4)裸露地块临时覆绿（播撒草花组合）。工业区GVI目标不低于5%。",
        "season": "spring",
        "area_ids": "industrial",
    },
    {
        "context": "城市新城区GVI规划建议，从规划阶段纳入绿视率指标",
        "text": "新城区建设应从规划阶段纳入GVI控制指标：(1)控制性详细规划增设GVI下限指标（主干道≥15%、次干道≥10%、支路≥8%）；(2)建筑退让红线≥5m时强制设置绿化带；(3)地下空间出入口、通风井等构筑物结合绿化设计；(4)绿地率与GVI双指标管控。前瞻性规划成本远低于后期改造。",
        "season": "summer",
        "area_ids": "new-district",
    },
    {
        "context": "历史街区绿化受限，建议采用可移动花箱和垂直绿化",
        "text": "历史街区建筑保护要求严格，地面绿化空间受限。建议：(1)可移动花箱方案：标准花箱1.2m×0.4m×0.6m，种植月季、绣球等花期长品种；(2)院墙内侧垂直绿化（木质花格+攀爬月季）；(3)天井、内院绿化提升；（4）传统花窗配合盆景展示。花箱方案灵活，不破坏历史风貌，每季度可调整布局。",
        "season": "autumn",
        "area_ids": "historic",
    },
    {
        "context": "秋季GVI下降主要原因分析及针对性建议",
        "text": "秋季GVI下降主要因落叶树种比例过高。针对性措施：(1)行道树更新：逐步替换银杏、法桐等纯落叶树种为常绿+落叶混植（香樟+银杏4:6）；(2)灌木层补植秋季观叶/观果品种（南天竹、火棘、红叶石楠）；(3)花境设计纳入秋季花卉（桂花、菊花、木芙蓉）；(4)草坪区域补播黑麦草保持绿色。目标：秋季GVI降幅<3个百分点。",
        "season": "autumn",
        "area_ids": "citywide-autumn",
    },
    {
        "context": "GVI与居民心理健康关联分析，建议提升居住区周边绿视率",
        "text": "研究表明，居住区周边GVI≥10%的居民心理健康评分显著高于GVI<5%区域。建议：(1)居住区出入口100m范围GVI提升至≥12%；(2)社区活动中心周边增植遮荫乔木；(3)步道两侧绿化带宽度≥1.5m；(4)老年人活动区优先选用芳香植物（桂花、栀子花），兼具感官疗愈功能。GVI每提升5%，居民压力感知降低约8%。",
        "season": "spring",
        "area_ids": "residential-health",
    },
    {
        "context": "高GVI区域保护建议，避免城市更新导致绿视率退化",
        "text": "GVI>20%的区域（多为成熟林荫道、公园周边）是城市绿色资产，需主动保护：(1)城市更新项目环评纳入GVI影响评估；(2)老树保护：胸径>30cm的行道树原则上不移栽；(3)道路拓宽时保留一侧完整绿化带；(4)替代方案：绿化面积不减，GVI指标纳入出让条件。预防性保护成本为后期恢复的1/5。",
        "season": "summer",
        "area_ids": "high-gvi-protection",
    },
    {
        "context": "立体交通设施绿化策略，高架桥和隧道的GVI提升方案",
        "text": "高架桥、隧道等立体交通设施的GVI提升方案：(1)高架桥墩垂直绿化，种植爬山虎、凌霄，3年覆盖率>80%；(2)桥面两侧挂花槽（自动滴灌系统），种植藤本月季、三角梅；(3)隧道口绿化：洞口两侧种植高大常绿乔木形成视觉过渡；(4)声屏障顶面绿化槽。立体绿化对GVI的贡献在仰视角尤其显著。",
        "season": "spring",
        "area_ids": "elevated-road",
    },
    {
        "context": "停车场景观绿化建议，植草砖和树阵组合提升GVI",
        "text": "地面停车场是城市GVI低值区。建议：(1)停车位采用植草砖铺装（绿化率≥40%）；(2)每4个车位设置1株乔木（胸径≥10cm，分枝点≥2.5m）；(3)停车场边缘设1.5m宽绿篱带（海桐+红叶石楠交替）；(4)大型停车场内部增设绿化岛（≥8m²/个）。改造后GVI可从0%提升至8-12%。",
        "season": "summer",
        "area_ids": "parking-lot",
    },
    {
        "context": "GVI与热岛效应协同治理，绿化配置兼顾降温与绿视",
        "text": "GVI与城市热岛效应高度相关（r=0.72）。协同治理策略：(1)行道树选冠大荫浓品种（法桐、重阳木），同时提升GVI和遮荫率；(2)灌木层选用蒸腾作用强的品种（珊瑚树、八角金盘），增强降温效果；(3)屋顶绿化选耐旱景天科植物，夏季屋顶表面温度降低15-25°C；(4)水体周边增加绿化宽度，水绿协同降温。",
        "season": "summer",
        "area_ids": "heat-island",
    },
    {
        "context": "低维护绿化方案，适合财政预算有限的区域",
        "text": "低维护绿化方案适合老旧小区、城中村等预算有限区域：(1)植物选择：以乡土树种为主（香樟、桂花、女贞），适应性强、病虫害少；(2)地被选择：麦冬、沿阶草替代草坪，免修剪；(3)灌溉：采用雨水收集+滴灌系统，减少人工浇水；(4)硬景：透水砖+嵌草砖组合。估算：初期投入120元/m²，年维护15元/m²，为精致绿化的40%。",
        "season": "spring",
        "area_ids": "low-budget",
    },
    {
        "context": "冬季GVI最低区域应急绿化策略，容器苗和仿真绿化的过渡方案",
        "text": "冬季GVI<3%的急需改善区域，长期方案见效前可采用过渡措施：(1)容器苗方案：大型容器种植常绿乔木（香樟、广玉兰），冬季进场、春季生根，当年见效；(2)仿真绿化：围挡+仿真绿植墙（仿真度>95%），成本60元/m²，有效期2年；(3)冬季花卉：羽衣甘蓝、角堇等耐寒花卉花箱。过渡方案3个月内可见效果。",
        "season": "winter",
        "area_ids": "emergency-winter",
    },
    {
        "context": "步行优先街区GVI提升，绿道和慢行系统结合",
        "text": "步行优先街区应将GVI提升纳入慢行系统设计：(1)步行道一侧≥2m宽绿化带，种植乔+灌+草三层结构；(2)自行车道与步行道间设1m宽绿篱分隔带；(3)过街安全岛增设绿化（乔木+花境）；(4)街角口袋绿地（≥100m²），配置座椅+遮荫树。步行街GVI目标≥15%，慢行廊道≥12%。",
        "season": "autumn",
        "area_ids": "pedestrian-zone",
    },
    {
        "context": "窄路密网区域GVI提升策略，小尺度绿化累积效应",
        "text": "窄路密网区域（道路宽度<8m）单条路绿化空间有限，但路网密度高可形成累积效应：(1)统一规划沿街花箱（0.6m宽×1.2m长），间隔5m/个；(2)转角节点绿化强化（花境+小型乔木）；(3)围墙绿化成片连接（连续攀爬绿墙>20m）；(4)巷道口设置绿化标识节点。单条路GVI提升3-5%，网络化后体感GVI提升可达10%。",
        "season": "spring",
        "area_ids": "narrow-road",
    },
    {
        "context": "GVI监测和评估指标体系建议，建立动态反馈机制",
        "text": "建议建立GVI动态监测体系：(1)季度监测：利用街景影像自动计算GVI变化率；(2)年度评估：GVI变化纳入城市绿化考核指标；(3)预警机制：GVI下降>2个百分点触发预警，启动原因分析和修复计划；(4)公众参与：开放GVI查询平台，接受市民绿化建议。数据驱动决策，避免绿化资源错配。",
        "season": "summer",
        "area_ids": "monitoring",
    },
    {
        "context": "街道家具与绿化一体化设计，多功能灯杆和公交站",
        "text": "街道家具一体化设计可同时解决功能与绿化需求：(1)多功能灯杆：顶部照明+中部花篮+底部座椅，花篮种植垂吊型植物（矮牵牛、常春藤）；(2)公交站台：顶棚集成绿化槽，立柱缠绕式绿化；(3)垃圾箱：顶部花盆+侧壁爬藤；(4)配电箱围栏绿化：利用市政设施占地实现绿化增量。单件家具GVI贡献约0.3-0.5个百分点。",
        "season": "spring",
        "area_ids": "street-furniture",
    },
    {
        "context": "河道沿线绿道GVI提升，水绿交融的生态廊道建设",
        "text": "河道沿线是城市重要的GVI廊道资源：(1)河道两侧≥10m宽绿带，乔灌草三层结构；(2)亲水步道绿廊：拱形藤架（紫藤、凌霄）形成绿色隧道效果；(3)河岸护坡绿化：生态护坡+水生植物（芦苇、菖蒲）；(4)桥梁绿化：桥面花槽+桥墩垂直绿化。河道绿廊GVI目标≥25%，形成城市级绿色骨架。",
        "season": "summer",
        "area_ids": "river-corridor",
    },
    {
        "context": "GVI提升的植物配置原则，常绿与落叶比例建议",
        "text": "GVI导向的植物配置核心原则：(1)常绿:落叶=6:4（确保冬季GVI不低于8%）；(2)乔木:灌木:地被面积比=3:4:3（三层全覆盖）；(3)行道树间距6-8m，树冠连线形成绿色天幕；(4)灌木层高度0.8-1.2m，兼顾行人视野和绿化体量；(5)地被层全年覆盖，裸土率<5%。推荐组合：上层香樟+中层红叶石楠+下层麦冬。",
        "season": "winter",
        "area_ids": "plant-design",
    },
    {
        "context": "社区参与式绿化模式，居民自治花园和认养制度",
        "text": "社区参与式绿化可提高维护质量和居民满意度：(1)社区花园：划拨≥200m²公共绿地，居民自主设计种植；(2)树木认养：每棵树年费50-100元，认养者获挂牌权+养护参与权；(3)绿植交换站：每月1次社区植物交换活动；(4)绿化志愿者积分制：参与养护获积分兑换社区服务。参与式绿化维护成本降低30%，成活率提高20%。",
        "season": "spring",
        "area_ids": "community-participation",
    },
    {
        "context": "高密度商业区GVI提升的创新方案，移动绿化和临时绿化",
        "text": "高密度商业区固定绿化空间不足，建议采用移动绿化策略：(1)移动花车：1.2m×0.8m可移动花箱，白天摆放夜间收回，种植时令花卉；(2)临时花展：商业广场季度花展，每次7-15天；(3)橱窗绿化：鼓励商铺橱窗内绿化展示，纳入街区美化评比；(4)屋顶农场：商业体屋顶建设社区农场，兼顾绿化和社交。灵活绿化策略GVI贡献2-5个百分点。",
        "season": "autumn",
        "area_ids": "commercial-mobile",
    },
    {
        "context": "绿视率与生物多样性协同提升，乡土植物和蜜源植物配置",
        "text": "GVI提升应兼顾生物多样性：(1)植物配置中乡土树种占比≥60%（适应性强、维护低）；(2)蜜源植物带：每隔500m设置蜜源植物区（紫荆、桂花、女贞），支持城市传粉昆虫；(3)鸟类栖息：行道树选浆果类（女贞、火棘），冬季为鸟类提供食物；(4)生态廊道：GVI≥15%的连续绿带可作为小型野生动物通道。生物多样性提升可增强绿化系统的自我维持能力。",
        "season": "summer",
        "area_ids": "biodiversity",
    },
    {
        "context": "道路拓宽改造中的GVI保护策略，先建后迁和等量补偿",
        "text": "道路拓宽是GVI下降的主要人为因素。保护策略：(1)先建后迁：新绿化带先行建设并达到80%覆盖率后再移除旧绿化；(2)等量补偿：移除的绿化面积必须等量补偿，且GVI贡献不低于原值；(3)大树保护：胸径>20cm的乔木优先就地保护而非移栽（移栽成活率仅60%）；(4)临时绿化：施工期间围挡绿化覆盖率≥30%。道路拓宽后GVI恢复期应<2年。",
        "season": "autumn",
        "area_ids": "road-widening",
    },
]


async def seed():
    """向 ChromaDB 注入种子数据。"""
    client = get_chroma_client()
    if client is None:
        print("ERROR: ChromaDB client not available")
        return False

    collection = get_or_create_collection(client, COLLECTION_ADVICE)
    if collection is None:
        print("ERROR: Failed to get/create collection")
        return False

    existing = collection.count()
    print(f"Current ChromaDB records: {existing}")

    # Embedding API config from settings
    api_key = settings.deepseek_api_key or settings.openai_api_key or "lm-studio"
    base_url = settings.embedding_api_base
    model = settings.embedding_model

    print(f"Embedding: base_url={base_url}, model={model}")

    success = 0
    failed = 0

    for i, advice in enumerate(SEED_ADVICE):
        context = advice["context"]
        text = advice["text"]
        season = advice["season"]
        area_ids = advice["area_ids"]

        # Generate embedding (with retry, LM Studio may 502 on concurrent requests)
        embedding = None
        for attempt in range(3):
            try:
                embedding = await get_embedding(context, api_key, model, base_url)
                if embedding is not None:
                    break
            except Exception as e:
                print(f"  [{i+1}/{len(SEED_ADVICE)}] Attempt {attempt+1} failed: {e}")
            await asyncio.sleep(1)  # Wait before retry

        if embedding is None:
            print(f"  [{i+1}/{len(SEED_ADVICE)}] X No embedding after 3 attempts, skipping")
            failed += 1
            await asyncio.sleep(0.5)  # Rate limit between items
            continue

        # Generate deterministic ID based on content
        record_id = hashlib.sha256(f"seed-{area_ids}-{season}-{i}".encode()).hexdigest()[:16]

        metadata = {
            "vote": "up",
            "advice_text": text[:500],
            "area_ids": area_ids,
            "season": season,
            "seed": "true",
        }

        try:
            # Check if already exists (idempotent)
            existing_ids = collection.get(ids=[record_id])
            if existing_ids and existing_ids["ids"]:
                print(f"  [{i+1}/{len(SEED_ADVICE)}] Already exists: {record_id}")
                success += 1
                continue

            collection.add(
                ids=[record_id],
                embeddings=[embedding],
                documents=[context],
                metadatas=[metadata],
            )
            success += 1
            print(f"  [{i+1}/{len(SEED_ADVICE)}] OK Indexed: {context[:50]}...")
            await asyncio.sleep(0.5)  # Rate limit between items
        except Exception as e:
            print(f"  [{i+1}/{len(SEED_ADVICE)}] FAIL: {e}")
            failed += 1

    total = collection.count()
    print(f"\nDone: {success} indexed, {failed} failed. Total records now: {total}")
    return failed == 0


if __name__ == "__main__":
    ok = asyncio.run(seed())
    sys.exit(0 if ok else 1)
