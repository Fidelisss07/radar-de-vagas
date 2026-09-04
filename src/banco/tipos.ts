/** Contrato comum aos dois adaptadores de banco. */

import type { Rodada, Vaga } from '../tipos.ts';

export interface Filtros {
  termo?: string;
  area?: string;
  contrato?: string;
  modelo?: string;
  cidade?: string;
  senioridade?: string;
  salarioMin?: number;
  dias?: number;
  limite?: number;
  deslocamento?: number;
}

export interface Resumo {
  total: number;
  porArea: { area: string; n: number }[];
  porContrato: { contrato: string; n: number }[];
  porModelo: { modelo: string; n: number }[];
  ultimasRodadas: Rodada[];
}

/**
 * Toda operação é assíncrona, inclusive no SQLite, que é síncrono por
 * natureza. Uniformizar aqui evita que trocar de banco vire refatoração do
 * resto do código.
 */
export interface Banco {
  nome: string;
  salvarLote(vagas: Vaga[]): Promise<{ novas: number; atualizadas: number }>;
  abrirRodada(): Promise<number>;
  fecharRodada(id: number, r: Omit<Rodada, 'id' | 'inicio' | 'fim'>): Promise<void>;
  resumo(): Promise<Resumo>;
  buscar(f: Filtros): Promise<Vaga[]>;
}
