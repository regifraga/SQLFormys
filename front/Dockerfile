# Utiliza a imagem oficial do NGINX baseada em Alpine Linux.
# É extremamente leve (~15MB), segura e consome pouquíssima memória RAM (<10MB).
FROM nginx:alpine

# Copia os arquivos estáticos da nossa aplicação para o diretório padrão do NGINX
COPY . /usr/share/nginx/html

# Expõe a porta 80 (padrão HTTP)
EXPOSE 80

# Substitui as variáveis de ambiente no config.js.template e gera o config.js na inicialização do container,
# permitindo que o NGINX sirva o arquivo com as variáveis injetadas dinamicamente em tempo de execução.
CMD ["/bin/sh", "-c", "envsubst < /usr/share/nginx/html/config.js.template > /usr/share/nginx/html/config.js && nginx -g 'daemon off;'"]
