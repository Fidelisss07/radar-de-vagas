-- ============================================================================
-- Radar de Vagas — esquema do Supabase
--
-- Cole isto no SQL Editor do painel do Supabase e execute uma vez.
-- Roda mais de uma vez sem estragar nada: tudo é "if not exists".
-- ============================================================================

create table if not exists vagas (
  id            bigint primary key,
  fonte         text        not null default 'gupy',
  titulo        text        not null,
  empresa       text        not null,
  logo          text,
  descricao     text        not null default '',
  cidade        text,
  estado        text,
  modelo        text        not null,
  contrato      text        not null,
  area          text        not null,
  afirmativa    boolean     not null default false,
  publicada_em  timestamptz not null,
  prazo_ate     timestamptz,
  url           text        not null,
  vista_em      timestamptz not null default now()
);

-- Os índices seguem os filtros que a busca oferece. Sem eles, cada consulta
-- varre a tabela inteira assim que ela passar de algumas dezenas de milhares.
create index if not exists idx_vagas_area      on vagas (area);
create index if not exists idx_vagas_contrato  on vagas (contrato);
create index if not exists idx_vagas_modelo    on vagas (modelo);
create index if not exists idx_vagas_cidade    on vagas (cidade);
create index if not exists idx_vagas_publicada on vagas (publicada_em desc);

-- Busca textual em português: trata acento e plural, então "desenvolvedor"
-- encontra "Desenvolvedora" e "análise" encontra "analise".
create index if not exists idx_vagas_busca on vagas
  using gin (to_tsvector('portuguese', titulo || ' ' || empresa));

-- Registro de cada rodada de coleta. É o que diz se o coletor está de pé.
create table if not exists rodadas (
  id           bigserial primary key,
  inicio       timestamptz not null default now(),
  fim          timestamptz,
  fatias       integer     not null default 0,
  encontradas  integer     not null default 0,
  novas        integer     not null default 0,
  atualizadas  integer     not null default 0,
  erros        integer     not null default 0,
  observacao   text
);

create index if not exists idx_rodadas_inicio on rodadas (inicio desc);

-- ============================================================================
-- Segurança
--
-- Vaga de emprego é informação pública e o site precisa ler sem login. Então
-- leitura é liberada para todo mundo e escrita fica só para a chave de serviço,
-- que vive no servidor e nunca chega ao navegador.
-- ============================================================================

alter table vagas   enable row level security;
alter table rodadas enable row level security;

drop policy if exists "leitura publica de vagas" on vagas;
create policy "leitura publica de vagas"
  on vagas for select
  to anon, authenticated
  using (true);

drop policy if exists "leitura publica de rodadas" on rodadas;
create policy "leitura publica de rodadas"
  on rodadas for select
  to anon, authenticated
  using (true);

-- Nenhuma política de insert/update para anon: sem chave de serviço, ninguém
-- escreve. A chave de serviço ignora RLS por definição.
