import { rotearMensagem } from '../app/dist/servicos/roteador-intencao.js';

const r1 = await rotearMensagem({
  telefone: '5511999000091',
  mensagem: 'atualizar dados',
  historico: [],
  nomeContato: 'João',
});
console.log('dados:', r1.tipo, r1.tipo === 'programatico' ? r1.passo : r1.intencao);

const r2 = await rotearMensagem({ telefone: '5511999000092', mensagem: 'carreta 1', historico: [] });
console.log('carreta:', r2.tipo, r2.tipo === 'programatico' ? r2.passo : r2.intencao);

const r3 = await rotearMensagem({ telefone: '5511999000093', mensagem: 'atualizar CNH', historico: [] });
console.log('doc:', r3.tipo, r3.tipo === 'programatico' ? r3.passo : r3.intencao);

process.exit(0);
