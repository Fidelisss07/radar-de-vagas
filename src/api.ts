/**
 * API HTTP.
 *
 * Serve o que o coletor guardou, em JSON. Existe para que o site seja só
 * desenho: quem monta a tela pede `/vagas` com os filtros na query e recebe a
 * lista pronta, sem saber se por baixo responde SQLite ou Supabase.
 *
 * Usa o servidor que já vem no Node — o projeto segue sem dependência.
 *
 *   node src/api.ts            (porta 3000, ou PORT do ambiente)
 */

import { createServer } from 'node:http';
import { buscar, resumo, ondeGrava } from './banco/index.ts';
import { CARGOS, CIDADES } from './dicionario.ts';
import type { Filtros } from './banco/tipos.ts';

const PORTA = Number(process.env.PORT ?? 3000);

/** Teto por página. Sem ele, uma consulta pode pedir a base inteira. */
const LIMITE_MAXIMO = 100;
const LIMITE_PADRAO = 20;

const CONTRATOS = ['efetivo', 'estagio', 'aprendiz', 'temporario', 'pj', 'autonomo', 'outro'];
const MODELOS = ['remoto', 'hibrido', 'presencial'];
const SENIORIDADES = ['estagio', 'aprendiz', 'junior', 'pleno', 'senior', 'especialista', 'lideranca'];

function json(resposta: import('node:http').ServerResponse, codigo: number, corpo: unknown) {
  const texto = JSON.stringify(corpo);
  resposta.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    // Vaga de emprego é informação pública e o site pode estar em outro
    // domínio que a API. Só leitura é permitida, então liberar é seguro.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    // Meia hora de cache: a coleta roda de 3 em 3 horas, então repetir a mesma
    // consulta antes disso devolveria exatamente o mesmo resultado.
    'Cache-Control': 'public, max-age=1800',
  });
  resposta.end(texto);
}

/**
 * Lê um número da query.
 *
 * Devolve `undefined` quando não é número, em vez de NaN: assim um `?dias=abc`
 * vira "sem filtro de data" e não uma comparação que nunca casa.
 */
function numero(valor: string | null, maximo?: number): number | undefined {
  if (valor === null) return undefined;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return maximo === undefined ? n : Math.min(n, maximo);
}

/** Só aceita valor que está na lista. Evita filtro que nunca casa por typo. */
function daLista(valor: string | null, lista: string[]): string | undefined {
  if (valor === null) return undefined;
  const limpo = valor.trim().toLowerCase();
  return lista.includes(limpo) ? limpo : undefined;
}

function montarFiltros(q: URLSearchParams): { filtros: Filtros; pagina: number } {
  const areas = Object.keys(CARGOS);
  const limite = numero(q.get('limite'), LIMITE_MAXIMO) ?? LIMITE_PADRAO;
  const pagina = Math.max(1, numero(q.get('pagina')) ?? 1);

  return {
    pagina,
    filtros: {
      termo: q.get('termo')?.trim() || undefined,
      area: daLista(q.get('area'), areas),
      contrato: daLista(q.get('contrato'), CONTRATOS),
      modelo: daLista(q.get('modelo'), MODELOS),
      senioridade: daLista(q.get('senioridade'), SENIORIDADES),
      cidade: q.get('cidade')?.trim() || undefined,
      salarioMin: numero(q.get('salario')),
      dias: numero(q.get('dias')),
      limite,
      deslocamento: (pagina - 1) * limite,
    },
  };
}

const servidor = createServer(async (requisicao, resposta) => {
  const url = new URL(requisicao.url ?? '/', `http://${requisicao.headers.host ?? 'localhost'}`);

  if (requisicao.method === 'OPTIONS') {
    resposta.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    });
    return resposta.end();
  }

  if (requisicao.method !== 'GET') {
    return json(resposta, 405, { erro: 'Só GET. A API é de leitura.' });
  }

  try {
    if (url.pathname === '/vagas') {
      const { filtros, pagina } = montarFiltros(url.searchParams);
      const vagas = await buscar(filtros);
      return json(resposta, 200, {
        pagina,
        limite: filtros.limite,
        // Pedimos o limite exato, então uma página cheia sugere que há mais.
        // É mais barato que uma contagem total a cada consulta.
        temMais: vagas.length === filtros.limite,
        vagas,
      });
    }

    if (url.pathname === '/status') {
      return json(resposta, 200, { banco: ondeGrava(), ...(await resumo()) });
    }

    // O site monta os menus a partir daqui, em vez de repetir as listas no
    // front-end e sair do ar toda vez que o dicionário mudar.
    if (url.pathname === '/filtros') {
      return json(resposta, 200, {
        areas: Object.keys(CARGOS),
        contratos: CONTRATOS,
        modelos: MODELOS,
        senioridades: SENIORIDADES,
        cidades: CIDADES,
      });
    }

    return json(resposta, 404, {
      erro: 'Rota desconhecida',
      rotas: ['/vagas', '/status', '/filtros'],
    });
  } catch (erro) {
    // A mensagem interna pode conter a URL do banco, então fica só no log
    console.error('Erro ao responder', url.pathname, erro);
    return json(resposta, 500, { erro: 'Falha ao consultar o banco' });
  }
});

servidor.listen(PORTA, () => {
  console.log(`API em http://localhost:${PORTA}`);
  console.log(`Lendo de: ${ondeGrava()}`);
  console.log('Rotas: /vagas  /status  /filtros');
});
