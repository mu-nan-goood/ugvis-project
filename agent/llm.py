"""LLM 接口封装 - 支持 MiMo / Claude / GPT"""
import json
import httpx
from typing import List, Dict, Any, Optional
from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, MAX_TOKENS, TEMPERATURE


class LLMClient:
    """统一的 LLM 客户端"""
    
    def __init__(self):
        self.api_key = LLM_API_KEY
        self.base_url = LLM_BASE_URL.rstrip("/")
        self.model = LLM_MODEL
        self.client = httpx.AsyncClient(timeout=60.0)
    
    async def chat(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        temperature: float = TEMPERATURE,
        max_tokens: int = MAX_TOKENS,
    ) -> Dict[str, Any]:
        """
        调用 LLM Chat API
        
        Args:
            messages: 对话历史 [{"role": "user", "content": "..."}]
            tools: Function Calling 工具定义
            temperature: 采样温度
            max_tokens: 最大生成 token 数
            
        Returns:
            LLM 响应结果
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        
        try:
            response = await self.client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            return {
                "error": True,
                "message": f"HTTP {e.response.status_code}: {e.response.text}",
            }
        except Exception as e:
            return {
                "error": True,
                "message": str(e),
            }
    
    def extract_tool_calls(self, response: Dict[str, Any]) -> List[Dict]:
        """从 LLM 响应中提取工具调用"""
        if "choices" not in response or not response["choices"]:
            return []
        
        message = response["choices"][0].get("message", {})
        return message.get("tool_calls", [])
    
    def extract_content(self, response: Dict[str, Any]) -> str:
        """从 LLM 响应中提取文本内容"""
        if "choices" not in response or not response["choices"]:
            return ""
        
        message = response["choices"][0].get("message", {})
        return message.get("content", "")
    
    async def close(self):
        """关闭 HTTP 客户端"""
        await self.client.aclose()


# 全局 LLM 客户端实例
llm_client = LLMClient()
