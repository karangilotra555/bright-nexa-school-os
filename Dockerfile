# Bright Nexa School OS — Production Containerfile
FROM node:24-alpine

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY . .

# Create persistent data volume directory
RUN mkdir -p data

# Expose HTTP port
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Start production server
CMD ["node", "server.js"]
