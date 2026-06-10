# Ditherland — site estático servido por nginx sem root (least privilege)
FROM nginxinc/nginx-unprivileged:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/

# a base já é unprivileged (uid 101); explícito para documentar e satisfazer scanners
USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:8080/ || exit 1
