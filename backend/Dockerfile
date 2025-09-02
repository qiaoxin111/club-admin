FROM docker.1ms.run/node:20-alpine

RUN npm config set registry https://registry.npmmirror.com

# Install necessary build tools and dependencies
RUN apk add --no-cache \
    curl \
    python3 \
    make \
    g++ \
    git

RUN apk add --no-cache \
    py3-pip \
    py3-setuptools \
    py3-wheel

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --prod

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 4000

RUN npm rebuild sqlite3

# Start application
CMD ["npm", "start"]
