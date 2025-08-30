# 使用node:18-alpine作为构建基础镜像
FROM docker.1ms.run/node:18-alpine AS builder

# 安装需要的工具
RUN apk add --no-cache curl
# 安装pnpm
RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm


# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖
RUN pnpm i

# 复制源代码
COPY . .

# 构建应用
RUN pnpm build

# 使用nginx作为生产服务器
FROM docker.1ms.run/nginx:alpine AS services

# 复制构建的文件到nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制nginx配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口 80（nginx内部监听80）
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]