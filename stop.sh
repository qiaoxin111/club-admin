#!/bin/bash

echo "正在停止Club Admin服务..."

# 停止并删除容器
docker-compose down

echo "服务已停止！"