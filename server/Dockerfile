FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.js ./
RUN mkdir -p /app/uploads
EXPOSE 3000
CMD ["node", "index.js"]
