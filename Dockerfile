# Start with a base Node.js image
FROM node:22-slim

# Set the working directory
WORKDIR /workspace

# Install the lightweight Chromium browser and its dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    chromium \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libgconf-2-4 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install only the Node.js dependencies, DO NOT download Puppeteer's browser
RUN npm install --production

# Copy the rest of your application code
COPY . .

# Command to run your application
CMD [ "npm", "start" ]
