# Etapa 1: build
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build && echo "✅ Build done" && ls -la /app/dist

# Etapa 2: producción
FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
 COPY --from=builder /app/node_modules ./node_modules
 COPY package*.json ./
RUN npm install --production

EXPOSE 8080

# Asegúrate de usar .js si aplica
CMD ["node", "dist/src/main"]