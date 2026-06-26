FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S fixit -u 1001
RUN chown -R fixit:nodejs /app
USER fixit

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "src/server.js"]
