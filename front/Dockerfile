# Utiliza a imagem oficial do NGINX baseada em Alpine Linux.
# É extremamente leve (~15MB), segura e consome pouquíssima memória RAM (<10MB).
FROM nginx:alpine

# Copia os arquivos estáticos da nossa aplicação para o diretório padrão do NGINX
COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expõe a porta 80 (padrão HTTP)
EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
