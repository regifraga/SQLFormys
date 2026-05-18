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

WORKDIR /app

# Instala dependências de timezone (opcional, útil para logs)
RUN apk --no-cache add tzdata

# Copia o binário compilado da etapa de build
COPY --from=builder /app/sqlformys-api .
# Copia as pastas de queries que são lidas em tempo de execução
COPY --from=builder /app/queries ./queries

# Porta padrão
EXPOSE 8080

# Executa a API
CMD ["./sqlformys-api"]
