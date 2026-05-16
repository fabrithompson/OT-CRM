FROM node:22-bullseye-slim
RUN apt-get update && apt-get install -y \
    git \
    dumb-init \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

# corepack administra pnpm — forzamos 9.15.4 porque pnpm 11.x ignora
# onlyBuiltDependencies del lockfile y rompe el build con ERR_PNPM_IGNORED_BUILDS.
# pnpm 9 no tiene ese bloqueo y corre los install scripts sin friction.
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app
# Copiamos primero solo lo necesario para instalar dependencias. Crítico:
# scripts/ tiene que estar antes del install porque el preinstall hook
# (check-package-manager.js) lo lee y, si no existe, la instalación falla.
COPY package.json pnpm-lock.yaml .npmrc ./
COPY scripts ./scripts
# pnpm 9.x no tiene los bloqueos anti-supply-chain de 10+ (blockExoticSubdeps
# y onlyBuiltDependencies), así que el install corre limpio sin flags extra.
RUN pnpm install --frozen-lockfile --prod
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "index.js"]
