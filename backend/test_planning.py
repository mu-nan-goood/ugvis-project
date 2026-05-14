import requests
import json

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
    
    # Read the streaming response
    full_response = ''
    for line in resp.iter_lines():
        if line:
            decoded = line.decode('utf-8')
            if decoded.startswith('data: '):
                data = decoded[6:]
                if data == '[DONE]':
                    break
                try:
                    parsed = json.loads(data)
                    if 'content' in parsed:
                        full_response += parsed['content']
                except:
                    pass
    
    print(f'Response length: {len(full_response)} chars')
    if len(full_response) > 0:
        print(f'Response preview: {full_response[:500]}...')
    else:
        print(f'Full response: {resp.text[:500]}')
    
except Exception as e:
    print(f'Error: {e}')
