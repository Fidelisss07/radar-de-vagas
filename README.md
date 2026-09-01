# Radar de Vagas

Coleta vagas de emprego de fontes públicas e deixa filtrar por área, cidade, tipo
de contrato e modelo de trabalho. Foco principal em tecnologia, mas cobrindo todos
os setores — a base usada é de um ATS geral, com vagas de enfermagem a motorista.

**Estado:** fase 1 concluída — o coletor roda e o banco enche sozinho.

---

## Por que existe

Procurar estágio significa abrir seis sites por dia e reler as mesmas vagas. O
radar faz isso sozinho, de hora em hora, e guarda o que é novo.

## Como rodar

Precisa de **Node 22.6 ou mais novo**. Nenhuma dependência para instalar: o
projeto usa o TypeScript nativo e o SQLite que já vêm no Node.

```bash
node src/cli.ts coletar --fatias 8 --paginas 2   # coleta um pedaço
node src/cli.ts status                            # o que há no banco
node src/cli.ts buscar --modelo remoto --dias 7   # consulta
```

Sem `--fatias`, percorre o dicionário inteiro.

Filtros da busca: `--termo`, `--area`, `--contrato`, `--modelo`, `--cidade`,
`--senioridade`, `--salario` (mínimo), `--dias` e `--limite`.

## O que o coletor deduz do texto

A fonte não separa senioridade nem salário — os dois ficam soltos no título e no
meio da descrição. O coletor deduz os dois, e prefere não afirmar a afirmar
errado: quando não dá para saber, grava `null` e a busca trata como "não filtra".

| Campo | De onde sai | Cobertura medida |
| --- | --- | --- |
| `senioridade` | só do título — a descrição cita outras vagas do time e envenena o resultado | 65% das vagas |
| `salario` | valor precedido de palavra de remuneração; benefício é descartado | 6% das vagas |
| `afirmativa` | menção explícita de vaga exclusiva PcD, não o campo `disabilities` da fonte | 15% das vagas |

Dois desses recortes vieram de erro medido em dado real. O campo `disabilities`
da Gupy marcava 84% das vagas como afirmativas — ele quer dizer "aceita
candidatura", não "vaga exclusiva". E pegar o menor `R$` da descrição anunciava
"R$ 507" numa vaga de back-end pleno: era o vale-alimentação. Número errado é
pior que campo vazio, porque a pessoa descarta a vaga sem abrir.

## Coleta automática

O [workflow do GitHub Actions](.github/workflows/coletar.yml) roda a varredura
completa de 3 em 3 horas. Ele lê `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` dos
secrets do repositório e falha de propósito se faltarem — sem isso a coleta
cairia no SQLite do runner, que some quando a máquina desliga, e a rodada
ficaria verde sem ter gravado nada.

## Ligando no Supabase

O SQLite serve para desenvolver. Em produção quem responde é o Supabase, porque
a Vercel não hospeda arquivo de banco.

1. Crie um projeto em [supabase.com](https://supabase.com) (o plano gratuito
   dá conta com folga da escala inicial).
2. Abra o **SQL Editor** e execute o conteúdo de [`sql/001-esquema.sql`](sql/001-esquema.sql).
   Ele cria as tabelas, os índices e as políticas de segurança.
3. Copie `.env.example` para `.env` e preencha com a URL do projeto e as chaves,
   que ficam em **Project Settings → API**.

Feito isso, o mesmo comando passa a gravar lá:

```bash
node --env-file=.env src/cli.ts coletar --fatias 8
```

A CLI diz para onde está gravando logo na primeira linha, então não tem como
achar que subiu para produção e estar escrevendo no arquivo local.

### Por que sem biblioteca do Supabase

O Supabase expõe as tabelas por uma API REST. Falar com ela por `fetch` mantém o
projeto sem nenhuma dependência — o que importa num coletor que vai rodar
agendado, onde cada pacote a mais é uma coisa a mais para quebrar.

### O que a segurança do banco faz

Vaga de emprego é informação pública e o site precisa ler sem login, então a
leitura é liberada para qualquer um. Escrita exige a chave de serviço, que fica
no servidor e nunca chega ao navegador. Sem ela ninguém insere nada, mesmo
conhecendo o endereço do banco.

## As decisões que moldaram o código

### O teto de 10.000

A API trava o deslocamento em 10.000 e devolve no máximo 100 por página. É
impossível varrer as 80 mil vagas em sequência.

A saída é **fatiar**: muitas consultas estreitas, cada uma abaixo do teto. O
dicionário em `src/dicionario.ts` cruza cargos por setor com as maiores cidades e
com os contratos mais disputados. O banco junta tudo removendo repetição pelo
`id` da vaga.

Na primeira rodada real isso apareceu sozinho: as fatias `desenvolvedor` e
`desenvolvedora` devolveram 200 vagas cada, e a segunda gerou **zero** registros
novos. Sem deduplicação o banco teria 913 linhas onde existem 614 vagas.

### Educação com a fonte

O coletor espera 700ms entre chamadas, repete com espera crescente quando a fonte
responde 429 ou 5xx, desiste na hora em erro de consulta mal formada, e se
identifica no `User-Agent`. Um coletor que martela API alheia derruba o projeto.

### Só fontes que permitem

Só a Gupy por enquanto: o `robots.txt` do portal não bloqueia nada e a API é a
mesma que o site deles chama no navegador de quem visita.

Vagas.com e LinkedIn ficaram **de fora de propósito** — o primeiro bloqueia
agentes de IA por nome no `robots.txt`, o segundo proíbe acesso automatizado nos
termos de uso. Servem para busca pessoal, não para alimentar serviço com outros
usuários.

### Sem dependências

O Node 22.6+ executa TypeScript direto e traz SQLite embutido. Isso evita etapa
de build e árvore de dependências num projeto que vai rodar agendado.

Uma limitação surgiu daí: o Node **remove** tipos, não gera código, então
propriedade declarada no construtor, `enum` e `namespace` não passam. O código
evita as três.

## Estrutura

```
src/
  tipos.ts            formatos compartilhados
  dicionario.ts       as fatias: cargos por setor, cidades, contratos
  fontes/gupy.ts      cliente da API, com repetição e intervalo
  banco/
    index.ts          escolhe o adaptador conforme o ambiente
    sqlite.ts         desenvolvimento, sem servidor
    supabase.ts       produção, por REST
    tipos.ts          o contrato que os dois cumprem
  coletor.ts          orquestra: fatia, normaliza, grava
  cli.ts              linha de comando
sql/                  esquema para colar no Supabase
dados/                o banco local (fora do versionamento)
```

## Próximas fases

- **2 — Busca e filtros.** Site em Next.js com os filtros e endereço compartilhável.
- **3 — Alerta.** Salvar um filtro e receber aviso quando entrar vaga nova.
- **4 — Números e fontes extras.** Painel público e APIs de vagas remotas internacionais.

## Licença

MIT
