/**
 * Teste de respostas reais via API para verificar naturalidade
 */
import { chatCompletionRaw } from './dist/servicos/chat-providers.js';

const MENSAGENS_TESTE = [
  'Quando o motorista recusar duas vezes, agradeça e pergunte se ele quer contato futuro',
  'Você precisa ser mais educado quando o motorista recusar',
  'Muda a mensagem de boas vindas para algo mais informal',
  'Como você está respondendo agora?',
  'Bom dia, tudo bem?',
  'Sempre ofereça frete de retorno quando a carga for de retorno',
];

async function testarRespostaTreinador(mensagem: string) {
  const resposta = await chatCompletionRaw(
    [
      {
        role: 'system',
        content: `Voce esta em um canal de treino da GMX no WhatsApp.
Converse como um operador tecnico claro e objetivo.
Explique o comportamento atual da IA, incluindo prompt base e aprendizados ativos.
No modo treinador, nunca diga que vai pausar, escalar para humano ou encerrar por falta de autonomia.
Se houver erro interno, explique o erro e peca um novo comando sem sair do modo treinador.
Se o usuario estiver so perguntando, responda normalmente.
Se o usuario quiser alterar comportamento, a IA vai aplicar diretamente.`,
      },
      {
        role: 'user',
        content: mensagem,
      },
    ],
    { temperature: 0.25, max_tokens: 420 },
  );
  return resposta;
}

async function executarTestes() {
  console.log('=== BATERIA DE TESTES - RESPOSTAS DO TREINADOR ===\n');
  
  for (const mensagem of MENSAGENS_TESTE) {
    console.log(`\n📨 Mensagem: "${mensagem}"`);
    console.log('---');
    
    try {
      const resposta = await testarRespostaTreinador(mensagem);
      console.log(`🤖 Resposta: "${resposta}"`);
      
      // Análise de naturalidade
      const problemas = [];
      
      if (resposta.includes('#')) {
        problemas.push('Contém símbolo # (ID)');
      }
      
      if (resposta.includes('Confirmar') || resposta.includes('Cancelar')) {
        problemas.push('Contém comandos de confirmação');
      }
      
      if (resposta.includes('proposta') || resposta.includes('pendente')) {
        problemas.push('Contém termos do sistema antigo');
      }
      
      if (resposta.length > 300) {
        problemas.push('Resposta muito longa');
      }
      
      if (resposta.includes('PROMPT BASE ATUAL') || resposta.includes('SEM APRENDIZADOS')) {
        problemas.push('Contém metadados técnicos');
      }
      
      if (problemas.length > 0) {
        console.log('⚠️  Problemas de naturalidade:');
        problemas.forEach(p => console.log(`   - ${p}`));
      } else {
        console.log('✅ Resposta soa natural');
      }
      
    } catch (error) {
      console.log(`❌ Erro: ${error instanceof Error ? error.message : 'falha desconhecida'}`);
    }
    
    console.log('---');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n=== FIM DOS TESTES ===');
}

executarTestes().catch(console.error);
