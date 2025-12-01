# Backend - Deal Processing API

FastAPI приложение для системы управления финансовыми сделками.

## Установка

1. Создайте виртуальное окружение:
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

2. Установите зависимости:
```bash
pip install -r requirements.txt
```

3. Настройте PostgreSQL и создайте базу данных:
```sql
CREATE DATABASE deal_processing;
```

4. Создайте файл `.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/deal_processing
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

5. Запустите миграции:
```bash
alembic upgrade head
```

6. Заполните тестовыми данными:
```bash
python scripts/seed_data.py
```

7. Запустите сервер:
```bash
uvicorn app.main:app --reload
```

API будет доступен по адресу: http://localhost:8000

Документация API: http://localhost:8000/docs

