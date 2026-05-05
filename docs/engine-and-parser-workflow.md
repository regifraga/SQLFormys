#Sim, vamos começar o planejamento do motor, mas tem alguns detalhes:

## Wrokflow para o motor de execução de consultas SQL

Este motor vai receber uma string SQL e retornar outra string SQL, com as seguintes características:

- Vai substituir os metadados (tags) por valores
- Vai remover comentários **importante** apenas os que estiverem entre `--` e `--</PROPERTIES>` (e `--</PROPERTIES>` e `--SELECT`)
- Vai retornar apenas o SQL

Nem **tudo** precisará ser "descoberto" pelo motor, os arquivos .sql já contam com metadados, olha este exemplo o arquivo `SQLFormys/back/queries/IMS Arquivos/Consulta de Arquivo.sql`

Observe que tem valores como:

- `--SERVER`
- `--<PROPERTIES>`
- `--</PROPERTIES>`
- `--SELECT`

O que estes fazem:

- `--SERVER`: informa o host do SQL Server (desta forma o motor poderá se conectar diretamente à instância do SQL Server e executar os scripts) (não é obrigatório, se não tiver o motor vai usar o padrão definido na configuração global)
- `--<PROPERTIES>`: que vai iniciar uma `área` contendo campos que serão os metadados para renderizar os controles na tela
- `--</PROPERTIES>`: fim da área com as definições dos campos dinâmicos
-  `--SELECT`: comando do próprio SQL Server para atribuir valor a uma variável detalhes do campo a ser renderizado, separados por `:` seguindo o padrão que será explicado a seguir

O metadado contido na área `--SELECT` é composto por:

Aqui a primeira definição que foi feita foi o operador "= :" o operador  "=" aqui é um comando SQL e o ":" indica que o que vem a seguir é o texto do label. No caso do campo "DT_INICIAL" a definição ficou assim: `@?#DT_INICIAL:DATE:8:=:Data Inicial` , onde:

Por exemplo:

@?#DT_INICIAL:DATE:8:=:Data Inicial

Onde:

- `@`: caractar especial no SQL Server para indicar que é uma variável
- `?`: o valor para este deverá ser "perguntado"  ao usuário, ou seja, é um compo a ser renderizado na tela do client
- `#`: indica que está campo é **obrigatório**. Desta forma o client sevberá que ele **tem** que ser preenchido
- `DT_INICIAL`: nome da variável no SQL Server e que será usado posteriormente em algum momento no script SQL
- `DATE`: o tipo de dado, assim o Frontend saberá qual tipo de controle renderizar na tela no client
- `8`: tamanho do campo na tela no client
- `=`: operado do SQL (por exemplo: `+`, `<`, `>`, `LIKE` e etc)
- `Data Inicial`: texto para o campo na tela (label)

No arquivo `SQLFormys/back/queries/IMS Arquivos/Consulta Identificador de Layout.sql`, temos outro exemplo de uso. Veja que neste a "área" (ou seção "<PROPERTIES>") ficou na clausula WHERE da query. Isso mostra que o motor tem que ser bem flexivel já que o desenvolvedor poderá colocar isso em vários pontos no arquivo .sql

Mais um exemoplo similar a este último é o `SQLFormys/back/queries/IMS Marketplace/Consulta de Produtos.sql` ou `SQLFormys/back/queries/IMS Marketplace/Consulta de Remetentes Emptor.sql`, a área de propriedades foi mais uma vez utilizado no WHERE.

Como funciona (fluxo):

- Front solcita a lista de projetos (/api/projects), a API ver em sua configuração qual é a pasta dos projetos, no nosso caso aqui em `SQLFormys/back/queries`
- Para **cada** sub-pasta em, por exemplo aqui, "queries", é considerado como um projeto
- Cada "projeto" tem seus "módulos", qua na verdade são os arquivos .sql da pasta em questão
- O Front gera uma lista como

Projetos
├── IMS Arquivos
│   ├── Consulta de Arquivo
│   └── Consulta Identificador de Layout
├── IMS Clientes
│   ├── Consulta de Pessoa Juridica
│   ├── Consulta do cadastro de clientes (Gestor-Marketplace)
│   └── Criar Papel Participante

Como podemos ver, o "módulo" é **exatamente** o mesmo nome do arquivo, mas sem a extensão. 

Usuário clica neste, por exemplo `Consulta de Arquivo` e (o client/frontend) envia para a API `GET "/query/IMS Arquivos/Consulta de Arquivo"`

Como foi um GET a API retorna um JSON contendo os metadados definidos em `<PROPERTIES>` (no arquivo correpondente), ou seja, nome do campo, label, se obrigatório, tipo e etc.

