FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY netlify ./netlify
COPY server ./server
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server/index.mjs"]
