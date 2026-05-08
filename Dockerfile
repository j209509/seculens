# ---------- Build stage ----------
FROM mcr.microsoft.com/playwright:v1.59.1-jammy AS builder
WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Build (prisma generate runs via postinstall + next build)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# ---------- Runtime stage ----------
FROM mcr.microsoft.com/playwright:v1.59.1-jammy AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy standalone build
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma needs schema + generated client + CLI at runtime
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# package.json for script execution
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Apply migrations then start server
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node server.js"]
