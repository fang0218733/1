FROM node:24-bookworm-slim
WORKDIR /app
COPY miniprogram/data ./miniprogram/data
COPY server ./server
RUN mkdir -p /data/media && chown -R node:node /data
USER node
ENV NODE_ENV=production DATA_DIR=/data MEDIA_DIR=/data/media PORT=8080
EXPOSE 8080
CMD ["node", "server/index.cjs"]
