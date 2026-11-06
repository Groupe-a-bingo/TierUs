FROM node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# The env check only needs well-formed placeholders at build time; real values come from .env at runtime.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-secret-0123456789 \
    BETTER_AUTH_URL=http://localhost:3010 \
    npm run build

ENV NODE_ENV=production
USER node
EXPOSE 3010
CMD ["npm", "start", "--", "-p", "3010"]
