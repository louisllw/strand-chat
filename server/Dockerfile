FROM node:25-alpine
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
RUN mkdir -p dist/db/migrations && cp -r db/migrations/*.sql dist/db/migrations/
RUN npm prune --omit=dev
ENV NODE_ENV=production
RUN mkdir -p /data && chmod 777 /data
RUN addgroup -S app && adduser -S app -G app
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
RUN chown -R app:app /app /entrypoint.sh
USER app
EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "start"]
