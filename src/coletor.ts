/**
 * O coletor.
 *
 * Percorre as fatias, normaliza o que a fonte devolve e grava. Uma fatia que
 * falha não derruba a rodada: conta o erro e segue, porque fonte externa cai e
 * a coleta precisa sobreviver a isso.
 */

import { varrerFatia } from './fontes/gupy.ts';
import { montarFatias, adivinharArea } from './dicionario.ts';
import { abrirRodada, fecharRodada, salvarLote } from './banco/index.ts';
import type { Contrato, Fatia, Modelo, Vaga, VagaBruta } from './tipos.ts';

const CONTRATOS: Record<string, Contrato> = {
  vacancy_type_effective: 'efetivo',
  vacancy_type_internship: 'estagio',
  vacancy_type_apprentice: 'aprendiz',
  vacancy_type_temporary: 'temporario',
  vacancy_type_autonomous: 'autonomo',
  vacancy_legal_entity: 'pj',
};

const MODELOS: Record<string, Modelo> = {
  remote: 'remoto',
  hybrid: 'hibrido',
  'on-site': 'presencial',
};

/** Tira marcação e entidades da descrição, que vem com HTML solto no meio. */
function limparTexto(bruto: string): string {
  return (bruto ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Converte o que a fonte devolve no que a gente guarda. */
export function normalizar(b: VagaBruta, fatia: Fatia): Vaga {
  const area = fatia.area !== 'geral' ? fatia.area : adivinharArea(b.name);

  return {
    id: b.id,
    fonte: 'gupy',
    titulo: (b.name ?? '').trim(),
    empresa: (b.careerPageName ?? '').trim() || 'Confidencial',
    logo: b.careerPageLogo || null,
    // 4000 caracteres cobrem a descrição inteira na quase totalidade dos casos
    descricao: limparTexto(b.description).slice(0, 4000),
    cidade: b.city?.trim() || null,
    estado: b.state?.trim() || null,
    modelo: MODELOS[b.workplaceType] ?? (b.isRemoteWork ? 'remoto' : 'presencial'),
    contrato: CONTRATOS[b.type] ?? 'outro',
    area,
    afirmativa: Boolean(b.disabilities),
    publicadaEm: b.publishedDate,
    prazoAte: b.applicationDeadline ?? null,
    url: b.jobUrl,
    vistaEm: new Date().toISOString(),
  };
}

export interface Opcoes {
  /** Quantas fatias percorrer nesta rodada. Sem valor, percorre todas. */
  limiteFatias?: number;
  /** Páginas por fatia. Mais páginas significa mais cobertura e mais tempo. */
  paginasPorFatia?: number;
  /** Chamado a cada fatia concluída, para a CLI mostrar andamento. */
  aoProgredir?: (info: {
    indice: number; total: number; fatia: Fatia;
    encontradas: number; novas: number; erro?: string;
  }) => void;
}

export async function coletar(opcoes: Opcoes = {}) {
  const todas = montarFatias();
  const fatias = opcoes.limiteFatias ? todas.slice(0, opcoes.limiteFatias) : todas;
  const paginas = opcoes.paginasPorFatia ?? 3;

  const rodada = await abrirRodada();
  let encontradas = 0, novas = 0, atualizadas = 0, erros = 0;

  for (const [indice, fatia] of fatias.entries()) {
    try {
      const { vagas } = await varrerFatia(fatia, paginas);

      // Grava em lote: uma chamada por vaga seria lenta demais no Supabase,
      // onde cada gravação é uma requisição de rede
      const gravadas = await salvarLote(vagas.map(b => normalizar(b, fatia)));
      novas += gravadas.novas;
      atualizadas += gravadas.atualizadas;
      const novasAqui = gravadas.novas;

      encontradas += vagas.length;
      opcoes.aoProgredir?.({
        indice: indice + 1, total: fatias.length, fatia,
        encontradas: vagas.length, novas: novasAqui,
      });
    } catch (erro) {
      erros++;
      opcoes.aoProgredir?.({
        indice: indice + 1, total: fatias.length, fatia,
        encontradas: 0, novas: 0,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  const resultado = {
    fatias: fatias.length, encontradas, novas, atualizadas, erros,
    observacao: erros ? `${erros} fatia(s) falharam` : null,
  };

  await fecharRodada(rodada, resultado);
  return resultado;
}
