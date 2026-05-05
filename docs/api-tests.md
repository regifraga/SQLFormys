# Guia de Testes da API (SQL Dynamic Engine)

Este documento contém os exemplos de requisições `cURL` para você testar os endpoints do motor dinâmico de execução de queries da aplicação **SQLFormys**.

> [!NOTE]
> Todos os testes assumem que o backend está rodando localmente na porta padrão `8080` (comando `go run cmd/api/main.go` a partir da pasta `back`). Lembre-se de utilizar a rota base `/api/queries/` (no plural).

---

## 1. Listar todos os Projetos e Módulos
Este endpoint varre a pasta física configurada (`back/queries`) e retorna todos os projetos e seus respectivos módulos (arquivos `.sql`).

**Requisição:**
```bash
curl -X GET http://localhost:8080/api/projects
```

**Retorno Esperado:**
```json
[
  {
    "project": "IMS Arquivos",
    "modules": [
      "Consulta Identificador de Layout",
      "Consulta de Arquivo"
    ]
  },
  {
    "project": "IMS Clientes",
    "modules": [
      "Consulta de Pessoa Juridica"
    ]
  }
]
```

---

## 2. Buscar os Metadados de uma Query (Formulário)
Este endpoint lê um arquivo `.sql` específico, extrai a seção `--<PROPERTIES>` e retorna um array de campos formatado para o Frontend renderizar o formulário dinamicamente.

**Requisição:**
```bash
# Nota: Lembre-se de usar URL Encode para espaços (%20)
curl -X GET "http://localhost:8080/api/queries/IMS%20Arquivos/Consulta%20de%20Arquivo"
```

**Retorno Esperado:**
```json
[
  {
    "field": "DT_INICIAL",
    "type": "DATE",
    "label": "Data Inicial",
    "size": 8,
    "required": true,
    "defaultValue": ""
  },
  {
    "field": "DT_FINAL",
    "type": "DATE",
    "label": "Data Final",
    "size": 8,
    "required": true,
    "defaultValue": ""
  }
]
```

---

## 3. Executar a Query com Injeção de Variáveis
Este endpoint recebe os valores preenchidos no formulário pelo usuário, injeta nas variáveis do SQL e executa no Banco de Dados (usando a string de conexão informada na tag `--SERVER=` ou a default configurada no Docker).

**Requisição:**
```bash
curl -X POST "http://localhost:8080/api/queries/IMS%20Arquivos/Consulta%20de%20Arquivo" \
     -H "Content-Type: application/json" \
     -d '{
           "DT_INICIAL": "2026-04-01",
           "DT_FINAL": "2026-04-05",
           "NM_ARQUIVO": "valotes.txt",
           "CD_REMETENTE": 144
         }'
```

**Retorno Esperado:**
*Nota: Se o banco de dados definido na tag `--SERVER` (ex: `10.123.43.126`) estiver inacessível a partir do ambiente de testes local, a chamada retornará um Status Code 500 informando o timeout de conexão, comprovando o correto funcionamento do redirecionamento dinâmico do Server.*

```json
[
  {
    "Lote": 1,
    "Arquivo Enviado": "valotes.txt",
    "Dt Captura": "2026-04-01",
    "Tamanho Enviado": 100,
    "Cd Remetente": 144,
    "Remetente": "Remetente Exemplo"
  }
]
```
