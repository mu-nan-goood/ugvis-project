"""Agent 服务入口 - FastAPI"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from core import UGVISAgent
from tools import TOOLS_DEFINITION
from config import CORS_ORIGINS

app = FastAPI(
    title="UGVIS AI Agent",
    description="基于 MiMo/Claude/GPT 的城市绿化规划智能助手",
    version="0.1.0",
)

# CORS 配置：从 config.py 读取允许的来源列表
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局 Agent 实例
agent = UGVISAgent()


# ============ 数据模型 ============

class ChatRequest(BaseModel):
    """对话请求"""
    query: str
    clear_history: bool = False


class ChatResponse(BaseModel):
    """对话响应"""
    success: bool
    query: str
    tools_used: List[str]
    data_summary: Optional[Dict[str, Any]]
    report: str
    error: Optional[str] = None


class QueryRequest(BaseModel):
    """结构化查询请求"""
    tool: str
    parameters: Optional[Dict[str, Any]] = {}


class ToolsResponse(BaseModel):
    """工具列表响应"""
    tools: List[Dict[str, Any]]


# ============ API 端点 ============

@app.get("/")
def root():
    """健康检查"""
    return {
        "message": "UGVIS AI Agent is running",
        "version": "0.1.0",
        "docs": "/docs",
    }


@app.get("/api/agent/tools", response_model=ToolsResponse)
def get_tools():
    """获取可用工具列表"""
    return {"tools": TOOLS_DEFINITION}


@app.post("/api/agent/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    自然语言对话
    
    示例请求:
    ```json
    {
        "query": "南京冬季绿化最差的区域在哪？",
        "clear_history": false
    }
    ```
    """
    if request.clear_history:
        agent.clear_history()
    
    try:
        result = await agent.chat(request.query)
        return ChatResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent/query")
async def structured_query(request: QueryRequest):
    """
    结构化查询（直接调用工具）
    
    示例请求:
    ```json
    {
        "tool": "get_stats",
        "parameters": {}
    }
    ```
    """
    from tools import ugvis_client
    
    try:
        if request.tool == "get_stats":
            data = await ugvis_client.get_stats()
        elif request.tool == "get_points":
            data = await ugvis_client.get_points(**request.parameters)
        elif request.tool == "get_seasonal_analysis":
            data = await ugvis_client.get_seasonal_analysis()
        elif request.tool == "get_spatial_analysis":
            data = await ugvis_client.get_spatial_analysis()
        elif request.tool == "get_planning":
            data = await ugvis_client.get_planning()
        else:
            raise HTTPException(status_code=400, detail=f"未知工具: {request.tool}")
        
        return {"success": True, "tool": request.tool, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.on_event("shutdown")
async def shutdown():
    """服务关闭时清理资源"""
    await agent.close()


# ============ 启动入口 ============

if __name__ == "__main__":
    import uvicorn
    from config import AGENT_PORT
    
    uvicorn.run("main:app", host="0.0.0.0", port=AGENT_PORT, reload=True)
