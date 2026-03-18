# ── 1: Build React ──
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY Frontend/package*.json ./
RUN npm install
COPY Frontend/ ./
RUN npm run build

# ── 2: Build Java ──
FROM maven:3.9.6-eclipse-temurin-21 AS backend
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY Backend/src ./Backend/src
RUN mvn clean package -DskipTests

# ── 3: Runtime ──
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=backend /app/target/*.jar app.jar
COPY --from=frontend /app/frontend/dist ./static
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]