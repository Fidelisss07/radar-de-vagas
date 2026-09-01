/**
 * Adaptador do SQLite.
 *
 * Usa o banco que já vem no Node — sem dependência e sem servidor para subir.
 * Serve para desenvolver e testar a coleta sem depender de rede nem de conta
 * em serviço nenhum. Em produção quem responde é o Supabase.
 *
 * As funções são assíncronas por fora, ainda que o SQLite seja síncrono por
 * dentro: é o que permite trocar de banco sem mexer no resto do código.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Rodada, Vaga } from '../tipos.ts';
import type { Filtros, Resumo } from './tipos.ts';

const CAMINHO = process.env.RADAR_BANCO ?? 'dados/radar.db';

let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;

  mkdirSync(dirname(CAMINHO), { recursive: true });
  db = new DatabaseSync(CAMINHO);

  // WAL deixa leitura e escrita conviverem
  db.exec('PRAGMA journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS vagas (
      id           INTEGER PRIMARY KEY,
      fonte        TEXT NOT NULL,
      titulo       TEXT NOT NULL,
      empresa      TEXT NOT NULL,
      logo         TEXT,
      descricao    TEXT NOT NULL,
      cidade       TEXT,
      estado       TEXT,
      modelo       TEXT NOT NULL,
      contrato     TEXT NOT NULL,
      area         TEXT NOT NULL,
      afirmativa   INTEGER NOT NULL DEFAULT 0,
      publicadaEm  TEXT NOT NULL,
      prazoAte     TEXT,
      url          TEXT NOT NULL,
      vistaEm      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_area      ON vagas (area);
    CREATE INDEX IF NOT EXISTS idx_contrato  ON vagas (contrato);
    CREATE INDEX IF NOT EXISTS idx_modelo    ON vagas (modelo);
    CREATE INDEX IF NOT EXISTS idx_publicada ON vagas (publicadaEm DESC);
    CREATE INDEX IF NOT EXISTS idx_cidade    ON vagas (cidade);

    CREATE TABLE IF NOT EXISTS rodadas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      inicio       TEXT NOT NULL,
      fim          TEXT,
      fatias       INTEGER NOT NULL DEFAULT 0,
      encontradas  INTEGER NOT NULL DEFAULT 0,
      novas        INTEGER NOT NULL DEFAULT 0,
      atualizadas  INTEGER NOT NULL DEFAULT 0,
      erros        INTEGER NOT NULL DEFAULT 0,
      observacao   TEXT
    );
  `);

  return db;
}

export const nome = 'sqlite';

export async function salvarLote(vagas: Vaga[]): Promise<{ novas: number; atualizadas: number }> {
  const d = abrir();
  let novas = 0, atualizadas = 0;

  const jaExiste = d.prepare('SELECT 1 FROM vagas WHERE id = ?');
  const gravar = d.prepare(`
    INSERT INTO vagas (id, fonte, titulo, empresa, logo, descricao, cidade, estado,
                       modelo, contrato, area, afirmativa, publicadaEm, prazoAte, url, vistaEm)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      titulo = excluded.titulo,
      empresa = excluded.empresa,
      prazoAte = excluded.prazoAte,
      vistaEm = excluded.vistaEm
  `);

  for (const v of vagas) {
    if (jaExiste.get(v.id)) atualizadas++; else novas++;
    gravar.run(
      v.id, v.fonte, v.titulo, v.empresa, v.logo, v.descricao, v.cidade, v.estado,
      v.modelo, v.contrato, v.area, v.afirmativa ? 1 : 0, v.publicadaEm, v.prazoAte,
      v.url, v.vistaEm,
    );
  }

  return { novas, atualizadas };
}

export async function abrirRodada(): Promise<number> {
  const d = abrir();
  d.prepare('INSERT INTO rodadas (inicio) VALUES (?)').run(new Date().toISOString());
  return (d.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id;
}

export async function fecharRodada(
  id: number,
  r: Omit<Rodada, 'id' | 'inicio' | 'fim'>,
): Promise<void> {
  abrir().prepare(`
    UPDATE rodadas
       SET fim = ?, fatias = ?, encontradas = ?, novas = ?, atualizadas = ?, erros = ?, observacao = ?
     WHERE id = ?
  `).run(new Date().toISOString(), r.fatias, r.encontradas, r.novas, r.atualizadas, r.erros, r.observacao, id);
}

export async function resumo(): Promise<Resumo> {
  const d = abrir();
  const conta = (col: string) =>
    d.prepare(`SELECT ${col} AS chave, COUNT(*) AS n FROM vagas GROUP BY ${col} ORDER BY n DESC`)
      .all() as { chave: string; n: number }[];

  return {
    total: (d.prepare('SELECT COUNT(*) AS n FROM vagas').get() as { n: number }).n,
    porArea: conta('area').map(l => ({ area: l.chave, n: l.n })),
    porContrato: conta('contrato').map(l => ({ contrato: l.chave, n: l.n })),
    porModelo: conta('modelo').map(l => ({ modelo: l.chave, n: l.n })),
    ultimasRodadas: d.prepare('SELECT * FROM rodadas ORDER BY id DESC LIMIT 5').all() as unknown as Rodada[],
  };
}

export async function buscar(f: Filtros): Promise<Vaga[]> {
  const cond: string[] = [];
  const val: (string | number)[] = [];

  if (f.termo)    { cond.push('(titulo LIKE ? OR empresa LIKE ?)'); val.push(`%${f.termo}%`, `%${f.termo}%`); }
  if (f.area)     { cond.push('area = ?');      val.push(f.area); }
  if (f.contrato) { cond.push('contrato = ?');  val.push(f.contrato); }
  if (f.modelo)   { cond.push('modelo = ?');    val.push(f.modelo); }
  if (f.cidade)   { cond.push('cidade LIKE ?'); val.push(`%${f.cidade}%`); }
  if (f.dias) {
    cond.push('publicadaEm >= ?');
    val.push(new Date(Date.now() - f.dias * 86400000).toISOString());
  }

  const onde = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  val.push(f.limite ?? 20);

  return abrir()
    .prepare(`SELECT * FROM vagas ${onde} ORDER BY publicadaEm DESC LIMIT ?`)
    .all(...val) as unknown as Vaga[];
}
