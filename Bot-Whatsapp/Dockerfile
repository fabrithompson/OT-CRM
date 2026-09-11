# bookworm (Debian 12), no bullseye: Debian 11 salio de soporte y fue movido a
# archive.debian.org. Con bullseye el build se caia SIEMPRE en el primer RUN,
# en dos pasos:
#   1) `apt-get update` -> exit 100, "Release file for bullseye-security is expired".
#   2) aun tolerando eso (Acquire::Check-Valid-Until=false), `apt-get install`
#      cortaba igual con 404 Not Found: los .deb de bullseye-security ya no
#      existen en deb.debian.org.
# bookworm tiene soporte vigente, asi que apt funciona sin flags ni workarounds.
# Los 5 paquetes de abajo existen en bookworm; ffmpeg pasa de 4.3 a 5.x, sin
# impacto para el bot (solo usa libopus/-application voip/-f ogg en
# convertToOggOpus, flags estables entre ambas versiones).
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y \
    git \
    dumb-init \
    procps \
    curl \
    ffmpeg \
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
