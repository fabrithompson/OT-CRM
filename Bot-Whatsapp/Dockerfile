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
# Dos flags CLI necesarios — los settings equivalentes en package.json/.npmrc
# no se respetan en pnpm 11.x (bug conocido):
#
# 1. blockExoticSubdeps=false: Baileys depende de libsignal vía git-repo
#    (fork oficial de WhiskeySockets, no está en npm registry).
# 2. onlyBuiltDependencies='*': pnpm 10+ bloquea scripts de install de paquetes
#    nativos por defecto (anti supply-chain). baileys/protobufjs/sharp los
#    necesitan para compilar bindings nativos. El install falla con
#    ERR_PNPM_IGNORED_BUILDS si no pre-aprobamos acá; un approve-builds posterior
#    no llega a ejecutarse porque el install ya cortó con exit 1.
RUN pnpm install --frozen-lockfile --prod \
    --config.blockExoticSubdeps=false \
    --config.onlyBuiltDependencies='*'
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "index.js"]
