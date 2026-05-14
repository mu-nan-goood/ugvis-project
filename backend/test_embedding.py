import httpx
import asyncio

async def test():
    url = 'http://127.0.0.1:1234/v1/embeddings'
    headers = {'Content-Type': 'application/json'}
    payload = {
        'model': 'nomic-embed-text',
        'input': 'test text'
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            print(f'Status: {resp.status_code}')
            if resp.status_code == 200:
                data = resp.json()
                embedding = data.get('data', [{}])[0].get('embedding', [])
                print(f'SUCCESS! Embedding dimension: {len(embedding)}')
                print(f'Model: {data.get("model", "unknown")}')
            else:
                print(f'Response: {resp.text[:500]}')
    except Exception as e:
        print(f'Connection error: {e}')

asyncio.run(test())
