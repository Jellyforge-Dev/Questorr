# Use Node 20 LTS (required for joi@18+)
FROM node:20-alpine

# Install su-exec for privilege dropping in entrypoint
RUN apk add --no-cache su-exec

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source
COPY . .

# Create non-root user and set ownership
RUN addgroup -S app && adduser -S -G app app && \
    chown -R app:app /usr/src/app && \
    chmod -R 755 /usr/src/app

EXPOSE 8282

# Docker metadata
LABEL org.opencontainers.image.title="Questorr" \
      org.opencontainers.image.description="A self-hosted Discord bot for Jellyfin media requests via Seerr" \
      org.opencontainers.image.url="https://github.com/Jellyforge-Dev/Questorr" \
      org.opencontainers.image.documentation="https://github.com/Jellyforge-Dev/Questorr/blob/main/README.md" \
      org.opencontainers.image.source="https://github.com/Jellyforge-Dev/Questorr" \
      org.opencontainers.image.version="2.2.0" \
      org.opencontainers.image.icon="https://raw.githubusercontent.com/Jellyforge-Dev/Questorr/main/assets/logo.png" \
      org.unraid.icon="https://raw.githubusercontent.com/Jellyforge-Dev/Questorr/main/assets/logo.png" \
      org.unraid.category="MediaServer:Other" \
      org.unraid.support="https://github.com/Jellyforge-Dev/Questorr/issues" \
      org.unraid.webui="http://[IP]:[PORT:8282]" \
      org.unraid.volume.config="/usr/src/app/config" \
      webui.port="8282" \
      webui.protocol="http"

# Production mode
ENV NODE_ENV=production

# Create config directory for persistent storage
RUN mkdir -p /usr/src/app/config && chown app:app /usr/src/app/config
VOLUME ["/usr/src/app/config"]

# Entrypoint fixes mounted volume permissions then drops to non-root user
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "app.js"]
