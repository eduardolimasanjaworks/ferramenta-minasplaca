/**
 * Agente Minas Placa — gera resposta via LLM com RAG, calculadora e chamadas de tools (n8n).
 */
import { config } from './config.js';
import { buscarContexto } from './rag-minasplaca.js';
import { calcularOrcamento, formatarOrcamento } from './calculadora-minasplaca.js';
import { obterPromptBruto } from './prompt-minasplaca.js';
import type { RegistroHistorico } from './lib/tipos.js';

interface OpcoesResposta {
  telefone: string;
  mensagem: string;
  historico: RegistroHistorico[];
  pushName?: string;
}

// Definição das ferramentas (tools) compatíveis com a API do OpenRouter
const DEFINICAO_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'verificar_cliente',
      description: 'Verifica se o cliente já possui cadastro no VHSys com base no CPF ou CNPJ e obtém as informações do seu último pedido.',
      parameters: {
        type: 'object',
        properties: {
          cnpj_cliente: {
            type: 'string',
            description: 'CPF ou CNPJ do cliente (apenas números).'
          },
          duplica: {
            type: 'boolean',
            description: 'Se verdadeiro, duplica o último pedido gerando um novo orçamento no VHSys.'
          }
        },
        required: ['cnpj_cliente']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calcular_frete',
      description: 'Calcula o valor e prazo de envio via SEDEX e PAC utilizando o CEP de destino do cliente.',
      parameters: {
        type: 'object',
        properties: {
          cepDestino: {
            type: 'string',
            description: 'CEP de destino do cliente (apenas números).'
          },
          peso: {
            type: 'number',
            description: 'Peso total em gramas (opcional, padrão 300g).'
          },
          coProduto: {
            type: 'string',
            description: 'Código do serviço (opcional: "03220" para SEDEX, "03298" para PAC).'
          }
        },
        required: ['cepDestino']
      }
    }
  }
];

