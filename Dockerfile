# Используем официальный Node.js образ
FROM node:20.15

# Устанавливаем рабочую директорию в контейнере
WORKDIR /app

# Копируем package.json и package-lock.json (если есть)
COPY package*.json ./

# Устанавливаем зависимости для бэкенда
RUN npm install

# Копируем остальные файлы проекта
COPY . .

# Устанавливаем зависимости и собираем фронтенд
WORKDIR /app/frontend
RUN npm install

# Возвращаемся в корневую директорию
WORKDIR /app
RUN npm run build
RUN mkdir -p /app/dist && cd /app/src && find . -name "*.proto" -exec cp --parents {} /app/dist \;

# Указываем порты, которые слушает приложение
 EXPOSE 3000
 EXPOSE 6000

# Указываем команду для запуска приложения
CMD ["npm", "run", "start"]