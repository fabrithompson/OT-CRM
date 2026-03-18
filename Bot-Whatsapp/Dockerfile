FROM node:20-bullseye-slim
RUN apt-get update && apt-get install -y \
    git \
    dumb-init \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --production --unsafe-perm
COPY . .
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
USER root
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "index.js"]