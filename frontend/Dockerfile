# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Принимаем API URL как build-аргумент и пробрасываем в окружение,
# чтобы Vite подставил его в import.meta.env.VITE_API_URL во время сборки
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Копирование package файлов
COPY package*.json ./

# Установка зависимостей
RUN npm ci

# Копирование исходного кода
COPY . .

# Сборка приложения
RUN npm run build

# Stage 2: Production
FROM nginx:alpine

# Копирование собранного приложения
COPY --from=builder /app/dist /usr/share/nginx/html

# Копирование конфигурации nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

