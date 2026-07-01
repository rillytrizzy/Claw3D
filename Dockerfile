# Claw3D - 3D agent visualization for OpenClaw.
# Multi-stage build: build Next.js -> run with the custom server (node 22 for
# camera-controls' engine requirement; runtime needs TS to load next.config.ts).

FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time gateway URL (overridden at runtime by CLAW3D_GATEWAY_URL).
ENV NEXT_PUBLIC_GATEWAY_URL=ws://127.0.0.1:18789
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built app + custom server + node_modules. Use the builder's full
# node_modules (incl. typescript) because the custom server loads next.config.ts
# at runtime and would otherwise try to auto-install TS via yarn.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["node", "server/index.js"]
