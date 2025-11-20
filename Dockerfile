# --- Этап 1: сборка приложения ---
FROM node:22-alpine AS builder

WORKDIR /app

# Устанавливаем зависимости
COPY package*.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Копируем исходники и собираем NestJS
COPY . .
RUN pnpm run build

# Генерируем Prisma client
RUN npx prisma generate
RUN npx prisma db push

# --- Этап 2: минимальный runtime ---
FROM node:22-alpine AS runner

WORKDIR /app

# Копируем только нужное
COPY package*.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY .env .env

# Открываем порт NestJS
EXPOSE 8000

CMD ["node", "dist/main.js"]
