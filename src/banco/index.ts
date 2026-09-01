/**
 * Escolhe o banco.
 *
 * Com `SUPABASE_URL` e a chave no ambiente, fala com o Supabase. Sem elas, cai
 * no SQLite local. Assim dá para desenvolver a coleta offline e subir para
 * produção sem tocar em nenhuma outra linha do projeto.
 */

import * as sqlite from './sqlite.ts';
import * as supabase from './supabase.ts';
import type { Banco } from './tipos.ts';

export type { Filtros, Resumo } from './tipos.ts';

const usandoSupabase = supabase.configurado();

export const banco: Banco = usandoSupabase
  ? { nome: 'supabase', ...supabase }
  : { nome: 'sqlite', ...sqlite };

/** Uma linha para a CLI dizer onde está gravando — evita susto. */
export function ondeGrava(): string {
  return usandoSupabase
    ? `Supabase (${(process.env.SUPABASE_URL ?? '').replace(/^https?:\/\//, '').split('.')[0]})`
    : `SQLite local (${process.env.RADAR_BANCO ?? 'dados/radar.db'})`;
}

export const { salvarLote, abrirRodada, fecharRodada, resumo, buscar } = banco;
