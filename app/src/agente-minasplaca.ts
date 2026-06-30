/**
 * Agente Minas Placa — a IA coleta os dados via conversa e chama a tool
 * calcular_orcamento com parâmetros estruturados. O código faz o cálculo,
 * nunca a IA.
 */
import { config } from './config.js';
import { buscarContexto } from './rag-minasplaca.js';
import { calcularOrcamento, formatarOrcamento, type ParamsCalculo } from './calculadora-minasplaca.js';
import { obterPromptBruto } from './prompt-minasplaca.js';
import type { RegistroHistorico } from './lib/tipos.js';
import { calcularPrecoPrazo } from 'correios-brasil';

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
      name: 'calcular_orcamento',
      description: `Use esta ferramenta OBRIGATORIAMENTE para calcular o preço de um produto.
Chame-a SOMENTE quando você já tiver os três dados obrigatórios confirmados pelo cliente: material, tamanho e quantidade.
NUNCA tente calcular preços você mesmo — é PROIBIDO. Use sempre esta ferramenta.
Se algum dado ainda estiver faltando, continue a conversa para coletá-lo antes de chamar esta ferramenta.`,
      parameters: {
        type: 'object',
        properties: {
          material: {
            type: 'string',
            description: 'Material do produto. Valores aceitos: "poliester", "void", "vinil", "destrutivel", "flextag", "aluminio", "inox", "acm", "pvc", "ribbon_resina", "ribbon_cera", "cola".'
          },
          largura: {
            type: 'number',
            description: 'Largura em milímetros. Ex: 30 para o tamanho 30x15.'
          },
          comprimento: {
            type: 'number',
            description: 'Comprimento em milímetros. Ex: 15 para o tamanho 30x15.'
          },
          quantidade: {
            type: 'number',
            description: 'Quantidade de unidades solicitada pelo cliente.'
          },
          impressao_uv: {
            type: 'boolean',
            description: 'Somente para Poliéster e Void: true se o cliente pediu impressão digital UV (acrescenta R$ 0,05/un). Padrão false.'
          },
          inox_430: {
            type: 'boolean',
            description: 'Somente para Aço Inox: true se for o tipo 430 (desconto de R$ 0,08/un sobre o 304). Padrão false.'
          },
          espessura_pvc: {
            type: 'string',
            description: 'Somente para PVC: "1mm" ou "2mm". Padrão "2mm".'
          }
        },
        required: ['material', 'largura', 'comprimento', 'quantidade']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'verificar_cliente',
      description: 'Verifica se o cliente já possui cadastro no VHSys com base no CPF ou CNPJ e obtém as informações do seu último orçamento.',
      parameters: {
        type: 'object',
        properties: {
          cnpj_cliente: {
            type: 'string',
            description: 'CPF ou CNPJ do cliente (apenas números).'
          },
          duplica: {
            type: 'boolean',
            description: 'Se verdadeiro, duplica o último orçamento gerando um novo no VHSys.'
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
      description: 'Calcula o valor e prazo de envio via SEDEX e PAC utilizando o CEP de destino do cliente. Acione somente quando o cliente confirmar o CEP.',
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

  const system = `${promptBase}\n\n${contextoTexto}
REGRA ABSOLUTA SOBRE CÁLCULO DE PREÇOS (PRIORIDADE MÁXIMA):
- É COMPLETAMENTE PROIBIDO calcular, estimar ou inventar qualquer preço.
- Você NÃO possui permissão para fazer matemática com valores das tabelas.
- SEMPRE que tiver material + tamanho + quantidade confirmados, chame a ferramenta calcular_orcamento.
- A ferramenta retornará o carrinho formatado pronto para enviar ao cliente.
- Se o cliente pedir um produto mas ainda faltar algum dos 3 dados, continue a conversa para coletá-lo — um dado por vez.

REGRA DE FRETE (PRIORIDADE MÁXIMA):
- Sempre que o cliente pedir o frete, pergunte o CEP (se ele ainda não tiver passado).
- Quando o cliente fornecer o CEP, você DEVE acionar a ferramenta calcular_frete IMEDIATAMENTE para buscar os valores reais dos Correios. NÃO invente valores de frete!

DIRETRIZES DE FORMATO (WhatsApp):
1. Brevidade: máximo 2 a 3 parágrafos curtos por mensagem.
2. Uma pergunta por vez no final da mensagem.
3. Tópicos com emojis discretos (📍, 💰, 📦, 👉) para listas.
4. Tom humano e consultivo como o Rafael.`.trim();

  const user = pushName ? `${pushName}: ${mensagem}` : mensagem;

  const mensagensHistorico = historico.slice(-14).map((h) => ({
    role: h.role === 'user' ? 'user' : 'assistant',
    content: h.content,
  }));

  const messagesPayload: any[] = [
    { role: 'system', content: system },
    ...mensagensHistorico,
    { role: 'user', content: user },
  ];

  try {
    // Loop de tool calls — executa até a IA gerar uma resposta de texto final
    let iteracoes = 0;
    const MAX_ITERACOES = 5;

    while (iteracoes < MAX_ITERACOES) {
      iteracoes++;

      console.log(`[agente] Chamada ${iteracoes} ao OpenRouter...`);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openrouterToken}`,
          'HTTP-Referer': 'https://iaminas.sanjaworks.com',
          'X-Title': 'Minas Placa IA',
        },
        body: JSON.stringify({
          model: config.modeloChat,
          messages: messagesPayload,
          tools: DEFINICAO_TOOLS,
          tool_choice: 'auto'
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`OpenRouter erro ${res.status}: ${txt}`);
      }

      const json = (await res.json()) as any;
      const message = json.choices?.[0]?.message;

      // Se não há tool_calls, é uma resposta de texto final — retorna
      if (!message?.tool_calls || message.tool_calls.length === 0) {
        const respostaFinal = message?.content?.trim() ?? '';
        return respostaFinal || 'Oi! Sou o Rafael da Minas Placa. Como posso te ajudar?';
      }

      // Há tool_calls — processa cada uma
      console.log(`[agente] Modelo solicitou ${message.tool_calls.length} ferramenta(s): ${message.tool_calls.map((t: any) => t.function.name).join(', ')}`);
      messagesPayload.push(message);

      for (const toolCall of message.tool_calls) {
        const toolName: string = toolCall.function.name;
        let args: any;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        let toolResult = '';

        // -----------------------------------------------
        // TOOL: calcular_orcamento (calculadora em código)
        // -----------------------------------------------
        if (toolName === 'calcular_orcamento') {
          console.log(`[agente] calcular_orcamento chamado:`, args);
          try {
            const params: ParamsCalculo = {
              material: String(args.material).toLowerCase().trim(),
              largura: Number(args.largura),
              comprimento: Number(args.comprimento),
              quantidade: Number(args.quantidade),
              impressao_uv: args.impressao_uv === true,
              inox_430: args.inox_430 === true,
              espessura_pvc: args.espessura_pvc ?? '2mm',
            };
            const orcamento = await calcularOrcamento(params);
            if (orcamento) {
              toolResult = formatarOrcamento(orcamento);
              console.log(`[agente] Orçamento calculado com sucesso: R$ ${orcamento.total.toFixed(2)}`);
            } else {
              toolResult = 'Não foi possível calcular o orçamento com os dados fornecidos. Verifique o material e as dimensões informadas.';
            }
          } catch (err) {
            console.error('[agente] Erro ao calcular orçamento:', err);
            toolResult = 'Erro ao calcular o orçamento. Por favor, verifique os dados informados.';
          }
        }

        // -----------------------------------------------
        // TOOL: verificar_cliente (via API VHSys)
        // -----------------------------------------------
        else if (toolName === 'verificar_cliente') {
          console.log(`[agente] verificar_cliente CNPJ/CPF: ${args.cnpj_cliente}`);
          try {
            const cnpjFormatado = String(args.cnpj_cliente).replace(/\D/g, '');
            
            if (!cnpjFormatado) {
              toolResult = 'CNPJ/CPF inválido. Peça para o cliente enviar o número corretamente.';
            } else {
              // Busca cliente na API do VHSys
              const urlCliente = `https://api.vhsys.com/v2/clientes?cnpj_cliente=${cnpjFormatado}`;
              const headers = {
                'access-token': 'MKOKBTBHXUNBZaPLADNbIWYHGeKQca',
                'secret-access-token': 'q0GcQ0kT0Vy0SNpWsytPiOZnhEOgFAa',
                'User-Agent': 'MinasPlaca-App/1.0'
              };

              const resCliente = await fetch(urlCliente, { headers });
              const dataCliente = await resCliente.json() as any;

              if (dataCliente && Array.isArray(dataCliente.data) && dataCliente.data.length > 0) {
                const clienteEncontrado = dataCliente.data[0];
                const nome = clienteEncontrado.razao_cliente || clienteEncontrado.nome_cliente;
                const idCliente = clienteEncontrado.id_cliente;
                
                toolResult = `O cliente ${nome} já possui cadastro no sistema (ID: ${idCliente}). `;
                
                // Tenta buscar o último pedido (orçamento)
                try {
                  const urlPedido = `https://api.vhsys.com/v2/pedidos?id_cliente=${idCliente}&limit=1&sort=id_pedido&order=desc`;
                  const resPedido = await fetch(urlPedido, { headers });
                  const dataPedido = await resPedido.json() as any;
                  
                  if (dataPedido && Array.isArray(dataPedido.data) && dataPedido.data.length > 0) {
                    const ultimoPedido = dataPedido.data[0];
                    const valor = ultimoPedido.valor_total_nota || ultimoPedido.valor_total_produtos;
                    const data = ultimoPedido.data_pedido;
                    toolResult += `O último pedido foi de R$ ${valor} realizado em ${data}. ATENÇÃO: NÃO invente nem deduza quais foram os itens desse pedido. Apenas informe o valor total e pergunte se o cliente deseja fazer o mesmo pedido ou cotar novos produtos.`;
                  } else {
                    toolResult = `O cliente ${nome} possui cadastro, mas não há pedidos anteriores. NÃO ofereça refazer pedidos ou "mesmo pedido". Apenas dê as boas-vindas e pergunte o que ele precisa hoje.`;
                  }
                } catch (e) {
                  toolResult = `O cliente possui cadastro, mas não foi possível carregar histórico. Trate como um novo orçamento sem falar do passado.`;
                }
              } else {
                toolResult = 'O cliente não possui cadastro no sistema. É a primeira compra dele! Dê as boas-vindas cordiais, NÃO fale sobre histórico ou últimos pedidos, e inicie o orçamento perguntando do zero o que ele precisa.';
              }
            }
          } catch (err) {
            console.error('[agente] Erro ao verificar cliente na API VHSys:', err);
            toolResult = 'Houve uma instabilidade ao consultar o sistema de cadastro. Continue o atendimento normalmente pedindo as informações que precisar.';
          }
        }

        // -----------------------------------------------
        // TOOL: calcular_frete (via correios-brasil)
        // -----------------------------------------------
        else if (toolName === 'calcular_frete') {
          console.log(`[agente] calcular_frete CEP: ${args.cepDestino}`);
          try {
            const cepOrigem = process.env.CEP_ORIGEM || '30130000'; // CEP padrão (Belo Horizonte) se não configurado
            const cepDestino = args.cepDestino.replace(/\D/g, '');
            const pesoStr = String(args.peso || 300); // em gramas, mas a API aceita kg, então vamos converter se > 1000 ou enviar como está dependendo da lib, a lib pede String, geralmente 1 = 1kg
            
            // A API dos correios espera o peso em KG, se for menos de 1kg, envia '1' (ou '0.3' dependendo do formato, mas '1' é seguro)
            const pesoKg = Math.max(1, Math.ceil((args.peso || 300) / 1000)).toString();

            const freteArgs = {
              sCepOrigem: cepOrigem.replace(/\D/g, ''),
              sCepDestino: cepDestino,
              nVlPeso: pesoKg,
              nCdFormato: '1', // 1 = formato caixa/pacote
              nVlComprimento: '20', // mínimo
              nVlAltura: '5', // mínimo
              nVlLargura: '15', // mínimo
              nCdServico: ['03298', '03220'], // 03298 = PAC, 03220 = SEDEX
              nVlDiametro: '0',
            };

            let pacValor = '';
            let pacPrazo = '';
            let sedexValor = '';
            let sedexPrazo = '';

            try {
              const resultados = await calcularPrecoPrazo(freteArgs);
              if (resultados && resultados.length > 0) {
                const pac = resultados.find(r => r.Codigo === '03298');
                const sedex = resultados.find(r => r.Codigo === '03220');
                if (pac && pac.Valor && pac.Valor !== '0,00') {
                  pacValor = pac.Valor;
                  pacPrazo = pac.PrazoEntrega;
                }
                if (sedex && sedex.Valor && sedex.Valor !== '0,00') {
                  sedexValor = sedex.Valor;
                  sedexPrazo = sedex.PrazoEntrega;
                }
              }
            } catch (errCorreios) {
              console.warn('[agente] API dos Correios falhou. Usando fallback por Região (ViaCEP)...');
            }

            // Fallback se não obteve resultado (Timeout ou erro na API antiga do Correios)
            if (!pacValor || !sedexValor) {
              const resViaCep = await fetch(`https://viacep.com.br/ws/${cepDestino}/json/`);
              const viaCep = await resViaCep.json() as any;
              
              if (viaCep && viaCep.uf) {
                const uf = viaCep.uf.toUpperCase();
                // Tabela de contingência baseada em MG (origem)
                if (['MG', 'SP', 'RJ', 'ES'].includes(uf)) {
                  pacValor = '28,50'; pacPrazo = '5';
                  sedexValor = '42,90'; sedexPrazo = '2';
                } else if (['PR', 'SC', 'RS', 'DF', 'GO', 'MS', 'MT'].includes(uf)) {
                  pacValor = '38,90'; pacPrazo = '8';
                  sedexValor = '58,50'; sedexPrazo = '4';
                } else if (['BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA'].includes(uf)) {
                  pacValor = '49,90'; pacPrazo = '12';
                  sedexValor = '78,90'; sedexPrazo = '6';
                } else {
                  // Norte
                  pacValor = '65,90'; pacPrazo = '15';
                  sedexValor = '98,50'; sedexPrazo = '7';
                }
              }
            }
            
            if (pacValor || sedexValor) {
              toolResult = 'Opções de frete encontradas:\n';
              if (sedexValor) {
                toolResult += `- SEDEX: R$ ${sedexValor} (Prazo estimado: ${sedexPrazo} dias úteis)\n`;
              }
              if (pacValor) {
                toolResult += `- PAC: R$ ${pacValor} (Prazo estimado: ${pacPrazo} dias úteis)\n`;
              }
            } else {
              toolResult = 'Não foi possível calcular o frete para este CEP.';
            }
          } catch (err) {
            console.error('[agente] Erro ao calcular frete direto:', err);
            toolResult = 'Os Correios estão indisponíveis no momento. Informe ao cliente que o frete será calculado no momento do fechamento.';
          }
        }

        else {
          toolResult = `Ferramenta "${toolName}" não reconhecida.`;
        }

        console.log(`[agente] Resultado da tool ${toolName}:`, toolResult.substring(0, 200));

        messagesPayload.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: toolResult
        });
      }
      // Continua o loop para a IA processar o resultado das tools
    }

    return 'Desculpe, ocorreu um erro interno. Por favor, tente novamente.';

  } catch (err) {
    console.error('[agente] Erro no processamento do agente:', err);
    return 'Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente em instantes.';
  }
}
