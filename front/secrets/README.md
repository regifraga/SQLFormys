# Credenciais do Nginx (HTTP Basic)

Não versione o arquivo `htpasswd` aqui. O caminho **no servidor** é configurável via
`NGINX_BASIC_AUTH_HTPASSWD_HOST_PATH` no `.env` (padrão: `./front/secrets/htpasswd`).

## Criar o primeiro usuário (no host)

### Opção A — só `openssl` (sem instalar pacotes)

Formato **APR1**, aceito pelo Nginx (`auth_basic_user_file`):

```bash
# Na raiz do projeto (caminho do .env: ./htpasswd)
read -rsp 'Senha: ' pass; echo
printf 'meu.usuario:%s\n' "$(openssl passwd -apr1 "$pass")" > ./htpasswd
chmod 600 ./htpasswd
```

Outro caminho, por exemplo `front/secrets/htpasswd`:

```bash
mkdir -p front/secrets
read -rsp 'Senha: ' pass; echo
printf 'meu.usuario:%s\n' "$(openssl passwd -apr1 "$pass")" > front/secrets/htpasswd
chmod 600 front/secrets/htpasswd
```

### Opção B — `htpasswd` (Debian/Ubuntu)

```bash
sudo apt install apache2-utils
mkdir -p front/secrets
htpasswd -bc front/secrets/htpasswd seu.usuario
```

Fora do projeto, por exemplo:

```bash
sudo mkdir -p /var/lib/sqlformys
sudo htpasswd -bc /var/lib/sqlformys/htpasswd seu.usuario
```

No `.env`:

```env
NGINX_BASIC_AUTH_HTPASSWD_HOST_PATH=/var/lib/sqlformys/htpasswd
```

Na raiz do projeto também pode ser `./htpasswd` (tem que ser **arquivo**, não pasta).
O Nginx exibe páginas `401.html` / `500.html` do design system quando o acesso falha ou o `htpasswd` está incorreto.

## Adicionar ou alterar usuários **sem reiniciar** o container

O Nginx relê o `htpasswd` a cada requisição autenticada. No host, edite o arquivo montado:

```bash
# novo usuário (não use -c, senão apaga os demais)
htpasswd -b /var/lib/sqlformys/htpasswd outro.usuario

# trocar senha
htpasswd -b /var/lib/sqlformys/htpasswd seu.usuario
```

Sem `htpasswd`, adicione outro usuário com `openssl` (acrescenta ao arquivo):

```bash
read -rsp 'Senha: ' pass; echo
printf 'outro.usuario:%s\n' "$(openssl passwd -apr1 "$pass")" >> ./htpasswd
```

Para **trocar senha** sem `htpasswd`, gere o hash e substitua a linha do usuário no arquivo:

```bash
read -rsp 'Nova senha: ' pass; echo
hash=$(openssl passwd -apr1 "$pass")
# edite ./htpasswd e troque a linha meu.usuario:... por:
printf 'meu.usuario:%s\n' "$hash"
```

Não é necessário `docker compose restart` só por causa de credenciais.

## Ativar no `.env`

```env
AUTH_ENABLED=false
API_BASE_URL=/api
NGINX_BASIC_AUTH_ENABLED=true
NGINX_BASIC_AUTH_REALM=SQLFormys
```

Na primeira vez com Basic ligado, suba ou recrie o `front` se o arquivo ainda não existir.
Depois disso, apenas mantenha o volume apontando para o `htpasswd` no host.
