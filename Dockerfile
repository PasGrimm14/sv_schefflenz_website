# Wir nutzen ein leichtes Node-Image
FROM node:18-alpine

# Arbeitsverzeichnis im Container
WORKDIR /app

# Kopiere erst die package-Dateien (für besseres Caching)
COPY package*.json ./

# Installiere Abhängigkeiten
RUN npm install --production

# Kopiere den Rest des Codes
COPY . .

# Öffne den Port (intern im Container)
EXPOSE 3000

# Startbefehl
CMD ["node", "server.js"]