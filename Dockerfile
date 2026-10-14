# OGARNIO ESTATE: one container with the Next.js server, the inline job worker
# (campaigns, scheduled publications, statistics, retention), PNG/PDF rendering,
# Remotion video rendering (Chromium headless shell + ffmpeg) and poppler.
# Built and run by Railway (railway.json) or any Docker host.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# ffmpeg/ffprobe: video QA; poppler-utils: pdftotext/pdftoppm; the rest are the
# shared libraries Chromium headless shell needs (Remotion docs, Debian list).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates ffmpeg poppler-utils fontconfig fonts-dejavu-core \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 \
      libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
      libpango-1.0-0 libcairo2 libcups2 libdrm2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# NEXT_PUBLIC_* values are compiled into the browser bundle and the CSP header,
# so they must be present at build time (Railway passes service variables
# declared as ARG). They are public by design; secrets are never build args.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
      || (echo "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before building" && exit 1)
RUN npm run build
# Download Chromium headless shell into node_modules/.remotion at build time,
# so the first video render does not depend on a download.
RUN node -e "require('@remotion/renderer').ensureBrowser().then(()=>console.log('browser ready'))"

FROM base AS runtime
ENV NODE_ENV=production \
    JOB_WORKER=inline \
    STORAGE_DRIVER=supabase \
    AI_TEST_PROVIDER=0 \
    HOME=/home/node
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
# Migrations first (stops the start if one fails), then the server on $PORT.
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
