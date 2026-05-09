"""Agent 核心逻辑"""
import json
from typing import Dict, Any, List
from llm import llm_client
from tools import ugvis_client, TOOLS_DEFINITION
from prompts import SYSTEM_PROMPT, REPORT_GENERATION_PROMPT


class UGVISAgent:
    """UGVIS AI Agent 核心"""

    def __init__(self):
        self.conversation_history: List[Dict[str, str]] = []
        self.llm = llm_client
        self.ugvis = ugvis_client

    async def chat(self, user_query: str) -> Dict[str, Any]:
        """
        处理用户查询的主入口

        Args:
            user_query: 用户的自然语言查询

        Returns:
            包含回复内容和元数据的字典
        """
        # 构建消息（含 system prompt，Anthropic 格式）
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            *self.conversation_history,
            {"role": "user", "content": user_query},
        ]

        # 第一步：调用 LLM 进行意图理解和工具选择
        response = await self.llm.chat(
            messages=messages,
            tools=TOOLS_DEFINITION,
            temperature=0.3,
        )

        if "error" in response:
            return {
                "success": False,
                "error": response["message"],
                "query": user_query,
            }

        # 检查是否有工具调用
        tool_calls = self.llm.extract_tool_calls(response)

        if tool_calls:
            # 执行工具调用链
            tool_results = await self._execute_tool_calls(tool_calls)

            # 第二步：将工具结果传回 LLM（Anthropic 格式：role: user）
            # Anthropic 不支持 role: tool，用 role: user + 内容块传递工具结果
            tool_result_messages = []
            for tc, (fname, fresult) in zip(tool_calls, tool_results.items()):
                tool_result_messages.append(
                    self.llm.build_tool_result_message(
                        tool_call_id=tc["id"],
                        tool_name=fname,
                        result=fresult,
                    )
                )

            # 第二轮 LLM 调用：基于工具结果生成报告
            messages_with_results = (
                messages
                + [self.llm.extract_content(response)]  # LLM 说的第一段话
                + tool_result_messages
            )

            # 添加报告生成请求
            messages_with_results.append({
                "role": "user",
                "content": (
                    "以上是工具执行结果，请基于这些真实数据，"
                    "为用户生成一份专业的城市绿化规划分析报告。"
                    f"\n\n用户原始问题: {user_query}"
                ),
            })

            report_response = await self.llm.chat(
                messages=messages_with_results,
                temperature=0.5,
                max_tokens=4096,
            )

            if "error" in report_response:
                report = f"报告生成失败: {report_response['message']}"
            else:
                report = self.llm.extract_content(report_response)

            # 更新对话历史
            self._update_history(user_query, report)

            return {
                "success": True,
                "query": user_query,
                "tools_used": [tc["function"]["name"] for tc in tool_calls],
                "data_summary": self._summarize_data(tool_results),
                "report": report,
            }
        else:
            # 无需工具调用，直接回复
            content = self.llm.extract_content(response)
            self._update_history(user_query, content)

            return {
                "success": True,
                "query": user_query,
                "tools_used": [],
                "report": content,
            }

    async def _execute_tool_calls(self, tool_calls: List[Dict]) -> Dict[str, Any]:
        """执行工具调用，返回 {函数名: 结果} 字典"""
        results = {}

        for tool_call in tool_calls:
            function_name = tool_call["function"]["name"]
            arguments = json.loads(tool_call["function"]["arguments"])

            # 调用对应的 UGVIS API
            if function_name == "get_stats":
                results[function_name] = await self.ugvis.get_stats()
            elif function_name == "get_points":
                results[function_name] = await self.ugvis.get_points(**arguments)
            elif function_name == "get_seasonal_analysis":
                results[function_name] = await self.ugvis.get_seasonal_analysis()
            elif function_name == "get_spatial_analysis":
                results[function_name] = await self.ugvis.get_spatial_analysis()
            elif function_name == "get_planning":
                results[function_name] = await self.ugvis.get_planning()

        return results

    def _summarize_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """生成数据摘要"""
        summary = {}

        for key, value in data.items():
            if isinstance(value, dict):
                if "total_points" in value:
                    summary[key] = {
                        "total_points": value.get("total_points"),
                        "total_roads": value.get("total_roads"),
                    }
                elif "stats" in value:
                    summary[key] = {"stats": value.get("stats")}
                else:
                    summary[key] = {"keys": list(value.keys())[:10]}
            else:
                summary[key] = {"type": type(value).__name__}

        return summary

    def _update_history(self, user_query: str, assistant_response: str):
        """更新对话历史（Anthropic 格式）"""
        self.conversation_history.append({"role": "user", "content": user_query})
        self.conversation_history.append({"role": "assistant", "content": assistant_response})

        # 限制历史长度，保留最近 10 轮对话
        if len(self.conversation_history) > 20:
            self.conversation_history = self.conversation_history[-20:]

    def clear_history(self):
        """清空对话历史"""
        self.conversation_history = []

    async def close(self):
        """清理资源"""
        await self.llm.close()
        await self.ugvis.close()
