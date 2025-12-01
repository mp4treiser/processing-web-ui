from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.api import api_router

# Создаем таблицы
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Deal Processing API",
    description="API для системы обработки финансовых сделок",
    version="1.0.0"
)

# CORS - разрешаем все origins для разработки
# В production нужно указать конкретные origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Разрешаем все для разработки
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
def root():
    return {"message": "Deal Processing API", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}

