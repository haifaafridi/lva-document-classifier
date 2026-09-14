FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    TRANSFORMERS_CACHE=/app/.hf-cache

# Native runtime libraries used by ONNX Runtime / canvas / PDF rendering.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       libgomp1 \
       fontconfig \
       fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Bake the production BGE tokenizer/model into the image so a new Azure
# revision does not need to download it on its first request/startup.
RUN node scripts/prefetchDeploymentModel.js

EXPOSE 3000

CMD ["node", "server.js"]
