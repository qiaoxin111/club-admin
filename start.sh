#!/bin/bash

echo "正在构建并启动Club Admin服务..."

# 构建并启动服务
docker-compose up --build -d

echo "服务启动完成！"
echo "前端访问地址: http://localhost"
echo "后端API地址: http://localhost:3001"
echo ""
echo "查看服务状态: docker-compose ps"
echo "查看日志: docker-compose logs -f"
echo "停止服务: docker-compose down"