# Deal Processing System

Система управления финансовыми сделками с ролями: Менеджер, Бухгалтер, ФинДиректор.

## Структура проекта

```
processing-web-ui/
├── backend/          # FastAPI приложение
│   ├── app/
│   │   ├── api/     # API endpoints
│   │   ├── models/  # SQLAlchemy модели
│   │   ├── schemas/ # Pydantic схемы
│   │   ├── services/# Бизнес-логика (расчеты)
│   │   └── core/    # Конфигурация, БД, security
│   └── alembic/     # Миграции БД
└── frontend/        # React + TypeScript приложение
    └── src/
        ├── components/
        ├── pages/
        ├── contexts/
        └── lib/
```

## Установка и запуск

### 🐳 Docker (Рекомендуется)

Самый простой способ запустить весь проект:

```bash
# Запуск всех сервисов
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down
```

После запуска:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

Подробнее см. [DOCKER.md](DOCKER.md)

### 📦 Локальная установка

### Backend

1. Создайте виртуальное окружение:
```bash
cd backend
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

4. Создайте файл `.env` в папке `backend/`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/deal_processing
SECRET_KEY=your-secret-key-change-in-production
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

### Frontend

1. Установите зависимости:
```bash
cd frontend
npm install
```

2. Создайте файл `.env`:
```
VITE_API_URL=http://localhost:8000
```

3. Запустите dev сервер:
```bash
npm run dev
```

Приложение будет доступно по адресу: http://localhost:5173

## Тестовые пользователи

После запуска seed_data.py будут созданы:

- **Менеджер**: manager@test.com / manager123
- **Бухгалтер**: accountant@test.com / accountant123
- **ФинДиректор**: director@test.com / director123

## API Endpoints

### Аутентификация
- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `GET /api/auth/me` - Текущий пользователь

### Сделки
- `GET /api/deals` - Список сделок (с фильтрацией по роли)
- `POST /api/deals` - Создать сделку (Менеджер)
- `GET /api/deals/{id}` - Детали сделки
- `PUT /api/deals/{id}` - Обновить сделку
- `POST /api/deals/{id}/submit-for-calculation` - Отправить на расчет

### Транзакции
- `PUT /api/transactions/{id}` - Обновить транзакцию (выбор маршрута)
- `POST /api/transactions/deal/{id}/calculate-all` - Рассчитать все транзакции
- `POST /api/transactions/{id}/mark-paid` - Отметить как оплаченную

### Бухгалтер
- `POST /api/accountant/{deal_id}/submit-for-approval` - Отправить на утверждение

### Директор
- `GET /api/director/pending` - Список на утверждение
- `POST /api/director/{deal_id}/approve` - Утвердить
- `POST /api/director/{deal_id}/reject` - Отклонить

## Статусы сделок

- `new` - Новая заявка
- `calculation_pending` - Ожидает расчета
- `director_approval_pending` - Ожидает утверждения директора
- `director_rejected` - Отклонено директором
- `client_approval` - Согласование с клиентом
- `awaiting_payment` - Ожидает оплаты
- `execution` - В исполнении
- `completed` - Завершена

## Типы маршрутов транзакций

- `exchange` - Биржа
- `supply_partner` - Supply / Партнер
- `direct_payment` - Прямой платеж
- `split_50_50` - Сплит 50/50

