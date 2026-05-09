"""Agent 配置管理"""
import os
from dotenv import load_dotenv

load_dotenv()

# LLM 配置
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.minimax.chat/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "MiniMax-Text-01")
# MiniMax API GroupId（计费用，可从 MiniMax 平台获取）
LLM_API_GROUP_ID = os.getenv("LLM_API_GROUP_ID", "")

# UGVIS 后端配置
UGVIS_API_URL = os.getenv("UGVIS_API_URL", "http://localhost:8000")

# Agent 配置
AGENT_PORT = int(os.getenv("AGENT_PORT", "8001"))
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "4096"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.3"))

# CORS 配置（安全性增强：限制来源）
# 开发环境可设置多个域名，逗号分隔
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
