/**
 * Tipos compartilhados do Radar.
 *
 * `VagaBruta` é o que a fonte devolve, sem tratamento. `Vaga` é o que a gente
 * guarda: campos normalizados, texto limpo e a área já derivada do cargo.
 * Manter os dois separados evita que uma mudança no formato da fonte vaze
 * para o resto do sistema.
 */

/** Tipos de contrato que a Gupy usa, na nomenclatura dela. */
export type TipoGupy =
  | 'vacancy_type_effective'
  | 'vacancy_type_internship'
  | 'vacancy_type_apprentice'
  | 'vacancy_type_temporary'
  | 'vacancy_type_autonomous'
  | 'vacancy_legal_entity';

/** Como a gente chama esses tipos no nosso domínio. */
export type Contrato =
  | 'efetivo'
  | 'estagio'
  | 'aprendiz'
  | 'temporario'
  | 'autonomo'
  | 'pj'
  | 'outro';

export type Modelo = 'remoto' | 'hibrido' | 'presencial';

/** A vaga como a API da Gupy devolve. */
export interface VagaBruta {
  id: number;
  name: string;
  description: string;
  careerPageName: string;
  careerPageLogo?: string;
  publishedDate: string;
  applicationDeadline?: string | null;
  isRemoteWork: boolean;
  city: string;
  state: string;
  country: string;
  jobUrl: string;
  workplaceType: string;
  disabilities: boolean;
  type: string;
  badges?: unknown[];
  skills?: unknown[];
}

/** A vaga como a gente guarda. */
export interface Vaga {
  id: number;
  fonte: string;
  titulo: string;
  empresa: string;
  logo: string | null;
  descricao: string;
  cidade: string | null;
  estado: string | null;
  modelo: Modelo;
  contrato: Contrato;
  area: string;
  senioridade: string | null;
  salario: number | null;
  afirmativa: boolean;
  publicadaEm: string;
  prazoAte: string | null;
  url: string;
  vistaEm: string;
}

/** Uma fatia de busca: a API trava em 10.000, então varremos em pedaços. */
export interface Fatia {
  termo: string;
  area: string;
  cidade?: string;
  contrato?: TipoGupy;
}

/** O que uma rodada de coleta produziu. */
export interface Rodada {
  id?: number;
  inicio: string;
  fim: string | null;
  fatias: number;
  encontradas: number;
  novas: number;
  atualizadas: number;
  erros: number;
  observacao: string | null;
}
