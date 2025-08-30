FROM docker.1ms.run/node:18-alpine

# Install necessary build tools and dependencies
RUN apk add --no-cache \
    curl \
    python3 \
    make \
    g++ \
    git

# Install pnpm
RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN pnpm install

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 4000

RUN npm rebuild sqlite3

# Start application
CMD ["npm", "start"]