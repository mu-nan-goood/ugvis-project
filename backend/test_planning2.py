import requests

url = 'http://localhost:8000/api/planning/advice'
payload = {
    'areas': [
        {
            'id': 1,
            'name': '测试区域',
            'district': '市中心',
            'area_sqm': 500,
            'green_coverage_pct': 20.0,
            'current_vegetation': '少量杂草',
            'main_soil_type': '壤土'
        }
    ],
    'season': 'summer',
    'history': []
}

try:
    resp = requests.post(url, json=payload, stream=True)
    print(f'Status: {resp.status_code}')
    print(f'Headers: {dict(resp.headers)}')
    print()
    
    # Read raw response
    raw = resp.text
    print(f'Raw response length: {len(raw)}')
    print(f'Raw response: {raw[:2000]}')
    
except Exception as e:
    print(f'Error: {e}')
