/**
 * Enriquecimento.
 *
 * A fonte não separa senioridade nem salário — os dois ficam soltos no título e
 * no meio da descrição. Quem procura o primeiro emprego precisa exatamente
 * disso: filtrar júnior e ver quanto paga antes de abrir a vaga.
 *
 * Tudo aqui é derivado de texto, então erra às vezes. A regra é preferir não
 * marcar a marcar errado: `null` significa "não deu para saber", e a busca
 * trata isso como "não filtra", nunca como "não tem".
 */

export type Senioridade =
  | 'estagio'
  | 'aprendiz'
  | 'junior'
  | 'pleno'
  | 'senior'
  | 'especialista'
  | 'lideranca';

/**
 * Numeral de nível ("Analista II") só vale no fim do título ou antes de um
 * separador. Solto no meio do texto ele pega qualquer coisa — "Suporte 1º
 * nível", "Java 17" — e classifica errado.
 */
function nivelNumerico(formas: string): RegExp {
  return new RegExp(`\\b(${formas})\\b\\s*(?:$|[(\\[|\\u2013\\u2014-])`, 'i');
}

/**
 * A ordem importa: "analista júnior" e "analista sênior" compartilham palavras,
 * e liderança vem antes para "coordenador de suporte júnior" não virar júnior.
 *
 * Especialista fica fora de liderança de propósito: é trilha técnica, não
 * chefia. Quem filtra por liderança quer gerir gente.
 */
const MARCAS: [Senioridade, RegExp][] = [
  ['lideranca',    /\b(gerente|coordenador[ae]?|supervisor[ae]?|l[ií]der|tech lead|head)\b/i],
  ['especialista', /\b(especialista|principal|staff)\b/i],
  ['estagio',      /\b(est[aá]gi[oa]|estagi[aá]ri[oa]|trainee)\b/i],
  ['aprendiz',     /\b(aprendiz|jovem aprendiz|menor aprendiz)\b/i],
  ['senior',       /\b(s[eê]nior|sr\.?)\b(?!\s*ano)/i],
  ['pleno',        /\b(pleno|pl\.?)\b(?!\s*ano)/i],
  ['junior',       /\b(j[uú]nior|jr\.?|iniciante|entrada|sem experi[eê]ncia)\b(?!\s*ano)/i],
  ['senior',       nivelNumerico('iii|3')],
  ['pleno',        nivelNumerico('ii|2')],
  ['junior',       nivelNumerico('i|1')],
];

/**
 * Descobre a senioridade pelo título.
 *
 * Só o título, de propósito: a descrição costuma citar outras vagas do time e
 * requisitos de senioridades diferentes, o que envenenaria o resultado.
 */
export function acharSenioridade(titulo: string): Senioridade | null {
  for (const [nivel, padrao] of MARCAS) {
    if (padrao.test(titulo)) return nivel;
  }
  return null;
}

/** O que antecede um valor quando ele é remuneração de verdade. */
const PAGAMENTO = /(sal[aá]ri|salarial|remunera|bolsa|vencimento|pr[oó][\s-]?labore|honor[aá]rio)/i;

/**
 * O que antecede um valor quando ele é benefício.
 *
 * Sem isto o coletor anunciava "R$ 507" para uma vaga de back-end pleno: era o
 * vale-alimentação. Número errado é pior que número ausente, porque a pessoa
 * descarta a vaga sem abrir.
 */
const BENEFICIO =
  /(vale|cart[aã]o|aux[ií]lio[\s-]?(alimenta|refei|creche|transporte|home|educa)|plano|seguro|conv[eê]nio|cesta|gympass|totalpass|reembolso|desconto|premia|b[oô]nus|cr[eé]dito|pr[eê]mio|participa[cç][aã]o)/i;

/**
 * Procura um salário no texto.
 *
 * Aceita "R$ 1.500,00", "R$ 1.500" e "R$ 1500,00". Quando encontra uma faixa
 * ("de R$ 2.000 a R$ 3.000"), devolve o menor valor: é o que a pessoa vai
 * receber de fato ao entrar, e prometer o teto seria enganar.
 *
 * Só aceita o valor quando a palavra mais próxima antes dele é de remuneração.
 * A descrição de vaga é quase toda lista de benefícios, então sem esse recorte
 * o menor valor encontrado é sempre um vale, nunca o salário.
 */
export function acharSalario(texto: string): number | null {
  const encontrados: number[] = [];
  const padrao = /R\$\s*([\d.]+(?:,\d{2})?)/gi;

  for (const achado of texto.matchAll(padrao)) {
    const valor = paraNumero(achado[1]);
    if (valor === null) continue;

    // Janela curta: o rótulo de um valor vem logo antes dele
    const inicio = Math.max(0, (achado.index ?? 0) - 80);
    const antes = texto.slice(inicio, achado.index);

    const pago = ultimaPosicao(antes, PAGAMENTO);
    const beneficio = ultimaPosicao(antes, BENEFICIO);
    if (pago === -1 || beneficio > pago) continue;

    encontrados.push(valor);
  }

  return encontrados.length ? Math.min(...encontrados) : null;
}

/** Formato brasileiro: ponto separa milhar, vírgula separa centavo. */
function paraNumero(bruto: string): number | null {
  const valor = Number(bruto.replace(/\./g, '').replace(',', '.'));
  // Fora dessa faixa não é salário mensal: é faturamento, meta ou centavo solto
  if (!Number.isFinite(valor) || valor < 500 || valor > 60_000) return null;
  return valor;
}

/** Onde o padrão aparece pela última vez no trecho, ou -1. */
function ultimaPosicao(trecho: string, padrao: RegExp): number {
  const global = new RegExp(padrao.source, 'gi');
  let ultima = -1;
  for (const achado of trecho.matchAll(global)) ultima = achado.index ?? -1;
  return ultima;
}

/**
 * Vaga afirmativa para pessoa com deficiência.
 *
 * O campo `disabilities` da fonte marca quase tudo como verdadeiro — na amostra
 * que medi, 174 de 200 —, então ele indica "aceita candidatura" e não "vaga
 * exclusiva". Para não prometer o que não é, exige menção explícita no texto.
 */
export function ehExclusivaPcD(titulo: string, descricao: string): boolean {
  const padrao =
    /\b(exclusiv[ao]s?\s+(para\s+)?(pcd|pessoas?\s+com\s+defici[eê]ncia)|vaga\s+afirmativa\s+(para\s+)?pcd)\b/i;
  return padrao.test(titulo) || padrao.test(descricao.slice(0, 1500));
}
