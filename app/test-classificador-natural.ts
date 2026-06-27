/**
 * Teste do classificador de intenção com linguagem natural
 * Testa apenas a classificação, sem dependência de banco
 */
import { chatCompletionRaw } from './dist/servicos/chat-providers.js';

async function classificarIntencaoTreinamento(texto: string): Promise<'aprendizado' | 'patch' | 'pergunta' | 'normal'> {
  const resposta = await chatCompletionRaw(
    [
      {
        role: 'system',
        content: 'Voce classifica mensagens de treinadores autorizados de uma IA de atendimento. Responda SOMENTE uma palavra: "aprendizado" se for ensinar uma nova regra/comportamento, "patch" se for editar/corrigir textos existentes, "pergunta" se for perguntar sobre como a IA funciona, ou "normal" para conversa comum.',
      },
      {
        role: 'user',
        content: texto,
      },
    ],
    { temperature: 0.1, max_tokens: 20 },
  );
  const classificacao = resposta.toLowerCase().trim();
  if (classificacao.includes('aprendizado') || classificacao.includes('regra') || classificacao.includes('comportamento')) return 'aprendizado';
  if (classificacao.includes('patch') || classificacao.includes('editar') || classificacao.includes('corrigir') || classificacao.includes('substituir')) return 'patch';
  if (classificacao.includes('pergunta') || classificacao.includes('como') || classificacao.includes('o que')) return 'pergunta';
  return 'normal';
}

const TESTES_NATURAIS = [
  {
    descricao: 'Pedido de mudança de comportamento em recusas',
    mensagem: 'Quando o motorista recusar duas vezes, agradeça e pergunte se ele quer contato futuro',
    esperado: 'aprendizado',
  },
  {
    descricao: 'Pedido para ser mais educado',
    mensagem: 'Você precisa ser mais educado quando o motorista recusar',
    esperado: 'aprendizado',
  },
  {
    descricao: 'Edição direta de texto',
    mensagem: 'Muda a mensagem de boas vindas para algo mais informal',
    esperado: 'patch',
  },
  {
    descricao: 'Pergunta sobre comportamento',
    mensagem: 'Como você está respondendo agora?',
    esperado: 'pergunta',
  },
  {
    descricao: 'Conversa normal',
    mensagem: 'Bom dia, tudo bem?',
    esperado: 'normal',
  },
  {
    descricao: 'Regra específica de negócio',
    mensagem: 'Sempre ofereça frete de retorno quando a carga for de retorno',
    esperado: 'aprendizado',
  },
  {
    descricao: 'Correção de prompt',
    mensagem: 'Corrige o prompt para não pedir documentos que já temos',
    esperado: 'patch',
  },
  {
    descricao: 'Lista de regras',
    mensagem: 'Quais regras você está usando?',
    esperado: 'pergunta',
  },
  {
    descricao: 'Mudança de tom',
    mensagem: 'Seja mais simpático nas respostas',
    esperado: 'aprendizado',
  },
  {
    descricao: 'Ajuste específico',
    mensagem: 'Troca a frase de encerramento',
    esperado: 'patch',
  },
];

async function executarTestes() {
  console.log('=== BATERIA DE TESTES - CLASSIFICADOR DE INTENÇÃO ===\n');
  
  let acertos = 0;
  let erros = 0;
  
  for (const teste of TESTES_NATURAIS) {
    console.log(`\n📝 Teste: ${teste.descricao}`);
    console.log(`📨 Mensagem: "${teste.mensagem}"`);
    console.log(`🎯 Esperado: ${teste.esperado}`);
    
    try {
      const resultado = await classificarIntencaoTreinamento(teste.mensagem);
      console.log(`🔍 Resultado: ${resultado}`);
      
      if (resultado === teste.esperado) {
        console.log('✅ ACERTOU');
        acertos++;
      } else {
        console.log('❌ ERROU');
        erros++;
      }
      
    } catch (error) {
      console.log(`❌ Erro: ${error instanceof Error ? error.message : 'falha desconhecida'}`);
      erros++;
    }
    
    console.log('---');
    // Pequeno delay para não sobrecarregar a API
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n=== RESUMO ===');
  console.log(`✅ Acertos: ${acertos}/${TESTES_NATURAIS.length}`);
  console.log(`❌ Erros: ${erros}/${TESTES_NATURAIS.length}`);
  console.log(`📊 Taxa de acerto: ${((acertos / TESTES_NATURAIS.length) * 100).toFixed(1)}%`);
  
  if (erros > 0) {
    console.log('\n⚠️  Há classificações incorretas. O prompt do classificador pode precisar de ajuste.');
  } else {
    console.log('\n🎉 Todas as classificações estão corretas!');
  }
}

executarTestes().catch(console.error);
