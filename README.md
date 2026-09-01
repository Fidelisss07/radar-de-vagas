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
  tipos.ts          formatos compartilhados
  dicionario.ts     as fatias: cargos por setor, cidades, contratos
  fontes/gupy.ts    cliente da API, com repetição e intervalo
  banco.ts          persistência e consultas
  coletor.ts        orquestra: fatia, normaliza, grava
  cli.ts            linha de comando
dados/              o banco (fora do versionamento)
```

## Próximas fases

- **2 — Busca e filtros.** Site em Next.js com os filtros e endereço compartilhável.
- **3 — Alerta.** Salvar um filtro e receber aviso quando entrar vaga nova.
- **4 — Números e fontes extras.** Painel público e APIs de vagas remotas internacionais.

## Licença

MIT