O Client então com esta info, vai renderizar o Form com estes campos/dados e ao clicar em `Executar`, será feito um POST para o mesmo endpoint "query/IMS Arquivos/Consulta de Arquivo". Por exemplo:

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
  },
  {
    "field": "NM_ARQUIVO",
    "type": "VARCHAR",
    "label": "Nome do Arquivo",
    "size": 100,
    "required": false,
    "defaultValue": ""
  },
  {
    "field": "CD_REMETENTE",
    "type": "INT",
    "label": "Remetente",
    "size": 8,
    "required": false,
    "defaultValue": ""
  },
  {
    "field": "CD_GERACAO_ARQUIVO",
    "type": "INT",
    "label": "Geração do Arquivo",
    "size": 10,
    "required": false,
    "defaultValue": ""
  }	
]
```

Como é um POST a API "sabe" que agora vai **ter** que ler o arquivo correpondente, atribuir os valores que recebeu de **cada campo** e executar a quary removendo os comentários `--`. Por exemplo o arquivo "Consulta de Arquivo.sql":

Conteúso original antes do motor de execução processar:

```sql
--SERVER=10.123.43.126
DECLARE @NM_ARQUIVO   			VARCHAR(100),
        @DT_INICIAL   			VARCHAR(8),
        @DT_FINAL     			VARCHAR(8),
        @CD_REMETENTE 			INT,
				@CD_GERACAO_ARQUIVO INT,
				@STRSQL						  VARCHAR(8000),
				@STRSQL_WHERE			  VARCHAR(400)

SELECT @CD_REMETENTE = 0,
       @NM_ARQUIVO   = '',
			 @STRSQL_WHERE = '',
			 @CD_GERACAO_ARQUIVO = 0

--<PROPERTIES>
--SELECT @?#DT_INICIAL:DATE:8:=:Data Inicial
--SELECT @?#DT_FINAL:DATE:8:=:Data Final
--SELECT @?NM_ARQUIVO:VARCHAR:100:=:Nome do Arquivo
--SELECT @?CD_REMETENTE:INT:8:=:Remetente
--SELECT @?CD_GERACAO_ARQUIVO:INT:10:=:CD_GERACAO_ARQUIVO (LOADEDFILE_ID)
--</PROPERTIES>

	SELECT @STRSQL =  'SELECT A.CD_LOTE                                AS [Lote],
 										        A.NM_LOTE                                AS [Arquivo Enviado],
										        A.DT_CHEGADA_LOTE                        AS [Dt Captura],
										        A.NR_TAMANHO_LOTE                        AS [Tamanho Enviado],
										        D.CD_REMETENTE                           AS [Cd Remetente],
										        D.NM_REMETENTE                           AS [Remetente],
...
```

---

Após o motor de execução processar e antes de qexecutar a nova query gerada:

```sql
DECLARE @NM_ARQUIVO   			VARCHAR(100),
        @DT_INICIAL   			VARCHAR(8),
        @DT_FINAL     			VARCHAR(8),
        @CD_REMETENTE 			INT,
				@CD_GERACAO_ARQUIVO INT,
				@STRSQL						  VARCHAR(8000),
				@STRSQL_WHERE			  VARCHAR(400)

SELECT @CD_REMETENTE = 0,
       @NM_ARQUIVO   = '',
			 @STRSQL_WHERE = '',
			 @CD_GERACAO_ARQUIVO = 0

SELECT @DT_INICIAL='2026-04-01'
SELECT @DT_FINAL='2026-04-05'
SELECT @NM_ARQUIVO='valotes.txt'
SELECT @CD_REMETENTE=144
SELECT @CD_GERACAO_ARQUIVO=321

	SELECT @STRSQL =  'SELECT A.CD_LOTE                                AS [Lote],
 										        A.NM_LOTE                                AS [Arquivo Enviado],
										        A.DT_CHEGADA_LOTE                        AS [Dt Captura],
										        A.NR_TAMANHO_LOTE                        AS [Tamanho Enviado],
										        D.CD_REMETENTE                           AS [Cd Remetente],
										        D.NM_REMETENTE                           AS [Remetente],
...
```

---

O motor recebe então o SQL com os valores atribuídos e executa a query. O resultado (um Json) é enviado para o Client, que vai renderizar os dados.

Por exemplo, se o arquivo "Consulta de Arquivo.sql" for executado conforme o exemplo acima, o resultado será:

```json
[
  {
    "Cd_Lote": 1,
    "Arquivo Enviado": "Arquivo 1",
    "Dt Captura": "2026-04-01",
    "Tamanho Enviado": 100,
    "Cd Remetente": 1,
    "Remetente": "Remetente 1"
  },
  {
    "Cd_Lote": 2,
    "Arquivo Enviado": "Arquivo 2",
    "Dt Captura": "2026-04-02",
    "Tamanho Enviado": 200,
    "Cd Remetente": 2,
    "Remetente": "Remetente 2"
  }
]
```


O Client então com esta info, vai renderizar o Form com estes campos/dados e ao clicar em `Executar`, será feito um POST para o mesmo endpoint "query/IMS Arquivos/Consulta de Arquivo".

Como é um POST a API "sabe" que agora vai **ter** que ler o arquivo correpondente, atribuir os valores que recebeu de **cada campo** e executar a quary removendo os comentários `--`. Por exemplo o arquivo "Consulta de Arquivo.sql":

Conteúso original antes do motor de execução processar:

```sql
--SERVER=10.123.43.126
DECLARE @NM_ARQUIVO   			VARCHAR(100),
        @DT_INICIAL   			VARCHAR(8),
        @DT_FINAL     			VARCHAR(8),
        @CD_REMETENTE 			INT,
				@CD_GERACAO_ARQUIVO INT,
				@STRSQL						  VARCHAR(8000),
				@STRSQL_WHERE			  VARCHAR(400)

