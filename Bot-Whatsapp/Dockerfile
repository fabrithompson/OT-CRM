FROM node:22-bullseye-slim
RUN apt-get update && apt-get install -y \
    git \
    dumb-init \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

# corepack administra pnpm desde la versión declarada en packageManager
RUN corepack enable

WORKDIR /app
# Copiamos primero solo lo necesario para instalar dependencias. Crítico:
# scripts/ tiene que estar antes del install porque el preinstall hook
# (check-package-manager.js) lo lee y, si no existe, la instalación falla.
COPY package.json pnpm-lock.yaml .npmrc ./
COPY scripts ./scripts
# blockExoticSubdeps=false: Baileys depende de libsignal vía git-repo (fork
# oficial de WhiskeySockets, no está en npm registry). El flag CLI es la única
# forma confiable en pnpm 11.x — el setting de package.json/.npmrc no se respeta.
#
# Las aprobaciones de build scripts para @whiskeysockets/baileys, protobufjs y
# sharp viven en pnpm-lock.yaml (sección onlyBuiltDependencies a nivel raíz).
# Por eso ya podemos volver a --frozen-lockfile para builds reproducibles.
RUN pnpm install --frozen-lockfile --prod \
    --config.blockExoticSubdeps=false
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "index.js"]
