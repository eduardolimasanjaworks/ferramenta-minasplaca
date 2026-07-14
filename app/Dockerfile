FROM node:20-bookworm-slim AS crm-build
WORKDIR /crm
COPY vendor/crm-techfala/package.json vendor/crm-techfala/package-lock.json* ./
RUN npm install
COPY vendor/crm-techfala/ ./
RUN npm run build

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public
COPY --from=crm-build /crm/dist ./public/crm
EXPOSE 8095
CMD ["node", "dist/index.js"]
