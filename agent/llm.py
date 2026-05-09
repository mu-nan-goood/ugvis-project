"""LLM 接口封装 - MiniMax Anthropic 兼容 API

支持 function calling，参考:
https://platform.minimaxi.com/docs/api-reference/text-anthropic-api
"""
import json
import httpx
from typing import List, Dict, Any, Optional
from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, MAX_TOKENS, TEMPERATURE, LLM_API_GROUP_ID


class MiniMaxLLMClient:
    """
    MiniMax Anthropic 兼容格式 LLM 客户端

    关键差异 vs OpenAI:
    - Endpoint: POST /v1/messages（Anthropic 风格）
    - Auth: x-api-key header + 可选的 GroupId（MiniMax 计费用）
    - System prompt: 放入 messages[0] 而不是独立的 system 参数
    - Tool choice: Anthropic 格式 {type: "tool"}
    - Tool 结果以 user role 消息传回（role: tool 被视为无效）
    """

    def __init__(self):
        self.api_key = LLM_API_KEY
        self.base_url = LLM_BASE_URL.rstrip("/")
        self.model = LLM_MODEL
        self.group_id = LLM_API_GROUP_ID
        self.client = httpx.AsyncClient(timeout=60.0)

    def _build_headers(self) -> Dict[str, str]:
        """构建请求头"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        # MiniMax 计费用 GroupId（非 Anthropic 标准，MiniMax 扩展）
        if self.group_id:
            headers["GroupId"] = self.group_id
        return headers

    def _build_payload(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        temperature: float = TEMPERATURE,
        max_tokens: int = MAX_TOKENS,
    ) -> Dict[str, Any]:
        """
        构建 MiniMax Anthropic 格式请求体

        Anthropic 要求:
        - messages 中的 system prompt 作为首条消息（role: system）
        - 不支持 role: tool，需要把 tool 结果包装成 role: user 的 tool_result content block
        """
        # 分离 system prompt（Anthropic 格式）
        system_content = ""
        non_system_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_content = msg["content"]
            else:
                non_system_messages.append(msg)

        # 构建消息数组（Anthropic 格式）
        anthropic_messages = []
        if system_content:
            anthropic_messages.append({"role": "system", "content": system_content})
        anthropic_messages.extend(non_system_messages)

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": anthropic_messages,
            "max_tokens": max_tokens,
        }
        if temperature != 0:
            payload["temperature"] = temperature

        if tools:
            payload["tools"] = tools
            # Anthropic tool_choice 格式
            payload["tool_choice"] = {"type": "tool"}

        return payload

    async def chat(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        temperature: float = TEMPERATURE,
        max_tokens: int = MAX_TOKENS,
    ) -> Dict[str, Any]:
        """
        调用 MiniMax LLM Chat API（Anthropic 兼容格式）

        Args:
            messages: 对话历史（含 system prompt 在内的消息列表）
            tools: Function Calling 工具定义（OpenAI 兼容格式）
            temperature: 采样温度
            max_tokens: 最大生成 token 数

        Returns:
            MiniMax API 响应（Anthropic 兼容格式）
        """
        headers = self._build_headers()
        payload = self._build_payload(messages, tools, temperature, max_tokens)

        try:
            response = await self.client.post(
                f"{self.base_url}/messages",
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
            return {"error": True, "message": str(e)}

    def extract_tool_calls(self, response: Dict[str, Any]) -> List[Dict]:
        """
        从 MiniMax Anthropic 响应中提取工具调用

        Anthropic 响应格式:
        {
          "id": "...",
          "type": "message",
          "role": "assistant",
          "content": [
            {"type": "text", "text": "..."},
            {"type": "tool_use", "name": "...", "input": {...}, "id": "..."}
          ],
          "stop_reason": "tool_calls"
        }
        """
        if "content" not in response:
            return []

        tool_calls = []
        for block in response.get("content", []):
            if block.get("type") == "tool_use":
                tool_calls.append({
                    "id": block.get("id", ""),
                    "function": {
                        "name": block.get("name", ""),
                        "arguments": json.dumps(block.get("input", {}), ensure_ascii=False),
                    },
                })
        return tool_calls

    def extract_content(self, response: Dict[str, Any]) -> str:
        """
        从 MiniMax Anthropic 响应中提取文本内容
        """
        if "content" not in response:
            return ""

        parts = []
        for block in response.get("content", []):
            if block.get("type") == "text":
                parts.append(block.get("text", ""))
        return "\n".join(parts)

    def build_tool_result_message(
        self,
        tool_call_id: str,
        tool_name: str,
        result: Any,
    ) -> Dict[str, str]:
        """
        将工具执行结果转换为 Anthropic 格式的 user 消息

        Anthropic 不支持 role: tool，需要以 role: user 消息传递工具结果
        """
        result_str = json.dumps(result, ensure_ascii=False, indent=2)
        return {
            "role": "user",
            "content": (
                f"[Tool: {tool_name}]\n"
                f"Tool ID: {tool_call_id}\n"
                f"Result:\n{result_str}"
            ),
        }

    async def close(self):
        """关闭 HTTP 客户端"""
        await self.client.aclose()


# 全局 LLM 客户端实例
llm_client = MiniMaxLLMClient()
