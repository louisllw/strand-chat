FROM node:25-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
WORKDIR /srv
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
RUN addgroup -S caddy && adduser -S caddy -G caddy \
  && mkdir -p /config/caddy /data/caddy \
  && chown -R caddy:caddy /config /data /srv /etc/caddy
USER caddy
