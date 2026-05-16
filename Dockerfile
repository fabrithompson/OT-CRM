# ── 1: Build React con pnpm ──
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
# corepack viene con Node 22 y administra pnpm sin instalación global manual.
# La versión exacta sale del campo "packageManager" del package.json.
RUN corepack enable
# Copiamos primero los archivos necesarios para el install (incluye scripts/
# porque el preinstall hook lo necesita). Si solo copiáramos package*.json,
# el hook check-package-manager.js no se encontraría y npm/pnpm fallarían.
COPY Frontend/package.json Frontend/pnpm-lock.yaml Frontend/.npmrc ./
COPY Frontend/scripts ./scripts
RUN pnpm install --frozen-lockfile
COPY Frontend/ ./
RUN pnpm run build

# ── 2: Build Java ──
FROM maven:3.9.6-eclipse-temurin-21 AS backend
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY Backend/src ./Backend/src
RUN mvn clean package -DskipTests

# ── 3: Runtime ──
FROM eclipse-temurin:21-jre-alpine
# curl necesario para Docker health checks
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=backend /app/target/*.jar app.jar
COPY --from=frontend /app/frontend/dist ./static
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
