/**
 * Persistência.
 *
 * Usa o SQLite que já vem no Node — sem dependência externa e sem servidor para
 * subir. Na fase 2, quando o site entrar, a mesma interface passa a falar com
 * Postgres: por isso tudo aqui é função, e nada de fora toca no SQL direto.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Rodada, Vaga } from './tipos.ts';

const CAMINHO = process.env.RADAR_BANCO ?? 'dados/radar.db';

let db: DatabaseSync | null = null;

export function abrir(): DatabaseSync {
  if (db) return db;

  mkdirSync(dirname(CAMINHO), { recursive: true });
  db = new DatabaseSync(CAMINHO);

  // WAL deixa leitura e escrita conviverem — importante quando o site estiver
  // lendo enquanto o coletor grava
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

/**
 * Grava uma vaga. Devolve 'nova' ou 'atualizada' — é assim que a rodada sabe
 * quanto de fato apareceu de novidade, em vez de contar a mesma vaga várias
 * vezes por ela cair em fatias diferentes.
 */
export function salvarVaga(v: Vaga): 'nova' | 'atualizada' {
  const d = abrir();
  const existe = d.prepare('SELECT 1 FROM vagas WHERE id = ?').get(v.id);

  d.prepare(`
    INSERT INTO vagas (id, fonte, titulo, empresa, logo, descricao, cidade, estado,
                       modelo, contrato, area, afirmativa, publicadaEm, prazoAte, url, vistaEm)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      titulo = excluded.titulo,
      empresa = excluded.empresa,
      prazoAte = excluded.prazoAte,
      vistaEm = excluded.vistaEm
  `).run(
    v.id, v.fonte, v.titulo, v.empresa, v.logo, v.descricao, v.cidade, v.estado,
    v.modelo, v.contrato, v.area, v.afirmativa ? 1 : 0, v.publicadaEm, v.prazoAte,
    v.url, v.vistaEm,
  );

  return existe ? 'atualizada' : 'nova';
}

export function abrirRodada(): number {
  const d = abrir();
  d.prepare('INSERT INTO rodadas (inicio) VALUES (?)').run(new Date().toISOString());
  const linha = d.prepare('SELECT last_insert_rowid() AS id').get() as { id: number };
  return linha.id;
}

export function fecharRodada(id: number, r: Omit<Rodada, 'id' | 'inicio' | 'fim'>): void {
  abrir().prepare(`
    UPDATE rodadas
       SET fim = ?, fatias = ?, encontradas = ?, novas = ?, atualizadas = ?, erros = ?, observacao = ?
     WHERE id = ?
  `).run(new Date().toISOString(), r.fatias, r.encontradas, r.novas, r.atualizadas, r.erros, r.observacao, id);
}

export interface Resumo {
  total: number;
  porArea: { area: string; n: number }[];
  porContrato: { contrato: string; n: number }[];
  porModelo: { modelo: string; n: number }[];
  ultimasRodadas: Rodada[];
}

export function resumo(): Resumo {
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

/** Busca com os filtros da fase 2 — já disponível para conferir a coleta. */
export function buscar(f: {
  termo?: string; area?: string; contrato?: string; modelo?: string;
  cidade?: string; dias?: number; limite?: number;
}): Vaga[] {
  const cond: string[] = [];
  const val: (string | number)[] = [];

  if (f.termo)    { cond.push('(titulo LIKE ? OR empresa LIKE ?)'); val.push(`%${f.termo}%`, `%${f.termo}%`); }
  if (f.area)     { cond.push('area = ?');     val.push(f.area); }
  if (f.contrato) { cond.push('contrato = ?'); val.push(f.contrato); }
  if (f.modelo)   { cond.push('modelo = ?');   val.push(f.modelo); }
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
