import requests
import json

url = 'http://localhost:8000/api/feedback'
payload = {
    'vote': 'up',
    'advice_context': '在城区道路两侧种植法国梧桐，夏季遮荫效果好',
    'comment': '很好的建议',
    'area_ids': '1,2',
    'season': 'summer'
}

try:
    resp = requests.post(url, json=payload)
    print(f'Status: {resp.status_code}')
    print(f'Response: {resp.text}')
except Exception as e:
    print(f'Error: {e}')
