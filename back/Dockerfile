# Etapa de build
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Copia os arquivos de dependência e baixa
COPY go.mod ./
# Se houver go.sum no futuro, descomente a linha abaixo:
# COPY go.sum ./
RUN go mod download

# Copia o código-fonte
COPY . .

# Compila a aplicação
RUN CGO_ENABLED=0 GOOS=linux go build -o sqlformys-api ./cmd/api

# Etapa final de execução
FROM alpine:latest

ARG POWERSHELL_VERSION=7.4.6
ARG TARGETARCH

WORKDIR /app

# bash (.sh), tzdata e PowerShell 7 (.ps1) — tarball musl oficial da Microsoft
RUN apk --no-cache add bash python3 tzdata ca-certificates icu-libs krb5-libs libgcc libintl libssl3 libstdc++ zlib curl \
    && case "${TARGETARCH}" in \
         amd64) PS_MUSL=linux-musl-x64 ;; \
         arm64) PS_MUSL=linux-musl-arm64 ;; \
         *) PS_MUSL=linux-musl-x64 ;; \
       esac \
    && curl -fsSL -o /tmp/powershell.tar.gz \
         "https://github.com/PowerShell/PowerShell/releases/download/v${POWERSHELL_VERSION}/powershell-${POWERSHELL_VERSION}-${PS_MUSL}.tar.gz" \
    && mkdir -p /opt/microsoft/powershell/7 \
    && tar xzf /tmp/powershell.tar.gz -C /opt/microsoft/powershell/7 \
    && chmod +x /opt/microsoft/powershell/7/pwsh \
    && ln -sf /opt/microsoft/powershell/7/pwsh /usr/local/bin/pwsh \
    && rm /tmp/powershell.tar.gz

# Copia o binário compilado da etapa de build
COPY --from=builder /app/sqlformys-api .
# Copia as pastas de queries que são lidas em tempo de execução
COPY --from=builder /app/queries ./queries

# Porta padrão
EXPOSE 8080

# Executa a API
CMD ["./sqlformys-api"]
