# Docker Setup Guide

## Быстрый старт

### Разработка (Development)

1. Запустите все сервисы:
```bash
docker-compose up -d
```

2. Проверьте логи:
```bash
docker-compose logs -f
```

3. Остановите сервисы:
```bash
docker-compose down
```

### Production

1. Создайте файл `.env` в корне проекта:
```env
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=deal_processing
SECRET_KEY=your-very-secure-secret-key
VITE_API_URL=http://your-domain.com:8000
```

2. Запустите в production режиме:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Сервисы

- **PostgreSQL**: `localhost:5432`
- **Backend API**: `http://localhost:8000`
- **Frontend**: `http://localhost:3000`
- **API Docs**: `http://localhost:8000/docs`

## Полезные команды

### Просмотр логов
```bash
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres
```

### Пересборка после изменений
```bash
docker-compose build
docker-compose up -d
```

### Выполнение команд в контейнере
```bash
# Backend
docker-compose exec backend bash
docker-compose exec backend alembic upgrade head
docker-compose exec backend python scripts/seed_data.py

# Database
docker-compose exec postgres psql -U deal_user -d deal_processing
```

### Очистка
```bash
# Остановить и удалить контейнеры
docker-compose down

# Удалить также volumes (БД будет очищена!)
docker-compose down -v
```

## Troubleshooting

### Backend не подключается к БД
Проверьте, что PostgreSQL запущен и здоров:
```bash
docker-compose ps
docker-compose logs postgres
```

### Миграции не применяются
Выполните вручную:
```bash
docker-compose exec backend alembic upgrade head
```

### Frontend не видит API
Проверьте переменную окружения `VITE_API_URL` в `docker-compose.yml`

