FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv libglib2.0-0 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY scripts/requirements-private-mockup.txt /tmp/requirements.txt
RUN python3 -m venv /opt/psd && /opt/psd/bin/pip install --no-cache-dir -r /tmp/requirements.txt
COPY worker/ ./worker/
COPY shared/ ./shared/
COPY scripts/prepare-private-tin-can.py ./scripts/prepare-private-tin-can.py
RUN mkdir -p /data && chown node:node /data
USER node
ENV PSD_PYTHON=/opt/psd/bin/python PSD_DATA_DIR=/data PSD_HOST=0.0.0.0 PSD_PORT=3002
EXPOSE 3002
CMD ["node", "worker/server.mjs"]
