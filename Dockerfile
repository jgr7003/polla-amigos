# Imagen de desarrollo para la app Next.js (polla-amigos)
FROM node:20-alpine

WORKDIR /app

# Instala dependencias primero para aprovechar la cache de capas
COPY package.json package-lock.json ./
RUN npm ci

# Copia el resto del código
COPY . .

EXPOSE 3000

# Servidor de desarrollo de Next.js con hot-reload
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]
