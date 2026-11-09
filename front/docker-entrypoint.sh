#!/bin/sh
set -e

envsubst '$API_BASE_URL $AUTH_ENABLED' \
  < /usr/share/nginx/html/config.js.template \
  > /usr/share/nginx/html/config.js

SNIPPET=/etc/nginx/snippets/sqlformys-basic-auth.conf
mkdir -p /etc/nginx/snippets

htpasswd_file="${NGINX_BASIC_AUTH_HTPASSWD_FILE:-/etc/nginx/secrets/htpasswd}"

basic_enabled=$(printf '%s' "${NGINX_BASIC_AUTH_ENABLED:-false}" | tr '[:upper:]' '[:lower:]')
case "$basic_enabled" in
  true|s|1|sim|yes|y)
    if [ -d "$htpasswd_file" ]; then
      echo "ERRO: NGINX_BASIC_AUTH_HTPASSWD_HOST_PATH deve ser um arquivo htpasswd, não um diretório." >&2
      echo "Remova a pasta no host e crie o arquivo, por exemplo: htpasswd -bc ./htpasswd seu.usuario" >&2
      exit 1
    fi
    if [ ! -s "$htpasswd_file" ]; then
      echo "ERRO: NGINX_BASIC_AUTH_ENABLED=true, mas \"$htpasswd_file\" está ausente ou vazio." >&2
      echo "Defina NGINX_BASIC_AUTH_HTPASSWD_HOST_PATH no host e monte em NGINX_BASIC_AUTH_HTPASSWD_FILE." >&2
      exit 1
    fi
    realm="${NGINX_BASIC_AUTH_REALM:-SQLFormys}"
    {
      printf 'auth_basic "%s";\n' "$realm"
      printf 'auth_basic_user_file %s;\n' "$htpasswd_file"
    } > "$SNIPPET"
    ;;
  *)
    printf '# SQLFormys: autenticação HTTP Basic desativada (NGINX_BASIC_AUTH_ENABLED=false)\n' > "$SNIPPET"
    ;;
esac

exec nginx -g 'daemon off;'
