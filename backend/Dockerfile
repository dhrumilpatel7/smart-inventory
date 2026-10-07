# Multi-runtime container: Node.js 20 + Python 3 for Scikit-Learn ML
FROM node:20-slim

# Install Python 3 and build tools for pandas / scikit-learn
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Install Python ML requirements
COPY ml/requirements.txt ./ml/
RUN pip3 install --no-cache-dir --break-system-packages -r ml/requirements.txt || pip3 install --no-cache-dir -r ml/requirements.txt

# Copy source code and dataset files
COPY . .
COPY ../data /data

ENV PORT=5000
ENV NODE_ENV=production
ENV PYTHON_PATH=python3

EXPOSE 5000

CMD ["node", "server.js"]
