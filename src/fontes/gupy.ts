/**
 * Cliente da API pública de vagas da Gupy.
 *
 * É o mesmo endereço que o portal deles chama no navegador de quem visita, e o
 * robots.txt do portal não bloqueia nada. Ainda assim o cliente é educado por
 * padrão: intervalo entre chamadas, repetição com espera crescente e teto de
 * requisições por rodada. Um coletor que martela API alheia derruba o projeto.
 *
 * Limites descobertos por sondagem:
 *   - deslocamento máximo: 10.000 (acima disso a API responde 400)
 *   - itens por página: 100 (pedir mais devolve vazio)
 */

import type { Fatia, VagaBruta } from '../tipos.ts';

const BASE = 'https://employability-portal.gupy.io/api/v1/jobs';

export const LIMITE_PAGINA = 100;
export const TETO_DESLOCAMENTO = 10_000;

/** Espera entre chamadas, em milissegundos. */
const INTERVALO = 700;
/** Quantas vezes insistir quando a chamada falhar. */
const TENTATIVAS = 3;

const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface Resposta {
  vagas: VagaBruta[];
  total: number;
}

export class ErroFonte extends Error {
  // Declarado no corpo, e não como propriedade do construtor: o Node só remove
  // tipos, não gera código, então `constructor(readonly status)` não passa.
  status?: number;

  constructor(mensagem: string, status?: number) {
    super(mensagem);
    this.name = 'ErroFonte';
    this.status = status;
  }
}

/** Monta o endereço de uma consulta. */
function montarUrl(fatia: Fatia, deslocamento: number): string {
  const p = new URLSearchParams();
  if (fatia.termo) p.set('jobName', fatia.termo);
  if (fatia.cidade) p.set('city', fatia.cidade);
  if (fatia.contrato) p.set('type', fatia.contrato);
  p.set('limit', String(LIMITE_PAGINA));
  p.set('offset', String(deslocamento));
  return `${BASE}?${p}`;
}

/** Uma página, com repetição em caso de falha. */
async function buscarPagina(fatia: Fatia, deslocamento: number): Promise<Resposta> {
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const resposta = await fetch(montarUrl(fatia, deslocamento), {
        headers: {
          Accept: 'application/json',
          // Identificação honesta: quem recebe a chamada sabe quem está chamando
          'User-Agent': 'radar-de-vagas/0.1 (coletor de vagas publicas)',
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (resposta.status === 429 || resposta.status >= 500) {
        // A fonte pediu calma ou está instável: espera mais a cada tentativa
        throw new ErroFonte(`fonte respondeu ${resposta.status}`, resposta.status);
      }

      if (!resposta.ok) {
        // 400 e afins não melhoram com repetição
        throw new ErroFonte(`consulta recusada (${resposta.status})`, resposta.status);
      }

      const dados = await resposta.json() as { data?: VagaBruta[]; pagination?: { total?: number } };
      return {
        vagas: dados.data ?? [],
        total: dados.pagination?.total ?? 0,
      };
    } catch (erro) {
      ultimoErro = erro;
      const status = erro instanceof ErroFonte ? erro.status : undefined;

      // Erro de consulta mal formada não adianta repetir
      if (status && status >= 400 && status < 500 && status !== 429) break;

      if (tentativa < TENTATIVAS) await espera(INTERVALO * 2 ** tentativa);
    }
  }

  throw ultimoErro instanceof Error ? ultimoErro : new ErroFonte('falha desconhecida');
}

/**
 * Varre uma fatia inteira, paginando até acabar ou bater o teto.
 *
 * `maxPaginas` limita o gasto por fatia: sem isso, uma consulta larga como
 * "desenvolvedor" gastaria 100 chamadas sozinha e atrasaria o resto da rodada.
 */
export async function varrerFatia(
  fatia: Fatia,
  maxPaginas = 5,
): Promise<{ vagas: VagaBruta[]; total: number }> {
  const vagas: VagaBruta[] = [];
  let total = 0;

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const deslocamento = pagina * LIMITE_PAGINA;
    if (deslocamento >= TETO_DESLOCAMENTO) break;

    const resposta = await buscarPagina(fatia, deslocamento);
    total = resposta.total;
    vagas.push(...resposta.vagas);

    // Página incompleta significa que acabou
    if (resposta.vagas.length < LIMITE_PAGINA) break;

    await espera(INTERVALO);
  }

  return { vagas, total };
}
