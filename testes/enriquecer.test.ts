/**
 * Testes do enriquecimento.
 *
 * Usa o executor que já vem no Node — sem framework para instalar.
 *   node --test "testes/*.test.ts"
 *
 * Os casos vieram de títulos e descrições reais que apareceram na coleta. Os
 * que mais importam são os que confundem: "coordenador júnior" é liderança,
 * "com 2 anos de experiência" não é pleno, e o menor "R$" de uma descrição
 * quase nunca é o salário.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acharSenioridade, acharSalario, ehExclusivaPcD } from '../src/enriquecer.ts';

test('reconhece as senioridades escritas por extenso', () => {
  assert.equal(acharSenioridade('Desenvolvedor Júnior'), 'junior');
  assert.equal(acharSenioridade('Analista Pleno'), 'pleno');
  assert.equal(acharSenioridade('Engenheiro de Software Sênior'), 'senior');
  assert.equal(acharSenioridade('Estágio em Desenvolvimento'), 'estagio');
  assert.equal(acharSenioridade('Jovem Aprendiz — Administrativo'), 'aprendiz');
});

test('reconhece as formas abreviadas', () => {
  assert.equal(acharSenioridade('Dev Jr'), 'junior');
  assert.equal(acharSenioridade('Analista PL'), 'pleno');
  assert.equal(acharSenioridade('Programador SR.'), 'senior');
});

test('liderança vence júnior quando os dois aparecem', () => {
  // Sem essa precedência, a vaga cairia no filtro de quem busca primeiro emprego
  assert.equal(acharSenioridade('Coordenador de Suporte Júnior'), 'lideranca');
  assert.equal(acharSenioridade('Tech Lead'), 'lideranca');
});

test('especialista é trilha técnica, não liderança', () => {
  // Quem filtra liderança quer gerir gente; especialista sênior não gere
  assert.equal(acharSenioridade('Desenvolvedor Back-end Especialista'), 'especialista');
  assert.equal(acharSenioridade('Staff Engineer'), 'especialista');
  // Mas quando o título diz as duas coisas, chefia manda
  assert.equal(acharSenioridade('Pessoa Desenvolvedora Sênior I — Tech Lead'), 'lideranca');
});

test('numeral de nível só conta no fim do cargo', () => {
  assert.equal(acharSenioridade('Analista de Sistemas II'), 'pleno');
  assert.equal(acharSenioridade('Especialista I (Soluções Corporativas)'), 'especialista');
  // Aqui o "1" é do produto, não do nível
  assert.equal(acharSenioridade('Analista de Suporte 1º nível ao cliente'), null);
});

test('não confunde tempo de experiência com senioridade', () => {
  // "2 anos" não faz a vaga ser pleno
  assert.equal(acharSenioridade('Desenvolvedor com 2 anos de experiência'), null);
  assert.equal(acharSenioridade('Analista de Dados'), null);
});

test('lê salário no formato brasileiro', () => {
  assert.equal(acharSalario('Salário de R$ 1.518,00 por mês'), 1518);
  assert.equal(acharSalario('Remuneração: R$ 3.200'), 3200);
  assert.equal(acharSalario('Bolsa-auxílio de R$ 2500,50'), 2500.5);
});

test('numa faixa, devolve o menor — é o que a pessoa recebe ao entrar', () => {
  assert.equal(acharSalario('Faixa salarial de R$ 2.000,00 a R$ 3.500,00'), 2000);
});

test('não confunde benefício com salário', () => {
  // Caso real: a vaga anunciava R$ 507 para back-end pleno. Era o vale.
  const real =
    'Salário de R$ 9.000,00. Benefícios: Cartão CAJU, crédito de R$ 1.059,00 ao mês; ' +
    'Vale Alimentação de R$ 507,00; Plano de saúde.';
  assert.equal(acharSalario(real), 9000);

  // Sem nenhuma palavra de remuneração, não há o que afirmar
  assert.equal(acharSalario('Vale Alimentação de R$ 569,00; Gympass'), null);
  assert.equal(acharSalario('R$ 2.500,00 mais benefícios'), null);
});

test('ignora valores fora da faixa de um salário mensal', () => {
  assert.equal(acharSalario('Salário do CEO: faturamento de R$ 500.000.000'), null);
  assert.equal(acharSalario('Bolsa de R$ 20,00 por dia'), null);
});

test('devolve nulo quando não há salário no texto', () => {
  assert.equal(acharSalario('Salário a combinar'), null);
  assert.equal(acharSalario(''), null);
});

test('só marca PcD quando a vaga diz que é exclusiva', () => {
  assert.equal(ehExclusivaPcD('Analista', 'Vaga exclusiva para PcD'), true);
  assert.equal(ehExclusivaPcD('Vaga Afirmativa para PcD', ''), true);
  // O caso comum: a empresa apenas informa que aceita, o que não é exclusividade
  assert.equal(ehExclusivaPcD('Analista', 'Pessoas com deficiência são bem-vindas'), false);
});