SELECT @CD_REMETENTE = 0,
       @NM_ARQUIVO   = '',
			 @STRSQL_WHERE = '',
			 @CD_GERACAO_ARQUIVO = 0

--<PROPERTIES>
--SELECT @?#DT_INICIAL:DATE:8:=:Data Inicial
--SELECT @?#DT_FINAL:DATE:8:=:Data Final
--SELECT @?NM_ARQUIVO:VARCHAR:100:=:Nome do Arquivo
--SELECT @?CD_REMETENTE:INT:8:=:Remetente
--SELECT @?CD_GERACAO_ARQUIVO:INT:10:=:CD_GERACAO_ARQUIVO (LOADEDFILE_ID)
--</PROPERTIES>

	SELECT @STRSQL =  'SELECT A.CD_LOTE							 AS [Lote],
 								        A.NM_LOTE						 AS [Arquivo Enviado],
								        A.DT_CHEGADA_LOTE                        AS [Dt Captura],
								        A.NR_TAMANHO_LOTE                        AS [Tamanho Enviado],
								        D.CD_REMETENTE                           AS [Cd Remetente],
								        D.NM_REMETENTE                           AS [Remetente],
...
```

---

Após o motor de execução processar e antes de qexecutar a nova query gerada:

```sql
DECLARE @NM_ARQUIVO   			VARCHAR(100),
        @DT_INICIAL   			VARCHAR(8),
        @DT_FINAL     			VARCHAR(8),
        @CD_REMETENTE 			INT,
				@CD_GERACAO_ARQUIVO INT,
				@STRSQL						  VARCHAR(8000),
				@STRSQL_WHERE			  VARCHAR(400)

SELECT @CD_REMETENTE = 0,
       @NM_ARQUIVO   = '',
			 @STRSQL_WHERE = '',
			 @CD_GERACAO_ARQUIVO = 0

SELECT @DT_INICIAL='2026-04-01'
SELECT @DT_FINAL='2026-04-05'
SELECT @NM_ARQUIVO='valotes.txt'
SELECT @CD_REMETENTE=144
SELECT @CD_GERACAO_ARQUIVO=321

	SELECT @STRSQL =  'SELECT A.CD_LOTE							 AS [Lote],
 								        A.NM_LOTE						 AS [Arquivo Enviado],
								        A.DT_CHEGADA_LOTE                        AS [Dt Captura],
								        A.NR_TAMANHO_LOTE                        AS [Tamanho Enviado],
								        D.CD_REMETENTE                           AS [Cd Remetente],
								        D.NM_REMETENTE                           AS [Remetente],
...
```

---

Então estas são as etapas:

1. Lista dos projetos pelo client (Frontend) - `GET "/query/IMS Arquivos/Consulta de Arquivo"`
    - A API lista todas as subpastas da pasta raiz ("queries" ou conforme Configuração .BasePath) e seus respetivos arquivos .sql (mas sem a extensão .sql). Considera cada arquivo como um módulo.
	- O retorno é um Json como:
```json
[
  {
    "project": "IMS Arquivos",
    "modules": ["Consulta de Arquivo", "Outro Módulo", "Mais um Módulo"]
  }
]
```

2. Usuário envia os dados para executar a Query (Frontend) - `POST "/query/IMS Arquivos/Consulta de Arquivo"`
    - A API recebe os dados, executa a query (usando o motor de execução sqlformsys) e retorna os dados em Json.
	- O retorno é um Json como (o retorno tem que ser de acordo com o **retorno** do SELECT do arquivo .sql):
```json
[
  {
    "Lote": 1,
    "Arquivo Enviado": "Arquivo 1",
    "Dt Captura": "2026-04-01",
    "Tamanho Enviado": 100,
    "Cd Remetente": 1,
    "Remetente": "Remetente 1"
  },
  {
    "Lote": 2,
    "Arquivo Enviado": "Arquivo 2",
    "Dt Captura": "2026-04-02",
    "Tamanho Enviado": 200,
    "Cd Remetente": 2,
    "Remetente": "Remetente 2"
  }
]
```