export async function gerarRespostaAgente(opts: OpcoesResposta): Promise<string> {
  const { mensagem, historico, pushName } = opts;

  const promptBase = await obterPromptBruto();
  const contexto = await buscarContexto(mensagem);
  const contextoTexto = contexto.length
    ? `Contexto relevante:\n${contexto.map((c) => `- ${c}`).join('\n')}\n\n`
    : '';

  const system = `${promptBase}\n\n${contextoTexto}Você é a assistente comercial da Minas Placa. 

DIRETRIZES DE FORMATO E COMPORTAMENTO DE RESPOSTA (CRÍTICO):
1. **Brevidade Extrema:** Seja muito breve, direta e natural. Mensagens curtas e dinâmicas (máximo de 2 a 3 parágrafos pequenos).
2. **Uma Pergunta por Vez:** Faça **apenas uma única pergunta por vez** no final da mensagem. Nunca acumule várias perguntas em uma única interação para não confundir o cliente.
3. **Organização em Tópicos:** Sempre que precisar apresentar listas, especificações técnicas, preços ou opções, organize as informações em tópicos limpos utilizando emojis discretos no início (ex: 📍, 💰, 📦, 👉) para facilitar a leitura rápida.
4. **Escaneabilidade Visual:** Use quebras de linha duplas para separar claramente a saudação, o conteúdo principal e a chamada para ação (pergunta final).
5. **Tom Humano:** Evite respostas longas, cansativos ou excessivamente formais. Adapte-se ao tom do cliente.
6. **Orçamento:** Quando o cliente pedir orçamento, use estritamente os valores calculados abaixo.`.trim();

  const orcamento = await calcularOrcamento(mensagem);
  const orcamentoTexto = orcamento ? formatarOrcamento(orcamento) : '';
  const user = pushName ? `${pushName}: ${mensagem}` : mensagem;
  const userComOrcamento = orcamentoTexto
    ? `${user}\n\n${orcamentoTexto}`
    : user;

  const mensagensHistorico = historico.slice(-10).map((h) => ({
    role: h.role === 'user' ? 'user' : 'assistant',
    content: h.content,
  }));

  const messagesPayload: any[] = [
    { role: 'system', content: system },
    ...mensagensHistorico,
    { role: 'user', content: userComOrcamento },
  ];

  try {
    // 1. Primeira chamada ao LLM (com suporte a Tools)
    const body = {
      model: config.modeloChat,
      messages: messagesPayload,
      tools: DEFINICAO_TOOLS,
      tool_choice: 'auto'
    };

    console.log('[agente] Enviando requisição inicial para o OpenRouter...');
    let res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openrouterToken}`,
        'HTTP-Referer': 'https://iaminas.sanjaworks.com',
        'X-Title': 'Minas Placa IA',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenRouter erro ${res.status}: ${txt}`);
    }

    let json = (await res.json()) as any;
    let message = json.choices?.[0]?.message;

    // Se o modelo decidir chamar alguma ferramenta (tool_calls)
    if (message?.tool_calls && message.tool_calls.length > 0) {
      console.log(`[agente] Modelo solicitou a execução de ${message.tool_calls.length} ferramenta(s)`);
      
      // Adiciona a resposta do assistente (que contém a solicitação do tool call) ao histórico de mensagens da chamada
      messagesPayload.push(message);

      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        let toolResult = '';

        if (toolName === 'verificar_cliente') {
          console.log(`[agente] Executando verificar_cliente para CNPJ/CPF: ${args.cnpj_cliente}`);
          try {
            const webhookUrl = `${config.n8nUrl}/webhook/verifica_cliente_duplica`;
            const n8nRes = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cnpj_cliente: args.cnpj_cliente,
                duplica: args.duplica ?? false
              })
            });
            if (n8nRes.ok) {
              const n8nData = await n8nRes.json() as { prompt?: string };
              toolResult = n8nData.prompt ?? 'Cliente verificado com sucesso.';
            } else {
              toolResult = `Erro na integração (Status ${n8nRes.status}).`;
            }
          } catch (err) {
            console.error('[agente] Erro ao chamar webhook verificar_cliente:', err);
            toolResult = 'Não foi possível conectar ao sistema de verificação de cadastro.';
          }
        } 
        else if (toolName === 'calcular_frete') {
          console.log(`[agente] Executando calcular_frete para CEP: ${args.cepDestino}`);
          try {
            const queryParams = new URLSearchParams({
              cepDestino: args.cepDestino,
              psObjeto: String(args.peso ?? 300),
              coProduto: args.coProduto ?? '03298'
            });
            const webhookUrl = `${config.n8nUrl}/webhook/calcula-frete22?${queryParams.toString()}`;
            const n8nRes = await fetch(webhookUrl, {
              method: 'POST', // O n8n está configurado como POST no nó Webhook1
              headers: { 'Content-Type': 'application/json' }
            });
            if (n8nRes.ok) {
              const n8nData = await n8nRes.json() as { prompt?: string };
              toolResult = n8nData.prompt ?? 'Frete calculado com sucesso.';
            } else {
              toolResult = `Erro na integração de frete (Status ${n8nRes.status}).`;
            }
          } catch (err) {
            console.error('[agente] Erro ao chamar webhook calcular_frete:', err);
            toolResult = 'Não foi possível calcular o frete através do sistema dos Correios.';
          }
        }

        console.log(`[agente] Resultado obtido para a tool ${toolName}:`, toolResult);

        // Envia o resultado do tool call de volta para a conversa
        messagesPayload.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: toolResult
        });
      }

      // 2. Segunda chamada ao LLM (passando os resultados das ferramentas)
      console.log('[agente] Enviando resultados das ferramentas de volta para o OpenRouter...');
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openrouterToken}`,
          'HTTP-Referer': 'https://iaminas.sanjaworks.com',
          'X-Title': 'Minas Placa IA',
        },
        body: JSON.stringify({
          model: config.modeloChat,
          messages: messagesPayload
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`OpenRouter erro pós-tool ${res.status}: ${txt}`);
      }

      json = (await res.json()) as any;
      message = json.choices?.[0]?.message;
    }

    const respostaFinal = message?.content?.trim() ?? '';
    return respostaFinal || 'Oi! Sou a assistente da Minas Placa. Como posso te ajudar?';

  } catch (err) {
    console.error('[agente] Erro no processamento do agente:', err);
    return 'Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente em instantes.';
  }
}
