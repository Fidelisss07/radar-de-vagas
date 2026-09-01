/**
 * Entrada de linha de comando.
 *
 *   node src/cli.ts coletar [--fatias N] [--paginas N]
 *   node src/cli.ts status
 *   node src/cli.ts buscar [--termo t] [--area a] [--contrato c] [--modelo m] [--dias N]
 */

import { coletar } from './coletor.ts';
import { buscar, resumo } from './banco.ts';

const args = process.argv.slice(2);
const comando = args[0] ?? 'ajuda';

function opcao(nome: string): string | undefined {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function numero(nome: string): number | undefined {
  const v = opcao(nome);
  return v === undefined ? undefined : Number(v);
}

const AJUDA = `
radar-de-vagas — coleta vagas de fontes públicas

  node src/cli.ts coletar [--fatias N] [--paginas N]
      Percorre as fatias e grava no banco.
      --fatias   quantas fatias percorrer (padrão: todas)
      --paginas  páginas por fatia (padrão: 3, até 100 vagas cada)

  node src/cli.ts status
      Mostra o que há no banco e as últimas rodadas.

  node src/cli.ts buscar [--termo t] [--area a] [--contrato c] [--modelo m] [--cidade c] [--dias N]
      Consulta o banco. Serve para conferir a coleta antes de existir site.
`;

if (comando === 'coletar') {
  const inicio = Date.now();
  console.log('Coletando…\n');

  const r = await coletar({
    limiteFatias: numero('fatias'),
    paginasPorFatia: numero('paginas'),
    aoProgredir: ({ indice, total, fatia, encontradas, novas, erro }) => {
      const nome = [fatia.termo || '(sem termo)', fatia.cidade, fatia.contrato]
        .filter(Boolean).join(' · ');
      const pos = `${String(indice).padStart(3)}/${total}`;
      if (erro) {
        console.log(`  ${pos}  ${nome.padEnd(42).slice(0, 42)}  falhou: ${erro}`);
      } else {
        console.log(`  ${pos}  ${nome.padEnd(42).slice(0, 42)}  ${String(encontradas).padStart(4)} vagas, ${novas} novas`);
      }
    },
  });

  const seg = Math.round((Date.now() - inicio) / 1000);
  console.log(`\nRodada concluída em ${Math.floor(seg / 60)}m${seg % 60}s`);
  console.log(`  fatias percorridas : ${r.fatias}`);
  console.log(`  vagas encontradas  : ${r.encontradas}`);
  console.log(`  novas no banco     : ${r.novas}`);
  console.log(`  já conhecidas      : ${r.atualizadas}`);
  console.log(`  fatias com falha   : ${r.erros}`);

} else if (comando === 'status') {
  const r = resumo();
  console.log(`\nBanco: ${r.total} vagas\n`);

  const bloco = (titulo: string, linhas: { chave: string; n: number }[]) => {
    console.log(titulo);
    for (const l of linhas.slice(0, 12)) {
      console.log(`  ${l.chave.padEnd(16)} ${String(l.n).padStart(6)}`);
    }
    console.log('');
  };

  bloco('Por área:',     r.porArea.map(l => ({ chave: l.area, n: l.n })));
  bloco('Por contrato:', r.porContrato.map(l => ({ chave: l.contrato, n: l.n })));
  bloco('Por modelo:',   r.porModelo.map(l => ({ chave: l.modelo, n: l.n })));

  console.log('Últimas rodadas:');
  for (const rodada of r.ultimasRodadas) {
    const quando = rodada.inicio.slice(0, 16).replace('T', ' ');
    const estado = rodada.fim ? 'concluída' : 'interrompida';
    console.log(`  ${quando}  ${String(rodada.novas).padStart(5)} novas  ${String(rodada.encontradas).padStart(6)} vistas  ${rodada.erros} erros  ${estado}`);
  }

} else if (comando === 'buscar') {
  const vagas = buscar({
    termo: opcao('termo'),
    area: opcao('area'),
    contrato: opcao('contrato'),
    modelo: opcao('modelo'),
    cidade: opcao('cidade'),
    dias: numero('dias'),
    limite: numero('limite') ?? 20,
  });

  console.log(`\n${vagas.length} vaga(s)\n`);
  for (const v of vagas) {
    const onde = v.modelo === 'remoto' ? 'Remoto' : [v.cidade, v.estado].filter(Boolean).join('/') || '—';
    console.log(`  ${v.titulo.slice(0, 52)}`);
    console.log(`    ${v.empresa} · ${onde} · ${v.contrato} · ${v.publicadaEm.slice(0, 10)}`);
    console.log(`    ${v.url}\n`);
  }

} else {
  console.log(AJUDA);
}
