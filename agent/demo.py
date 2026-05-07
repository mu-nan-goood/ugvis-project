"""Agent 演示脚本 - 无需 LLM API Key 即可测试工具链"""
import asyncio
import json
from tools import ugvis_client


async def demo_stats():
    """演示：获取全局统计"""
    print("=" * 60)
    print("【演示 1】全局统计信息")
    print("=" * 60)
    
    data = await ugvis_client.get_stats()
    
    if "error" in data:
        print(f"错误: {data['message']}")
        return
    
    print(f"总采样点数: {data.get('total_points', 'N/A')}")
    print(f"总道路段数: {data.get('total_roads', 'N/A')}")
    print(f"道路类型分布: {json.dumps(data.get('road_types', {}), ensure_ascii=False)}")
    
    print("\n四季平均 GVI/NDVI:")
    for season in data.get('seasonal', []):
        print(f"  {season['season']}: GVI={season['avg_gvi']}, NDVI={season['avg_ndvi']}, 样本={season['sample_count']}")


async def demo_planning():
    """演示：获取规划决策数据"""
    print("\n" + "=" * 60)
    print("【演示 2】规划决策 - 绿化薄弱区")
    print("=" * 60)
    
    data = await ugvis_client.get_planning()
    
    if "error" in data:
        print(f"错误: {data['message']}")
        return
    
    stats = data.get('stats', {})
    print(f"高优先级薄弱区: {stats.get('high_priority', 'N/A')} 个")
    print(f"中优先级薄弱区: {stats.get('medium_priority', 'N/A')} 个")
    print(f"低优先级薄弱区: {stats.get('low_priority', 'N/A')} 个")
    print(f"预估需植树: {stats.get('estimated_trees', 'N/A')} 棵")
    print(f"预估 GVI 提升: {stats.get('estimated_gvi_improvement', 'N/A')}%")
    
    print("\n前 3 个薄弱区示例:")
    for area in data.get('weak_areas', [])[:3]:
        print(f"  点 #{area['point_id']} ({area['lat']}, {area['lng']})")
        print(f"    冬季 GVI: {area['gvi_winter']}% | 优先级: {area['priority']}")
        print(f"    建议: {area['suggestion']}")
        print()


async def demo_seasonal():
    """演示：季节变异分析"""
    print("=" * 60)
    print("【演示 3】季节变异分析")
    print("=" * 60)
    
    data = await ugvis_client.get_seasonal_analysis()
    
    if "error" in data:
        print(f"错误: {data['message']}")
        return
    
    print("四季箱线图统计:")
    for bp in data.get('boxplot', []):
        print(f"  {bp['season']}: min={bp['min_val']}, q1={bp['q1']}, "
              f"median={bp['median']}, q3={bp['q3']}, max={bp['max_val']}")
    
    print("\n稳定性分区:")
    stability = data.get('stability', {})
    print(f"  稳定 (CV<25%): {stability.get('stable', 'N/A')} ({stability.get('stable_pct', 'N/A')}%)")
    print(f"  中等 (25%≤CV<50%): {stability.get('moderate', 'N/A')} ({stability.get('moderate_pct', 'N/A')}%)")
    print(f"  不稳定 (CV≥50%): {stability.get('unstable', 'N/A')} ({stability.get('unstable_pct', 'N/A')}%)")


async def main():
    """主函数"""
    print("UGVIS AI Agent - 工具链演示")
    print("注意: 确保 UGVIS 后端已启动 (http://localhost:8000)")
    print()
    
    try:
        await demo_stats()
        await demo_planning()
        await demo_seasonal()
    except Exception as e:
        print(f"演示出错: {e}")
    finally:
        await ugvis_client.close()
    
    print("\n" + "=" * 60)
    print("演示完成!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
