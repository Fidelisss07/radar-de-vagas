/**
 * Adaptador do Supabase.
 *
 * Fala com o PostgREST direto por `fetch`. Não precisa de biblioteca nem de
 * driver de Postgres — o projeto segue sem dependência, o que importa num
 * coletor que vai rodar agendado.
 *
 * A chave de serviço só existe no servidor. Ela ignora as políticas de
 * segurança da tabela, então nunca pode chegar ao navegador.
 */

import type { Rodada, Vaga } from '../tipos.ts';
import type { Filtros, Resumo } from './tipos.ts';

const URL_BASE = process.env.SUPABASE_URL ?? '';
const CHAVE = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

export function configurado(): boolean {
  return Boolean(URL_BASE && CHAVE);
}

function cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: CHAVE,
    Authorization: `Bearer ${CHAVE}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    ...init,
    headers: cabecalhos(init.headers as Record<string, string>),
    signal: AbortSignal.timeout(20_000),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    throw new Error(`Supabase respondeu ${resposta.status}: ${corpo.slice(0, 200)}`);
  }

  const texto = await resposta.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

/** O banco usa snake_case; o resto do código usa camelCase. */
function paraLinha(v: Vaga) {
  return {
    id: v.id, fonte: v.fonte, titulo: v.titulo, empresa: v.empresa, logo: v.logo,
    descricao: v.descricao, cidade: v.cidade, estado: v.estado, modelo: v.modelo,
    contrato: v.contrato, area: v.area, senioridade: v.senioridade,
    salario: v.salario, afirmativa: v.afirmativa,
    publicada_em: v.publicadaEm, prazo_ate: v.prazoAte, url: v.url, vista_em: v.vistaEm,
  };
}

function paraVaga(l: Record<string, unknown>): Vaga {
  return {
    id: Number(l.id), fonte: String(l.fonte), titulo: String(l.titulo),
    empresa: String(l.empresa), logo: (l.logo as string) ?? null,
    descricao: String(l.descricao ?? ''), cidade: (l.cidade as string) ?? null,
    estado: (l.estado as string) ?? null, modelo: l.modelo as Vaga['modelo'],
    contrato: l.contrato as Vaga['contrato'], area: String(l.area),
    senioridade: (l.senioridade as string) ?? null,
    salario: l.salario === null || l.salario === undefined ? null : Number(l.salario),
    afirmativa: Boolean(l.afirmativa), publicadaEm: String(l.publicada_em),
    prazoAte: (l.prazo_ate as string) ?? null, url: String(l.url),
    vistaEm: String(l.vista_em),
  };
}

/**
 * Grava um lote de uma vez.
 *
 * Uma chamada por vaga seria lenta demais: a rodada faz milhares. O upsert em
 * lote resolve tudo numa requisição por fatia.
 *
 * Para saber quantas eram novas, consulta antes quais ids já existem — a API
 * não devolve essa informação no upsert.
 */
export async function salvarLote(vagas: Vaga[]): Promise<{ novas: number; atualizadas: number }> {
  if (!vagas.length) return { novas: 0, atualizadas: 0 };

  const ids = vagas.map(v => v.id);
  const existentes = await rest<{ id: number }[]>(
    `vagas?select=id&id=in.(${ids.join(',')})`,
  );
  const conhecidos = new Set(existentes.map(l => Number(l.id)));

  await rest('vagas?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(vagas.map(paraLinha)),
  });

  const atualizadas = ids.filter(id => conhecidos.has(id)).length;
  return { novas: ids.length - atualizadas, atualizadas };
}

export async function abrirRodada(): Promise<number> {
  const [linha] = await rest<{ id: number }[]>('rodadas', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ inicio: new Date().toISOString() }]),
  });
  return linha.id;
}

export async function fecharRodada(
  id: number,
  r: Omit<Rodada, 'id' | 'inicio' | 'fim'>,
): Promise<void> {
  await rest(`rodadas?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      fim: new Date().toISOString(),
      fatias: r.fatias, encontradas: r.encontradas, novas: r.novas,
      atualizadas: r.atualizadas, erros: r.erros, observacao: r.observacao,
    }),
  });
}

export async function resumo(): Promise<Resumo> {
  // O PostgREST devolve a contagem no cabeçalho Content-Range quando pedimos
  // Prefer: count=exact, sem trazer as linhas
  const contar = async (filtro = ''): Promise<number> => {
    const resposta = await fetch(`${URL_BASE}/rest/v1/vagas?select=id${filtro}&limit=1`, {
      headers: cabecalhos({ Prefer: 'count=exact' }),
      signal: AbortSignal.timeout(20_000),
    });
    const faixa = resposta.headers.get('content-range') ?? '0/0';
    return Number(faixa.split('/')[1]) || 0;
  };

  const agrupar = async (coluna: string, valores: string[]) =>
    Promise.all(valores.map(async v => ({ chave: v, n: await contar(`&${coluna}=eq.${v}`) })));

  const [areas, contratos, modelos, total, rodadas] = await Promise.all([
    agrupar('area', ['tecnologia', 'comercial', 'saude', 'administrativo', 'logistica',
      'industria', 'educacao', 'financeiro', 'alimentacao', 'servicos', 'rh', 'marketing', 'geral']),
    agrupar('contrato', ['efetivo', 'estagio', 'aprendiz', 'temporario', 'pj', 'autonomo', 'outro']),
    agrupar('modelo', ['remoto', 'hibrido', 'presencial']),
    contar(),
    rest<Record<string, unknown>[]>('rodadas?select=*&order=id.desc&limit=5'),
  ]);

  const semZero = (l: { chave: string; n: number }[]) =>
    l.filter(x => x.n > 0).sort((a, b) => b.n - a.n);

  return {
    total,
    porArea: semZero(areas).map(l => ({ area: l.chave, n: l.n })),
    porContrato: semZero(contratos).map(l => ({ contrato: l.chave, n: l.n })),
    porModelo: semZero(modelos).map(l => ({ modelo: l.chave, n: l.n })),
    ultimasRodadas: rodadas.map(r => ({
      inicio: String(r.inicio), fim: (r.fim as string) ?? null,
      fatias: Number(r.fatias), encontradas: Number(r.encontradas),
      novas: Number(r.novas), atualizadas: Number(r.atualizadas),
      erros: Number(r.erros), observacao: (r.observacao as string) ?? null,
    })),
  };
}

export async function buscar(f: Filtros): Promise<Vaga[]> {
  const p: string[] = ['select=*', 'order=publicada_em.desc', `limit=${f.limite ?? 20}`];

  if (f.area)     p.push(`area=eq.${encodeURIComponent(f.area)}`);
  if (f.contrato) p.push(`contrato=eq.${encodeURIComponent(f.contrato)}`);
  if (f.modelo)   p.push(`modelo=eq.${encodeURIComponent(f.modelo)}`);
  if (f.cidade)   p.push(`cidade=ilike.*${encodeURIComponent(f.cidade)}*`);
  if (f.senioridade) p.push(`senioridade=eq.${encodeURIComponent(f.senioridade)}`);
  if (f.salarioMin)  p.push(`salario=gte.${f.salarioMin}`);
  if (f.termo)    p.push(`or=(titulo.ilike.*${encodeURIComponent(f.termo)}*,empresa.ilike.*${encodeURIComponent(f.termo)}*)`);
  if (f.dias) {
    const desde = new Date(Date.now() - f.dias * 86400000).toISOString();
    p.push(`publicada_em=gte.${desde}`);
  }

  const linhas = await rest<Record<string, unknown>[]>(`vagas?${p.join('&')}`);
  return linhas.map(paraVaga);
}
