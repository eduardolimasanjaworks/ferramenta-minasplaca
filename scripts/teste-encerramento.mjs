#!/usr/bin/env node
/** Testa detecção de silêncio (não responder) após despedida da GMX */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../app/dist/util/mensagem-encerramento.js');
const { mensagemObviamenteEncerramento } = await import(`file://${DIST}`);

const DESPEDIDA = 'Show parceiro, dados atualizados, boa viagem e vai com Deus';

const casos = [
  { msg: 'valeu', espera: true },
  { msg: 'ok obrigado', espera: true },
  { msg: '👍', espera: true },
  { msg: 'blz', espera: true },
  { msg: 'to em campinas', espera: false },
  { msg: 'quanto paga?', espera: false },
  { msg: 'ok', espera: false, semDespedida: true },
  { msg: 'valeu', espera: false, semDespedida: true },
];

let ok = 0;
for (const c of casos) {
  const ultima = c.semDespedida ? 'Show, manda sua localização' : DESPEDIDA;
  const r = mensagemObviamenteEncerramento(c.msg, ultima);
  const pass = r.encerrar === c.espera;
  console.log(`${pass ? 'OK' : 'FALHA'} "${c.msg}" → encerrar=${r.encerrar} (espera ${c.espera}) ${r.motivo ?? ''}`);
  if (pass) ok++;
}

console.log(`\n${ok}/${casos.length}`);
process.exit(ok === casos.length ? 0 : 1);
