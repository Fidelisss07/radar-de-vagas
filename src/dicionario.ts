/**
 * O dicionário de fatias.
 *
 * A API da Gupy trava em 10.000 no deslocamento e devolve 100 por página, então
 * não dá para varrer as 80 mil vagas em sequência. A saída é fatiar: muitas
 * consultas estreitas, cada uma abaixo do teto, e o banco junta tudo removendo
 * repetição pelo id da vaga.
 *
 * Tecnologia vem primeiro e mais detalhada — é o foco do projeto. Os outros
 * setores entram porque a base é de um ATS geral: limitar a TI jogaria fora a
 * maior parte das vagas.
 */

import type { Fatia } from './tipos.ts';

/** Cargos por área. A chave vira a `area` da vaga guardada. */
export const CARGOS: Record<string, string[]> = {
  tecnologia: [
    'desenvolvedor', 'desenvolvedora', 'programador', 'engenheiro de software',
    'front-end', 'back-end', 'full stack', 'react', 'node', 'java', 'python',
    'javascript', 'typescript', 'php', 'c#', '.net', 'android', 'ios', 'flutter',
    'qa', 'analista de testes', 'devops', 'sre', 'cloud', 'aws', 'infraestrutura',
    'banco de dados', 'dados', 'analista de dados', 'engenheiro de dados',
    'cientista de dados', 'business intelligence', 'analista de sistemas',
    'suporte tecnico', 'help desk', 'seguranca da informacao', 'redes',
    'product owner', 'scrum master', 'ux', 'ui', 'designer de produto',
  ],
  administrativo: [
    'auxiliar administrativo', 'assistente administrativo', 'analista administrativo',
    'recepcionista', 'secretaria', 'auxiliar de escritorio', 'assistente de diretoria',
  ],
  comercial: [
    'vendedor', 'vendedora', 'consultor de vendas', 'representante comercial',
    'promotor de vendas', 'gerente de loja', 'operador de caixa', 'atendente',
    'supervisor de vendas', 'televendas',
  ],
  saude: [
    'enfermagem', 'enfermeiro', 'tecnico de enfermagem', 'medico', 'fisioterapeuta',
    'nutricionista', 'psicologo', 'farmaceutico', 'auxiliar de saude bucal',
    'biomedico', 'cuidador',
  ],
  financeiro: [
    'analista financeiro', 'auxiliar financeiro', 'contador', 'auxiliar contabil',
    'analista fiscal', 'tesouraria', 'controladoria', 'analista de credito',
  ],
  logistica: [
    'motorista', 'auxiliar de logistica', 'estoquista', 'conferente', 'almoxarife',
    'operador de empilhadeira', 'separador', 'auxiliar de expedicao', 'motoboy',
  ],
  industria: [
    'operador de producao', 'auxiliar de producao', 'mecanico', 'eletricista',
    'soldador', 'tecnico de manutencao', 'engenheiro de producao', 'torneiro',
    'operador de maquinas',
  ],
  educacao: [
    'professor', 'professora', 'auxiliar de classe', 'coordenador pedagogico',
    'monitor', 'instrutor',
  ],
  alimentacao: [
    'cozinheiro', 'auxiliar de cozinha', 'garcom', 'chapeiro', 'padeiro',
    'atendente de restaurante', 'confeiteiro',
  ],
  servicos: [
    'seguranca', 'porteiro', 'auxiliar de limpeza', 'zelador', 'jardineiro',
    'camareira', 'recepcionista de hotel',
  ],
  rh: [
    'recursos humanos', 'recrutamento e selecao', 'departamento pessoal',
    'analista de rh', 'auxiliar de rh',
  ],
  marketing: [
    'marketing', 'social media', 'analista de marketing', 'designer grafico',
    'redator', 'trafego pago',
  ],
};

/**
 * Cidades que ganham varredura própria.
 *
 * Serve para dois fins: alcançar vagas que a busca por cargo não traria (a
 * consulta por termo tem seu próprio teto) e garantir densidade nas praças que
 * mais publicam.
 */
export const CIDADES = [
  'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Porto Alegre',
  'Brasília', 'Salvador', 'Recife', 'Fortaleza', 'Campinas', 'Goiânia',
  'Manaus', 'Belém', 'Florianópolis', 'Vitória', 'Ribeirão Preto',
];

/** Contratos que merecem varredura dedicada por serem pequenos e disputados. */
const CONTRATOS_FOCO = [
  'vacancy_type_internship',
  'vacancy_type_apprentice',
] as const;

/**
 * Monta a lista de fatias de uma rodada.
 *
 * A ordem importa: tecnologia primeiro, depois os contratos de entrada
 * (estágio e aprendiz), depois o resto. Se a rodada for interrompida no meio,
 * o que já coletou é o que mais interessa.
 */
export function montarFatias(): Fatia[] {
  const fatias: Fatia[] = [];

  // 1) Tecnologia, cargo a cargo
  for (const termo of CARGOS.tecnologia) {
    fatias.push({ termo, area: 'tecnologia' });
  }

  // 2) Estágio e aprendiz em tecnologia — o público que mais precisa de radar
  for (const contrato of CONTRATOS_FOCO) {
    for (const termo of ['desenvolvedor', 'ti', 'dados', 'suporte tecnico']) {
      fatias.push({ termo, area: 'tecnologia', contrato });
    }
  }

  // 3) Demais áreas
  for (const [area, termos] of Object.entries(CARGOS)) {
    if (area === 'tecnologia') continue;
    for (const termo of termos) fatias.push({ termo, area });
  }

  // 4) Varredura por cidade, sem termo, para pegar o que escapou
  for (const cidade of CIDADES) {
    fatias.push({ termo: '', area: 'geral', cidade });
  }

  return fatias;
}

/** Descobre a área a partir do título, quando a fatia não disser. */
export function adivinharArea(titulo: string): string {
  const t = titulo.toLowerCase();
  for (const [area, termos] of Object.entries(CARGOS)) {
    if (termos.some(termo => termo.length > 3 && t.includes(termo))) return area;
  }
  return 'geral';
}
