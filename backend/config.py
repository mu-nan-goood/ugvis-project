from pydantic_settings import BaseSettings
from typing import List, Optional

class Settings(BaseSettings):
    database_url: str = "sqlite:///./ugvis.db"
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    # LLM Configuration (API Keys stored server-side only, never exposed to frontend)
    deepseek_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    kimi_api_key: Optional[str] = None
    claude_api_key: Optional[str] = None
    llm_default_provider: str = "deepseek"
    llm_default_model: Optional[str] = None
    llm_timeout: int = 120
    
    # Custom LLM (user provides their own base_url + api_key)
    custom_llm_api_key: Optional[str] = None
    custom_llm_base_url: Optional[str] = None

    # Embedding Configuration (for RAG knowledge base)
    embedding_api_base: Optional[str] = None  # e.g. http://localhost:11434/v1 (Ollama) or http://localhost:1234/v1 (LM Studio)
    embedding_model: str = "nomic-embed-text"  # Model name; use "text-embedding-nomic-embed-text-v2-moe" for LM Studio
    
    # OpenClaw Configuration
    openclaw_url: str = "http://localhost:28789"
    openclaw_token: Optional[str] = None
    
    # JWT Configuration
    jwt_secret_key: str = "your-secret-key-change-in-production"  # 必须从 .env 读取，禁止硬编码
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7
    
    # Initial admin user (created on first startup if not exists)
    init_admin_username: Optional[str] = None
    init_admin_password: Optional[str] = None
    
    class Config:
        env_file = ".env"
    
    def get_api_key_for_provider(self, provider: str) -> Optional[str]:
        """根据 provider 返回服务端存储的 API Key"""
        mapping = {
            "deepseek": self.deepseek_api_key,
            "openai": self.openai_api_key,
            "kimi": self.kimi_api_key,
            "claude": self.claude_api_key,
            "custom": self.custom_llm_api_key,
        }
        return mapping.get(provider)

settings = Settings()
