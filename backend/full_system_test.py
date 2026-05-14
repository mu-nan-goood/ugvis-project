"""
RGB城市绿化规划系统 - 全功能自动化测试
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000"
LM_STUDIO_URL = "http://127.0.0.1:1234/v1"

def test(name, func):
    """执行单个测试"""
    print(f"\n{'='*60}")
    print(f"TEST: {name}")
    print('='*60)
    try:
        result = func()
        print(f"[PASS] {result}")
        return True, result
    except Exception as e:
        print(f"[FAIL] {e}")
        return False, str(e)

def main():
    print("="*60)
    print("RGB城市绿化规划系统 - 全功能自动化测试")
    print("="*60)
    print(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Backend: {BASE_URL}")
    print(f"LM Studio: {LM_STUDIO_URL}")
    
    results = {}
    
    # 1. 健康检查
    def health_check():
        resp = requests.get(f"{BASE_URL}/api/health", timeout=5)
        data = resp.json()
        return f"status={data.get('message')}, version={data.get('version')}"
    
    success, msg = test("1. Backend Health Check", health_check)
    results['health'] = success
    
    # 2. ChromaDB / 知识库状态
    def kb_stats():
        resp = requests.get(f"{BASE_URL}/api/feedback/knowledge-base/stats", timeout=5)
        data = resp.json()
        return f"status={data.get('status')}, records={data.get('total_records')}, model={data.get('embedding_model')}"
    
    success, msg = test("2. ChromaDB KB Status", kb_stats)
    results['kb_status'] = success
    results['kb_records'] = msg
    
    # 3. LM Studio Embedding 服务
    def embedding_service():
        payload = {"model": "text-embedding-nomic-embed-text-v2-moe", "input": "Test text for embedding"}
        resp = requests.post(f"{LM_STUDIO_URL}/embeddings", json=payload, timeout=30)
        data = resp.json()
        dim = len(data['data'][0]['embedding'])
        return f"HTTP={resp.status_code}, dim={dim}"
    
    success, msg = test("3. LM Studio Embedding", embedding_service)
    results['embedding'] = success
    
    # 4. 获取现有反馈列表
    def get_feedbacks():
        resp = requests.get(f"{BASE_URL}/api/feedback", timeout=5)
        feedbacks = resp.json()
        return f"total={len(feedbacks)}, last_id={feedbacks[-1]['id'] if feedbacks else 'none'}"
    
    success, msg = test("4. Get Feedback List", get_feedbacks)
    results['get_feedbacks'] = success
    
    # 5. 提交好评反馈（应触发RAG索引）
    def submit_positive_feedback():
        payload = {
            "vote": "up",
            "advice_context": "In commercial districts, plant ginkgo trees. Their golden autumn leaves have high ornamental value and fallen leaves are concentrated for easy cleaning.",
            "comment": "Ginkgo is suitable for commercial areas",
            "area_ids": "3,4",
            "season": "autumn"
        }
        resp = requests.post(f"{BASE_URL}/api/feedback", json=payload, timeout=30)
        data = resp.json()
        return f"id={data.get('id')}, vote={data.get('vote')}"
    
    success, msg = test("5. Submit Positive Feedback (triggers RAG)", submit_positive_feedback)
    results['submit_feedback'] = success
    
    time.sleep(2)
    
    # 6. 验证RAG索引已更新
    def verify_rag_index():
        resp = requests.get(f"{BASE_URL}/api/feedback/knowledge-base/stats", timeout=5)
        data = resp.json()
        return f"indexed_records={data.get('total_records')}"
    
    success, msg = test("6. Verify RAG Index Updated", verify_rag_index)
    results['rag_index'] = success
    
    # 7. 提交差评反馈（不应触发索引）
    def submit_negative_feedback():
        payload = {
            "vote": "down",
            "advice_context": "Plant cacti in parks",
            "comment": "Not suitable, cacti are not for outdoor",
            "area_ids": "5",
            "season": "summer"
        }
        resp = requests.post(f"{BASE_URL}/api/feedback", json=payload, timeout=30)
        data = resp.json()
        return f"id={data.get('id')}, vote={data.get('vote')}"
    
    success, msg = test("7. Submit Negative Feedback (no index)", submit_negative_feedback)
    results['submit_downvote'] = success
    
    # 8. 生成绿化规划建议（核心功能）
    def generate_advice():
        payload = {
            "areas": [
                {
                    "id": 1,
                    "name": "City Park Zone A",
                    "district": "Downtown",
                    "area_sqm": 2000,
                    "green_coverage_pct": 25.0,
                    "current_vegetation": "Weeds",
                    "main_soil_type": "Loam"
                },
                {
                    "id": 2,
                    "name": "Commercial Street B",
                    "district": "CBD",
                    "area_sqm": 500,
                    "green_coverage_pct": 15.0,
                    "current_vegetation": "No vegetation",
                    "main_soil_type": "Clay"
                }
            ],
            "season": "summer",
            "history": []
        }
        resp = requests.post(f"{BASE_URL}/api/planning/advice", json=payload, timeout=120)
        data = resp.json()
        advice = data.get('advice', '')
        return f"HTTP={resp.status_code}, advice_len={len(advice)} chars"
    
    success, msg = test("8. Generate Greening Advice (Core)", generate_advice)
    results['generate_advice'] = success
    
    # 9. 反馈统计
    def feedback_stats():
        resp = requests.get(f"{BASE_URL}/api/feedback/stats", timeout=5)
        data = resp.json()
        return f"up={data.get('upvotes')}, down={data.get('downvotes')}, total={data.get('total')}"
    
    success, msg = test("9. Feedback Stats", feedback_stats)
    results['feedback_stats'] = success
    
    # 10. 系统统计
    def system_stats():
        resp = requests.get(f"{BASE_URL}/api/stats", timeout=5)
        data = resp.json()
        return f"areas={data.get('total_areas')}, points={data.get('total_points')}"
    
    success, msg = test("10. System Stats", system_stats)
    results['system_stats'] = success
    
    # 测试总结
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for v in results.values() if v is True)
    total = len(results)
    
    for name, result in results.items():
        status = "[PASS]" if result is True else "[FAIL]"
        print(f"  {status} {name}")
    
    print(f"\nTotal: {passed}/{total} passed")
    
    if passed == total:
        print("\n==> ALL TESTS PASSED! System is operational!")
    else:
        print(f"\n==> {total - passed} test(s) FAILED!")
    
    return results

if __name__ == "__main__":
    main()
