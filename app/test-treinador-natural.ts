/**
 * Bateria de testes para validar modo treinador com linguagem natural
 */
import { processarMensagemTreinamentoWhatsapp } from './dist/servicos/treinamento-whatsapp.js';

const TESTES_NATURAIS = [
  {
    descricao: 'Pedido de mudança de comportamento em recusas',
    telefone: '555399550092',
    remoteJid: '555399550092@s.whatsapp.net',
    mensagem: 'Quando o motorista recusar duas vezes, agradeça e pergunte se ele quer contato futuro',
    esperado: 'aprendizado',
  },
  {
    descricao: 'Pedido para ser mais educado',
    telefone: '555399550092',
    remoteJid: '555399550092@s.whatsapp.net',
    mensagem: 'Você precisa ser mais educado quando o motorista recusar',
    esperado: 'aprendizado',
  },
  {
    descricao: 'Edição direta de texto',
    telefone: '555399550092',
    remoteJid: '555399550092@s.whatsapp.net',
    mensagem: 'Muda a mensagem de boas vindas para algo mais informal',
    esperado: 'patch',
  },
  {
    descricao: 'Pergunta sobre comportamento',
    telefone: '555399550092',
    remoteJid: '555399550092@s.whatsapp.net',
    mensagem: 'Como você está respondendo agora?',
    esperado: 'pergunta',
  },
  {
    descricao: 'Conversa normal',
    telefone: '555399550092',
    remoteJid: '555399550092@s.whatsapp.net',
    mensagem: 'Bom dia, tudo bem?',
    esperado: 'normal',
  },
  {
    descricao: 'Regra específica de negócio',
    telefone: '555399550092',
    remoteJid: '555399550092@s.whatsapp.net',
    mensagem: 'Sempre ofereça frete de retorno quando a carga for de retorno',
    esperado: 'aprendizado',
  },
  {
    descricao: 'Correção de prompt',
    telefone: '555399550092',
    remoteJid: '555399550092@s.whatsapp.net',
    mensagem: 'Corrige o prompt para não pedir documentos que já temos',
    esperado: 'patch',
  },
  {
    descricao: 'Lista de regras',
    telefone: '555399550092',
    remoteJid: '555399550092@s.whatsapp.net',
    mensagem: 'Quais regras você está usando?',
    esperado: 'pergunta',
  },
];

async function executarTestes() {
  console.log('=== BATERIA DE TESTES - MODO TREINADOR NATURAL ===\n');
  
  for (const teste of TESTES_NATURAIS) {
    console.log(`\n📝 Teste: ${teste.descricao}`);
    console.log(`📨 Mensagem: "${teste.mensagem}"`);
    console.log(`🎯 Esperado: ${teste.esperado}`);
    
    try {
      const resposta = await processarMensagemTreinamentoWhatsapp({
        telefone: teste.telefone,
        remoteJid: teste.remoteJid,
        textoUsuario: teste.mensagem,
        pushName: 'Lucas',
      });
      
      console.log(`✅ Resposta: "${resposta}"`);
      
      // Verificar se a resposta soa natural
      if (resposta.includes('#') || resposta.includes('Confirmar') || resposta.includes('Cancelar')) {
        console.log('⚠️  ALERTA: Resposta contém elementos do sistema antigo (IDs/confirmação)');
      }
      
      if (resposta.length > 200) {
        console.log('⚠️  ALERTA: Resposta muito longa, pode não soar natural');
      }
      
    } catch (error) {
      console.log(`❌ Erro: ${error instanceof Error ? error.message : 'falha desconhecida'}`);
    }
    
    console.log('---');
  }
  
  console.log('\n=== FIM DOS TESTES ===');
}

executarTestes().catch(console.error);
