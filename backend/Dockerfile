FROM node:20-slim

# Install Python
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Install Python ML dependencies
COPY ml/requirements.txt ./ml/
RUN pip3 install --no-cache-dir --break-system-packages -r ml/requirements.txt

# Copy backend files
COPY . .

ENV PORT=5000
ENV NODE_ENV=production
ENV PYTHON_PATH=python3

EXPOSE 5000

CMD ["node", "server.js"]