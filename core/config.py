import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # VSCode debe pasar esto en el 'env' del spawn process
    GEMINI_API_KEY: str
    LOG_LEVEL: str = "INFO"
    
    # Configuraciones del modelo
    ROUTER_MODEL: str = "gemini-1.5-flash"
    WRITER_MODEL: str = "gemini-1.5-pro"

    class Config:
        env_prefix = "BLOOM_"  # Busca variables como BLOOM_GEMINI_API_KEY

settings = Settings()