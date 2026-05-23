"""
LLM Client - Multi-vendor API support (including streaming)
"""
import json
import re
import asyncio
import time
import logging
from typing import Dict, List, Optional, Any, AsyncGenerator
import httpx

try:
    from backend.schemas import LLMConfigRequest as LLMConfig
except ImportError:
    from schemas import LLMConfigRequest as LLMConfig

logger = logging.getLogger(__name__)

DEFAULT_MODELS = {
    "openai": "gpt-4o",
    "kimi": "moonshot-v1-128k",
    "claude": "claude-3-5-sonnet-20241022",
    "deepseek": "deepseek-chat",
    "custom": "gpt-4o",
}

API_BASES = {
    "openai": "https://api.openai.com/v1",
    "kimi": "https://api.moonshot.cn/v1",
    "claude": "https://api.anthropic.com/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "custom": None,
}


class LLMClient:
    # SSE chunk buffering: flush every _CHUNK_INTERVAL seconds or _CHUNK_SIZE characters
    _CHUNK_INTERVAL = 0.05  # 50ms
    _CHUNK_SIZE = 20         # characters

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def client(self) -> httpx.AsyncClient:
        """懒初始化 AsyncClient，避免模块导入时创建。"""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=120.0)
        return self._client

    @staticmethod
    async def _buffered_stream_chunks(
        token_gen: AsyncGenerator[str, None],
        interval: float = 0.05,
        max_size: int = 20,
    ) -> AsyncGenerator[str, None]:
        """
        Buffer LLM tokens and yield batched chunk events.

        Instead of one SSE event per token (1-3 chars), we accumulate tokens
        and flush when either `interval` seconds have elapsed or `max_size`
        characters have accumulated. This reduces 4000-char responses from
        ~4000 SSE events to ~200, dramatically improving performance.
        """
        buffer = ""
        last_flush = time.monotonic()

        async for token in token_gen:
            buffer += token
            now = time.monotonic()
            if len(buffer) >= max_size or (now - last_flush) >= interval:
                yield json.dumps({"type": "chunk", "content": buffer}, ensure_ascii=False) + "\n\n"
                buffer = ""
                last_flush = now

        # Flush remaining
        if buffer:
            yield json.dumps({"type": "chunk", "content": buffer}, ensure_ascii=False) + "\n\n"

    async def close(self):
        """关闭 httpx 客户端，释放连接池。"""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None



    # ─── RAG: Knowledge Retrieval ─────────────────────────────────────────────

    async def _retrieve_knowledge_context(
        self,
        areas: List[Dict],
        preferences: Optional[Dict],
        embedding_api_key: Optional[str],
        embedding_base_url: Optional[str],
        top_k: int = 3,
    ) -> str:
        """
        Retrieve relevant historical advice from ChromaDB and format as context string.
        Returns empty string if retrieval is disabled or ChromaDB is unavailable.
        """
        if not embedding_api_key:
            logger.debug("No embedding API key, skipping RAG retrieval")
            return ""

        # Build query text from areas + preferences
        query_parts = [f"分析 {len(areas)} 个城市绿化薄弱区域"]
        for a in areas[:5]:
            query_parts.append(
                f"({a.get('lat', 0):.4f}, {a.get('lng', 0):.4f}) "
                f"道路类型:{a.get('road_type', '未知')} "
                f"冬季GVI:{a.get('gvi_winter', 'N/A')}%"
            )
        if preferences:
            query_parts.append(f"用户偏好:{preferences.get('focus', 'gvi_improvement')}")
        query = " ".join(query_parts)

        try:
            from services.knowledge_base import retrieve_relevant_advice
            records = await retrieve_relevant_advice(
                query=query,
                top_k=top_k,
                embedding_api_key=embedding_api_key,
                embedding_base_url=embedding_base_url,
            )
            if not records:
                return ""

            lines = ["## 历史成功改造案例参考（检索增强生成/RAG）"]
            for i, rec in enumerate(records, 1):
                sim = max(0.0, 1.0 - (rec.get("distance") or 1.0))
                lines.append(f"\n### 案例 {i}（相似度 {sim:.0%}）")
                lines.append(rec.get("advice_context") or "")
                advice_text = rec.get("advice_text") or ""
                if advice_text:
                    lines.append(f"具体方案摘要: {advice_text[:200]}")
            logger.info(f"RAG retrieved {len(records)} relevant historical advice")
            return "\n".join(lines)
        except Exception as e:
            logger.warning(f"RAG retrieval failed: {e}")
            return ""
    async def generate_renovation_advice(
        self,
        areas: List[Dict],
        preferences: Optional[Dict] = None,
        llm_config: Optional[LLMConfig] = None,
        system_prompt: Optional[str] = None,
        retrieve_knowledge: bool = True,
        embedding_api_key: Optional[str] = None,
        embedding_base_url: Optional[str] = None,
    ) -> Dict:
        """Generate renovation advice, return structured data. Supports RAG."""
        user_prompt = self._build_prompt(areas, preferences)

        # RAG: retrieve relevant historical advice
        rag_context = ""
        if retrieve_knowledge:
            rag_context = await self._retrieve_knowledge_context(
                areas, preferences, embedding_api_key, embedding_base_url, top_k=3
            )

        default_system_prompt = (
            "你是一位城市绿化规划专家。请根据提供的城市绿化薄弱区域数据，用中文生成详细的改造建议。\n"
            "先用 Markdown 输出分析和建议，最后输出一个 JSON 代码块，包含以下字段：\n"
            "route_plan（路线规划）、implementation_plan（实施计划）、budget_estimate（预算估算）、priority_areas（优先改造区域）。"
        )
        if rag_context:
            default_system_prompt = (
                default_system_prompt.rstrip() + "\n\n" + rag_context + "\n"
                "重要：请参考上面的历史成功案例，但要因地制宜，不要照搬。"
            )
        system_prompt = system_prompt or default_system_prompt

        response = await self._call_api(
            prompt=user_prompt,
            system_prompt=system_prompt,
            llm_config=llm_config,
        )
        return self._parse_structured_response(response)

    def _build_prompt(self, areas: List[Dict], preferences: Optional[Dict] = None) -> str:
        """Build user prompt."""
        areas_text = json.dumps(areas, ensure_ascii=False, indent=2)
        pref_text = ""
        if preferences:
            pref_text = (
                f"\nUser preferences:\n"
                f"- Focus: {preferences.get('focus', 'gvi_improvement')}\n"
                f"- Budget: {preferences.get('budget', 'medium')}\n"
                f"- Priority: {preferences.get('priority', 'all')}"
            )
        return (
            f"请分析以下城市绿化薄弱区域，生成详细的改造建议。\n"
            f"薄弱区域总数：{len(areas)}\n{areas_text}{pref_text}\n\n"
            f"请提供：1) 分析与策略，2) 路线规划，3) 实施阶段，4) 预算估算，5) 优先改造区域排名。"
        )

    async def _call_api(
        self,
        prompt: str,
        system_prompt: str,
        llm_config: Optional[LLMConfig] = None,
        messages: Optional[List[Dict]] = None,
    ) -> str:
        """Call LLM API (non-streaming)."""
        if not llm_config or not llm_config.api_key:
            raise ValueError("No LLM API Key provided")

        provider = llm_config.provider
        api_key = llm_config.api_key
        model = llm_config.model or DEFAULT_MODELS.get(provider, "gpt-4o")
        api_base = llm_config.api_base or API_BASES.get(provider)
        logger.info(f"[_call_api] provider={provider}, api_base={api_base}, api_key={'*' + api_key[-4:] if api_key and len(api_key) > 4 else 'SHORT'}, model={model}")

        if provider == "claude":
            return await self._call_claude(api_base, api_key, model, prompt, system_prompt, messages)
        else:
            return await self._call_openai_compatible(api_base, api_key, model, prompt, system_prompt, messages)

    async def _call_openai_compatible(
        self,
        api_base: str,
        api_key: str,
        model: str,
        prompt: str,
        system_prompt: str,
        messages: Optional[List[Dict]] = None,
        tools: Optional[List[Dict]] = None,
    ) -> str:
        """Call OpenAI-compatible API (non-streaming)."""
        url = f"{api_base}/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        if messages:
            full_messages = [{"role": "system", "content": system_prompt}] + messages
        else:
            full_messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ]
        payload: Dict[str, Any] = {"model": model, "messages": full_messages, "temperature": 0.7, "max_tokens": 4000}
        if tools:
            payload["tools"] = tools

        try:
            response = await self.client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            # Check for native tool_calls in response
            msg = data["choices"][0]["message"]
            if msg.get("tool_calls"):
                # Return a special marker so the caller can handle it
                return json.dumps({"__native_tool_calls__": True, "content": msg.get("content", ""), "tool_calls": msg["tool_calls"]})
            return msg["content"]
        except httpx.HTTPStatusError as e:
            # 连接池污染恢复：400/502 等错误后重建客户端
            if e.response.status_code in (400, 502, 503):
                logger.warning(f"HTTP {e.response.status_code} detected, resetting httpx client")
                await self.close()
            raise

    async def _call_claude(
        self,
        api_base: str,
        api_key: str,
        model: str,
        prompt: str,
        system_prompt: str,
        messages: Optional[List[Dict]] = None,
    ) -> str:
        """Call Claude API (non-streaming)."""
        url = f"{api_base}/messages"
        headers = {
            "x-api-key": api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }
        if messages:
            claude_messages = messages
        else:
            claude_messages = [{"role": "user", "content": prompt}]
        payload = {
            "model": model,
            "max_tokens": 4000,
            "system": system_prompt,
            "messages": claude_messages,
        }
        try:
            response = await self.client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["content"][0]["text"]
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (400, 502, 503):
                logger.warning(f"HTTP {e.response.status_code} detected, resetting httpx client")
                await self.close()
            raise

    async def _stream_openai_compatible(
        self,
        api_base: str,
        api_key: str,
        model: str,
        prompt: str,
        system_prompt: str,
        messages: Optional[List[Dict]] = None,
        tools: Optional[List[Dict]] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream OpenAI-compatible API."""
        url = f"{api_base}/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        if messages:
            full_messages = [{"role": "system", "content": system_prompt}] + messages
        else:
            full_messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ]
        payload: Dict[str, Any] = {"model": model, "messages": full_messages, "temperature": 0.7, "max_tokens": 4000, "stream": True}
        if tools:
            payload["tools"] = tools

        try:
            async with self.client.stream("POST", url, headers=headers, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue
        except httpx.HTTPStatusError as e:
            # B17 fix: rebuild connection pool on server errors (same as non-streaming)
            if e.response.status_code in (400, 502, 503):
                logger.warning(f"Stream HTTP {e.response.status_code} detected, resetting httpx client")
                await self.close()
            raise

    async def _stream_claude(
        self,
        api_base: str,
        api_key: str,
        model: str,
        prompt: str,
        system_prompt: str,
        messages: Optional[List[Dict]] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream Claude API."""
        url = f"{api_base}/messages"
        headers = {
            "x-api-key": api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }
        if messages:
            claude_messages = messages
        else:
            claude_messages = [{"role": "user", "content": prompt}]
        payload = {
            "model": model,
            "max_tokens": 4000,
            "system": system_prompt,
            "messages": claude_messages,
            "stream": True,
        }

        try:
            async with self.client.stream("POST", url, headers=headers, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    try:
                        event = json.loads(data_str)
                        event_type = event.get("type", "")
                        if event_type == "content_block_delta":
                            delta = event.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text = delta.get("text", "")
                                if text:
                                    yield text
                        elif event_type == "message_stop":
                            break
                    except json.JSONDecodeError:
                        continue
        except httpx.HTTPStatusError as e:
            # B17 fix: rebuild connection pool on server errors (same as non-streaming)
            if e.response.status_code in (400, 502, 503):
                logger.warning(f"Claude stream HTTP {e.response.status_code} detected, resetting httpx client")
                await self.close()
            raise

    def _parse_structured_response(self, raw_response: str) -> Dict:
        """Parse LLM response, separate Markdown and structured JSON."""
        json_match = re.search(r"```(?:json)?\s*(.*?)\s*```", raw_response, re.DOTALL)
        structured_data = {}
        if json_match:
            try:
                json_str = json_match.group(1).strip()
                structured_data = json.loads(json_str)
                markdown_content = re.sub(r"```(?:json)?\s*.*?\s*```", "", raw_response, flags=re.DOTALL).strip()
            except json.JSONDecodeError as e:
                logger.warning(f"JSON parse error: {e}")
                markdown_content = raw_response
        else:
            markdown_content = raw_response

        return {
            "advice": markdown_content,
            "route_plan": structured_data.get("route_plan"),
            "implementation_plan": structured_data.get("implementation_plan"),
            "budget_estimate": structured_data.get("budget_estimate"),
            "priority_areas": structured_data.get("priority_areas"),
            "raw_response": raw_response,
        }

    async def stream_renovation_advice(
        self,
        areas: List[Dict],
        preferences: Optional[Dict] = None,
        llm_config: Optional[LLMConfig] = None,
        system_prompt: Optional[str] = None,
        user_prompt: Optional[str] = None,
        retrieve_knowledge: bool = True,
        embedding_api_key: Optional[str] = None,
        embedding_base_url: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream renovation advice with RAG support, token by token."""
        if not user_prompt:
            user_prompt = self._build_prompt(areas, preferences)

        # RAG: retrieve relevant historical advice
        rag_context = ""
        if retrieve_knowledge:
            rag_context = await self._retrieve_knowledge_context(
                areas, preferences, embedding_api_key, embedding_base_url, top_k=3
            )

        default_system_prompt = "你是一位城市绿化规划专家。请根据提供的城市绿化薄弱区域数据，用中文生成详细的改造建议。先用 Markdown 输出分析和建议，最后输出一个 JSON 代码块，包含：route_plan、implementation_plan、budget_estimate、priority_areas。"
        if rag_context:
            default_system_prompt = (
                default_system_prompt.rstrip() + "\n\n" + rag_context + "\n"
                "重要：请参考上面的历史成功案例，但要因地制宜，不要照搬。"
            )
        system_prompt = system_prompt or default_system_prompt

        if not llm_config or not llm_config.api_key:
            raise ValueError("No LLM API Key provided")

        provider = llm_config.provider
        api_key = llm_config.api_key
        model = llm_config.model or DEFAULT_MODELS.get(provider, "gpt-4o")
        api_base = llm_config.api_base or API_BASES.get(provider)

        if provider == "claude":
            async for chunk in self._stream_claude(api_base, api_key, model, user_prompt, system_prompt):
                yield chunk
        else:
            async for chunk in self._stream_openai_compatible(api_base, api_key, model, user_prompt, system_prompt):
                yield chunk

    async def chat_stream(
        self,
        message: str,
        history: Optional[List[Dict]] = None,
        areas: Optional[List[Dict]] = None,
        preferences: Optional[Dict] = None,
        llm_config: Optional[LLMConfig] = None,
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Multi-turn chat streaming.
        Sends history + current user message to LLM for conversational interaction.
        """
        if not system_prompt:
            system_prompt = self._build_chat_system_prompt(areas, preferences)

        messages = list(history) if history else []
        messages.append({"role": "user", "content": message})

        if not llm_config or not llm_config.api_key:
            raise ValueError("No LLM API Key provided")

        provider = llm_config.provider
        api_key = llm_config.api_key
        model = llm_config.model or DEFAULT_MODELS.get(provider, "gpt-4o")
        api_base = llm_config.api_base or API_BASES.get(provider)

        if provider == "claude":
            async for chunk in self._stream_claude(api_base, api_key, model, "", system_prompt, messages):
                yield chunk
        else:
            async for chunk in self._stream_openai_compatible(api_base, api_key, model, "", system_prompt, messages):
                yield chunk

    def _build_chat_system_prompt(
        self,
        areas: Optional[List[Dict]] = None,
        preferences: Optional[Dict] = None,
    ) -> str:
        """Build system prompt for chat, includes context data."""
        parts = [
            "You are an urban green planning AI assistant. Your responsibilities:\n"
            "- Analyze weak area data and provide greening renovation advice\n"
            "- Answer questions about green planning, plant selection, budget, etc.\n"
            "- Refine or adjust advice based on follow-up questions\n"
            "- Provide professional yet accessible responses in Chinese\n\n"
            "Output format:\n"
            "- Use Markdown, clearly structured\n"
            "- For routes/budget/implementation plans, append a JSON code block at the end "
            "(format: route_plan, implementation_plan, budget_estimate, priority_areas)",
        ]

        if areas:
            display_areas = areas[:50]
            areas_text = json.dumps(display_areas, ensure_ascii=False, indent=2)
            parts.append(
                f"\nCurrent weak area data for analysis (total {len(areas)}, showing first {len(display_areas)}):\n{areas_text}"
            )

        if preferences:
            parts.append(
                f"\nUser preferences:\n"
                f"- Focus: {preferences.get('focus', 'gvi_improvement')}\n"
                f"- Budget: {preferences.get('budget', 'medium')}\n"
                f"- Priority: {preferences.get('priority', 'all')}"
            )

        if not areas:
            parts.append(
                "\nNote: No weak area data available yet. If user needs specific advice, "
                "remind them to fetch area data first."
            )

        return "\n".join(parts)

    # ─── Function Calling ─────────────────────────────────────────────────────

    async def chat_stream_with_function_call(
        self,
        message: str,
        history: Optional[List[Dict]] = None,
        areas: Optional[List[Dict]] = None,
        preferences: Optional[Dict] = None,
        llm_config: Optional[LLMConfig] = None,
        system_prompt: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
        db=None,
    ) -> AsyncGenerator[str, None]:
        """
        Multi-turn chat with native Function Calling support.

        R18 fix: Uses OpenAI-native tool_calls protocol instead of XML tags.
        R10 fix: Streams the first call instead of blocking with non-streaming.
        R4 fix: Shows immediate feedback via 'start' event.

        SSE event types:
        - start          : Processing started
        - tool_call_start: LLM wants to call a tool
        - tool_result    : Tool execution result
        - chunk          : LLM text stream chunk
        - done           : Done, includes structured field
        """
        import re as re_module

        if not system_prompt:
            system_prompt = self._build_chat_system_prompt(areas, preferences)

        # R18: Build native tool definitions
        native_tools = None
        if tools:
            tool_defs = []
            for t in tools:
                f = t.get("function", {})
                tool_defs.append({"type": "function", "function": f})
            native_tools = tool_defs

        messages = list(history) if history else []
        messages.append({"role": "user", "content": message})

        provider = llm_config.provider if llm_config else "openai"
        api_key = llm_config.api_key if llm_config else ""
        model = (llm_config.model if llm_config and llm_config.model else DEFAULT_MODELS.get(provider, "gpt-4o"))
        api_base = (llm_config.api_base if llm_config and llm_config.api_base else API_BASES.get(provider, ""))

        if not api_key:
            yield json.dumps({"type": "error", "content": "No LLM API Key provided"}, ensure_ascii=False) + "\n\n"
            return

        # R4 fix: emit start event for immediate UI feedback
        yield json.dumps({"type": "start"}, ensure_ascii=False) + "\n\n"

        # Fallback: if native tools not supported by provider (e.g. Claude), use XML approach
        # For OpenAI-compatible providers, use native tool_calls
        use_native_fc = native_tools is not None and provider not in ("claude",)

        if use_native_fc:
            # ── Native OpenAI tool_calls path ──
            async for event in self._native_fc_stream(
                api_base, api_key, model, system_prompt, messages,
                native_tools, db, provider
            ):
                yield event
        else:
            # ── Legacy XML-based path (Claude / no tools) ──
            fc_pattern = re_module.compile(r"<function_calls>\s*(.*?)\s*</function_calls>", re_module.DOTALL)
            first_response_text = ""
            fc_detected = False
            fc_accumulator = ""
            clean_text_before_fc = ""

            if provider == "claude":
                token_gen = self._stream_claude(api_base, api_key, model, "", system_prompt, messages)
            else:
                token_gen = self._stream_openai_compatible(api_base, api_key, model, "", system_prompt, messages)

            async for token in token_gen:
                first_response_text += token
                if "<function_calls>" in first_response_text:
                    fc_detected = True
                if fc_detected:
                    fc_accumulator += token
                    if "</function_calls>" in fc_accumulator:
                        break
                else:
                    if len(first_response_text) - len(clean_text_before_fc) >= self._CHUNK_SIZE:
                        chunk_text = first_response_text[len(clean_text_before_fc):]
                        clean_text_before_fc = first_response_text
                        yield json.dumps({"type": "chunk", "content": chunk_text}, ensure_ascii=False) + "\n\n"

            if not fc_detected and first_response_text:
                remaining = first_response_text[len(clean_text_before_fc):]
                if remaining:
                    yield json.dumps({"type": "chunk", "content": remaining}, ensure_ascii=False) + "\n\n"
                parsed = self._parse_structured_response(first_response_text)
                structured = {k: v for k, v in parsed.items() if k != "raw_response" and v is not None}
                yield json.dumps({"type": "done", "content": first_response_text, "structured": structured}, ensure_ascii=False) + "\n\n"
                return

            fc_matches = fc_pattern.findall(first_response_text)
            if fc_matches and db is not None:
                tool_results_context = []
                from services.tools.registry import execute_tool
                clean_text = fc_pattern.sub("", first_response_text).strip()
                for fc_json in fc_matches:
                    try:
                        fc_data = json.loads(fc_json)
                        name = fc_data.get("name", "")
                        arguments = fc_data.get("arguments", {})
                        yield json.dumps({"type": "tool_call_start", "name": name, "arguments": arguments, "thinking": clean_text[:200] if clean_text else None}, ensure_ascii=False) + "\n\n"
                        result = execute_tool(name, arguments, db)
                        yield json.dumps({"type": "tool_result", "name": name, "success": result.success, "data": result.data, "error": result.error}, ensure_ascii=False) + "\n\n"
                        tool_results_context.append({"role": "system", "content": f"[TOOL: {name}] Result: {json.dumps(result.to_dict(), ensure_ascii=False)}"})
                    except json.JSONDecodeError as e:
                        logger.warning(f"Function call JSON parse error: {e}")
                        continue
                if clean_text:
                    messages.append({"role": "assistant", "content": clean_text})
                messages.extend(tool_results_context)
                messages.append({"role": "user", "content": "(Please provide your final answer in Chinese based on the tool execution results above.)"})
                if provider == "claude":
                    token_gen = self._stream_claude(api_base, api_key, model, "", system_prompt, messages)
                else:
                    token_gen = self._stream_openai_compatible(api_base, api_key, model, "", system_prompt, messages)
                async for event in self._buffered_stream_chunks(token_gen, self._CHUNK_INTERVAL, self._CHUNK_SIZE):
                    yield event
                parsed = self._parse_structured_response(clean_text)
                structured = {k: v for k, v in parsed.items() if k != "raw_response" and v is not None}
                yield json.dumps({"type": "done", "content": clean_text, "structured": structured}, ensure_ascii=False) + "\n\n"
            else:
                text_to_yield = first_response_text or ""
                if db is None and fc_matches:
                    text_to_yield = fc_pattern.sub("", text_to_yield).strip()
                    if not text_to_yield:
                        text_to_yield = "（工具调用暂不可用，请稍后重试）"
                if text_to_yield:
                    for i in range(0, len(text_to_yield), self._CHUNK_SIZE):
                        chunk = text_to_yield[i:i + self._CHUNK_SIZE]
                        yield json.dumps({"type": "chunk", "content": chunk}, ensure_ascii=False) + "\n\n"
                parsed = self._parse_structured_response(text_to_yield)
                structured = {k: v for k, v in parsed.items() if k != "raw_response" and v is not None}
                yield json.dumps({"type": "done", "content": text_to_yield, "structured": structured}, ensure_ascii=False) + "\n\n"

    async def _native_fc_stream(
        self,
        api_base: str,
        api_key: str,
        model: str,
        system_prompt: str,
        messages: List[Dict],
        native_tools: List[Dict],
        db,
        provider: str,
    ) -> AsyncGenerator[str, None]:
        """Stream with native OpenAI tool_calls protocol."""
        # First call with tools parameter
        url = f"{api_base}/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        full_messages = [{"role": "system", "content": system_prompt}] + messages
        payload = {
            "model": model,
            "messages": full_messages,
            "temperature": 0.7,
            "max_tokens": 4000,
            "stream": True,
            "tools": native_tools,
        }

        # Accumulate streaming response
        response_content = ""
        tool_calls_acc: Dict[int, Dict] = {}  # index -> {id, name, arguments}
        has_tool_calls = False

        try:
            async with self.client.stream("POST", url, headers=headers, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})

                        # Text content
                        content = delta.get("content", "")
                        if content:
                            response_content += content
                            # Buffered yield
                            yield json.dumps({"type": "chunk", "content": content}, ensure_ascii=False) + "\n\n"

                        # Tool calls (streamed incrementally)
                        tc_deltas = delta.get("tool_calls")
                        if tc_deltas:
                            has_tool_calls = True
                            for tc_delta in tc_deltas:
                                idx = tc_delta.get("index", 0)
                                if idx not in tool_calls_acc:
                                    tool_calls_acc[idx] = {
                                        "id": tc_delta.get("id", ""),
                                        "name": "",
                                        "arguments": "",
                                    }
                                if tc_delta.get("id"):
                                    tool_calls_acc[idx]["id"] = tc_delta["id"]
                                fn = tc_delta.get("function", {})
                                if fn.get("name"):
                                    tool_calls_acc[idx]["name"] = fn["name"]
                                if fn.get("arguments"):
                                    tool_calls_acc[idx]["arguments"] += fn["arguments"]
                    except json.JSONDecodeError:
                        continue
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (400, 502, 503):
                logger.warning(f"Native FC stream HTTP {e.response.status_code}, resetting client")
                await self.close()
            yield json.dumps({"type": "error", "content": f"LLM API error: {e.response.status_code}"}, ensure_ascii=False) + "\n\n"
            return

        if not has_tool_calls:
            # No tool calls — just text response
            parsed = self._parse_structured_response(response_content)
            structured = {k: v for k, v in parsed.items() if k != "raw_response" and v is not None}
            yield json.dumps({"type": "done", "content": response_content, "structured": structured}, ensure_ascii=False) + "\n\n"
            return

        # Execute tool calls
        if db is None:
            yield json.dumps({"type": "error", "content": "Tool execution not available"}, ensure_ascii=False) + "\n\n"
            return

        from services.tools.registry import execute_tool

        # Build assistant message with tool_calls for context
        assistant_msg = {"role": "assistant", "content": response_content or None, "tool_calls": []}
        tool_results_msgs = []

        for idx in sorted(tool_calls_acc.keys()):
            tc = tool_calls_acc[idx]
            tc_entry = {
                "id": tc["id"],
                "type": "function",
                "function": {"name": tc["name"], "arguments": tc["arguments"]},
            }
            assistant_msg["tool_calls"].append(tc_entry)

            # Parse arguments
            try:
                arguments = json.loads(tc["arguments"])
            except json.JSONDecodeError:
                arguments = {}

            # Notify frontend
            yield json.dumps(
                {"type": "tool_call_start", "name": tc["name"], "arguments": arguments},
                ensure_ascii=False,
            ) + "\n\n"

            # Execute
            result = execute_tool(tc["name"], arguments, db)

            yield json.dumps(
                {"type": "tool_result", "name": tc["name"], "success": result.success, "data": result.data, "error": result.error},
                ensure_ascii=False,
            ) + "\n\n"

            # Add tool result message
            tool_results_msgs.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(result.to_dict(), ensure_ascii=False),
            })

        # Second call: inject tool results
        messages.append(assistant_msg)
        messages.extend(tool_results_msgs)

        full_messages_2 = [{"role": "system", "content": system_prompt}] + messages
        payload_2 = {
            "model": model,
            "messages": full_messages_2,
            "temperature": 0.7,
            "max_tokens": 4000,
            "stream": True,
        }

        final_content = ""
        try:
            async with self.client.stream("POST", url, headers=headers, json=payload_2) as response:
                response.raise_for_status()
                token_gen = (line for line in self._iter_stream_lines(response))
                async for event in self._buffered_stream_chunks(token_gen, self._CHUNK_INTERVAL, self._CHUNK_SIZE):
                    # Extract content from buffered chunk events
                    try:
                        evt = json.loads(event.strip().rstrip("\n\n").replace("data: ", ""))
                        if evt.get("type") == "chunk":
                            final_content += evt.get("content", "")
                    except Exception:
                        pass
                    yield event
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (400, 502, 503):
                await self.close()
            yield json.dumps({"type": "error", "content": f"LLM API error in second call: {e.response.status_code}"}, ensure_ascii=False) + "\n\n"
            return

        parsed = self._parse_structured_response(final_content)
        structured = {k: v for k, v in parsed.items() if k != "raw_response" and v is not None}
        yield json.dumps({"type": "done", "content": final_content, "structured": structured}, ensure_ascii=False) + "\n\n"

    async def _iter_stream_lines(self, response):
        """Iterate SSE lines from an httpx stream response, yielding text tokens."""
        async for line in response.aiter_lines():
            line = line.strip()
            if not line or not line.startswith("data: "):
                continue
            data_str = line[6:]
            if data_str == "[DONE]":
                break
            try:
                chunk = json.loads(data_str)
                delta = chunk.get("choices", [{}])[0].get("delta", {})
                content = delta.get("content", "")
                if content:
                    yield content
            except json.JSONDecodeError:
                continue


# Global client instance
llm_client = LLMClient()
