/**
 * Agente Minas Placa — a IA coleta os dados via conversa e chama a tool
 * calcular_orcamento com parâmetros estruturados. O código faz o cálculo,
 * nunca a IA.
 */
import pg from 'pg';
import { config } from './config.js';
import { buscarContexto } from './rag-minasplaca.js';
import { calcularOrcamento, formatarOrcamento, type ParamsCalculo } from './calculadora-minasplaca.js';
import { obterPromptBruto } from './prompt-minasplaca.js';
import type { RegistroHistorico } from './lib/tipos.js';
import { calcularPrecoPrazo } from 'correios-brasil';
import { obterEstadoCliente, salvarEstadoCliente } from './estado-minasplaca.js';

const dbPool = new pg.Pool({ connectionString: config.databaseUrl });

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
Chame-a SOMENTE quando você já tiver todos os dados obrigatórios confirmados pelo cliente: material, tamanho, quantidade (e a espessura obrigatória se o material for PVC).
NUNCA tente calcular preços você mesmo — é PROIBIDO. Use sempre esta ferramenta.
Se algum dado obrigatório ainda estiver faltando (ex: falta a espessura do PVC), NÃO chame a ferramenta. Continue a conversa para coletá-lo primeiro.`,
      parameters: {
        type: 'object',
        properties: {
          itens: {
            type: 'array',
            description: 'Lista de produtos/itens no carrinho para cotar. Envie SEMPRE todos os itens que o cliente pediu até o momento.',
            items: {
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
                  description: 'Quantidade de unidades.'
                },
                impressao_uv: {
                  type: 'boolean',
                  description: 'Somente para Poliéster e Void: true se pediu digital UV.'
                },
                inox_430: {
                  type: 'boolean',
                  description: 'Somente para Aço Inox: true se for tipo 430.'
                },
                espessura_pvc: {
                  type: 'string',
                  description: 'Somente para PVC: "1mm" ou "2mm".'
                }
              },
              required: ['material', 'largura', 'comprimento', 'quantidade']
            }
          }
        },
        required: ['itens']
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
      description: 'Calcula o valor e prazo de envio via SEDEX e PAC utilizando o CEP de destino do cliente. Passe a lista de itens com material e quantidade para cálculo exato de peso no backend.',
      parameters: {
        type: 'object',
        properties: {
          cepDestino: {
            type: 'string',
            description: 'CEP de destino do cliente (apenas números).'
          },
          itens: {
            type: 'array',
            description: 'Lista de itens no carrinho para cálculo de peso.',
            items: {
              type: 'object',
              properties: {
                material: {
                  type: 'string',
                  description: 'Nome do material do produto (ex: aluminio, pvc, poliester).'
                },
                quantidade: {
                  type: 'number',
                  description: 'Quantidade de peças.'
                }
              },
              required: ['material', 'quantidade']
            }
          },
          peso: {
            type: 'number',
            description: 'Peso total em gramas (opcional).'
          }
        },
        required: ['cepDestino']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'gerar_preview_patrimonial',
      description: `Gera e envia um preview/layout das placas patrimoniais para o cliente.
REGRA DE USO OBRIGATÓRIA: Esta ferramenta SÓ pode ser chamada quando TODAS as condições abaixo forem verdadeiras:
1. O cliente já respondeu as 3 perguntas de configuração (furos, código de barras, QR code).
2. O cliente JÁ ENVIOU a imagem da logo/logotipo, que aparece no histórico como [Imagem: URL] ou [Arquivo: URL].
Se qualquer uma dessas condições NÃO for verdadeira, NÃO chame esta ferramenta. Continue a conversa para coletar o que falta.
Use o URL da imagem do histórico como o parâmetro link_logo.`,
      parameters: {
        type: 'object',
        properties: {
          link_logo: {
            type: 'string',
            description: 'URL da imagem ou logotipo do cliente para estampar na placa.'
          },
          furos: {
            type: 'string',
            enum: ['sim', 'não'],
            description: 'Se a simulação deve incluir furos nas laterais da placa. Padrão "não".'
          },
          barras: {
            type: 'string',
            enum: ['sim', 'não'],
            description: 'Se a simulação deve incluir código de barras. Padrão "não".'
          },
          qrcode: {
            type: 'string',
            enum: ['sim', 'não'],
            description: 'Se a simulação deve incluir QR Code. Padrão "não".'
          }
        },
        required: ['link_logo']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'atualizar_dados_cliente',
      description: 'Salva ou atualiza os dados estruturados do cliente e o carrinho no banco de dados. Chame esta ferramenta SEMPRE que o cliente informar ou confirmar algum desses dados (ex: nome, CPF/CNPJ, CEP, itens de compra, opções de layout, ou se o layout foi aprovado). Use-a somente para dados confirmados pelo cliente.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome do cliente' },
          documento: { type: 'string', description: 'CPF ou CNPJ do cliente (somente números)' },
          cep: { type: 'string', description: 'CEP de entrega do cliente (somente números)' },
          itens: {
            type: 'array',
            description: 'Lista de produtos cotados ou adicionados ao carrinho.',
            items: {
              type: 'object',
              properties: {
                material: { type: 'string', description: 'Material do produto' },
                largura: { type: 'number', description: 'Largura em mm' },
                comprimento: { type: 'number', description: 'Comprimento em mm' },
                quantidade: { type: 'number', description: 'Quantidade de peças' },
                espessura_pvc: { type: 'string', description: 'Espessura se for PVC ("1mm" ou "2mm")' }
              },
              required: ['material', 'largura', 'comprimento', 'quantidade']
            }
          },
          furos: { type: 'string', enum: ['sim', 'não'], description: 'Se deseja furos na placa' },
          barras: { type: 'string', enum: ['sim', 'não'], description: 'Se deseja código de barras' },
          qrcode: { type: 'string', enum: ['sim', 'não'], description: 'Se deseja QR Code' },
          link_logo: { type: 'string', description: 'URL ou link do logotipo enviado' },
          layout_aprovado: { type: 'boolean', description: 'Se o layout/preview do PDF foi aprovado pelo cliente' },
          observacoes: { type: 'string', description: 'Notas ou observações adicionais sobre o atendimento' }
        }
      }
    }
  }
];

export async function gerarRespostaAgente(opts: OpcoesResposta): Promise<string> {
  const { telefone, mensagem, historico, pushName } = opts;

  const promptBase = await obterPromptBruto();
  const estado = await obterEstadoCliente(telefone);
  let estadoTexto = '';
  if (estado && Object.keys(estado).length > 0) {
    const dataHora = estado.atualizado_em ? new Date(estado.atualizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'não definida';
    estadoTexto = `📌 FICHA CADASTRAL E ESTADO ATUAL DO CLIENTE (Última atualização: ${dataHora}):\n`;
    if (estado.nome) estadoTexto += `- Nome do Cliente: ${estado.nome}\n`;
    if (estado.documento) estadoTexto += `- CPF/CNPJ: ${estado.documento}\n`;
    if (estado.cep) estadoTexto += `- CEP de entrega: ${estado.cep}\n`;
    if (estado.itens && Array.isArray(estado.itens) && estado.itens.length > 0) {
      estadoTexto += `- Carrinho de Compras / Itens Cotados:\n`;
      estado.itens.forEach((it: any, index: number) => {
        const espessura = it.espessura_pvc ? ` (Espessura: ${it.espessura_pvc})` : '';
        estadoTexto += `  • Item ${index + 1}: ${it.quantidade} un. de ${it.material} no tamanho ${it.largura}x${it.comprimento} mm${espessura}\n`;
      });
    }
    if (estado.furos) estadoTexto += `- Furos no Layout: ${estado.furos}\n`;
    if (estado.barras) estadoTexto += `- Código de Barras: ${estado.barras}\n`;
    if (estado.qrcode) estadoTexto += `- QR Code: ${estado.qrcode}\n`;
    if (estado.link_logo) estadoTexto += `- Link do Logotipo: ${estado.link_logo}\n`;
    if (estado.layout_aprovado !== undefined) estadoTexto += `- Layout Aprovado pelo Cliente: ${estado.layout_aprovado ? 'SIM' : 'NÃO'}\n`;
    if (estado.observacoes) estadoTexto += `- Observações: ${estado.observacoes}\n`;
    estadoTexto += `=========================================\n\n`;
  }

  const contexto = await buscarContexto(mensagem);
  const contextoTexto = contexto.length
    ? `Contexto relevante:\n${contexto.map((c) => `- ${c}`).join('\n')}\n\n`
    : '';

  // ALERTA DE FLUXO CRÍTICO (APLICAÇÃO PATRIMONIAL DETECTADA)
  const historicoTextoCompleto = (historico.map(h => h.content).join(' ') + ' ' + mensagem).toLowerCase();
  
  let ePatrimonial = historicoTextoCompleto.includes('patrimon') || 
                     historicoTextoCompleto.includes('tombamento') || 
                     historicoTextoCompleto.includes('bens') || 
                     historicoTextoCompleto.includes('máquina') || 
                     historicoTextoCompleto.includes('ativo') || 
                     historicoTextoCompleto.includes('equipamento');
                     
  let temLayoutNoHistorico = historicoTextoCompleto.includes('simulacao-placa.pdf') || 
                             historicoTextoCompleto.includes('gerar_preview_patrimonial') || 
                             historicoTextoCompleto.includes('layout da sua placa');

  // Faz uma busca profunda no banco de dados para evitar perdas devido ao limite de fatiamento do histórico (slice),
  // limitando a busca à sessão ativa (mensagens das últimas 24 horas e após a última transferência de atendimento).
  try {
    // 1. Localiza a última transferência nas últimas 24 horas
    const resUltimaTransf = await dbPool.query(
      `SELECT COALESCE(MAX(timestamp), '1970-01-01 00:00:00+00'::timestamptz) AS ultima_transferencia 
       FROM historico_conversa 
       WHERE telefone = $1 
         AND timestamp >= NOW() - INTERVAL '24 hours'
         AND (content ILIKE '%Transferindo%' OR content ILIKE '%TRANSFERIR%')`,
      [telefone]
    );
    const ultimaTransferencia = resUltimaTransf.rows[0]?.ultima_transferencia || '1970-01-01 00:00:00+00';

    // 2. Verifica se houve menção a patrimonial na sessão ativa
    const resPatrimonial = await dbPool.query(
      `SELECT EXISTS (
        SELECT 1 FROM historico_conversa 
        WHERE telefone = $1 
          AND timestamp >= NOW() - INTERVAL '24 hours'
          AND timestamp > $2
          AND (
            content ILIKE '%patrimon%' 
            OR content ILIKE '%tombamento%' 
            OR content ILIKE '%bens%' 
            OR content ILIKE '%máquina%' 
            OR content ILIKE '%ativo%' 
            OR content ILIKE '%equipamento%'
          )
      ) AS e_patrimonial`,
      [telefone, ultimaTransferencia]
    );
    if (resPatrimonial.rows[0]?.e_patrimonial === true) {
      ePatrimonial = true;
    }

    // 3. Verifica se o layout foi gerado na sessão ativa
    const resLayout = await dbPool.query(
      `SELECT EXISTS (
        SELECT 1 FROM historico_conversa 
        WHERE telefone = $1 
          AND timestamp >= NOW() - INTERVAL '24 hours'
          AND timestamp > $2
          AND (
            content ILIKE '%simulacao-placa.pdf%' 
            OR content ILIKE '%gerar_preview_patrimonial%' 
            OR content ILIKE '%layout da sua placa%'
          )
      ) AS tem_layout`,
      [telefone, ultimaTransferencia]
    );
    if (resLayout.rows[0]?.tem_layout === true) {
      temLayoutNoHistorico = true;
    }
  } catch (err) {
    console.error('[agente] Erro ao consultar histórico da sessão ativa no banco:', err);
  }

  let warningPrompt = '';
  if (ePatrimonial && !temLayoutNoHistorico) {
    warningPrompt = `⚠️ ALERTA DE FLUXO CRÍTICO (APLICAÇÃO PATRIMONIAL DETECTADA):
- O cliente informou que a aplicação das placas é PATRIMONIAL ou similar.
- O layout/preview ainda NÃO foi gerado ou enviado.
- É ESTRITAMENTE PROIBIDO enviar o resumo final da cotação (com o formato 🛒 RESUMO DA COTAÇÃO, #carrinho_compras#, etc.) ou se despedir/transferir o cliente, A MENOS que o cliente tenha explicitamente recusado a simulação de layout.
- Se o cliente escolheu a modalidade de frete (PAC/SEDEX), você DEVE obrigatoriamente fazer a pergunta do layout agora:
  "O frete via [Modalidade Escolhida] ficou em R$ [Valor]. Como o seu uso é patrimonial, gostaria de ver uma simulação/layout de como ficaria a sua placa com o seu logotipo antes de fecharmos?"
- Se o cliente já aceitou fazer o layout (ex: "quero fazer layout"), continue coletando os dados do layout (furos, código de barras, QR code e imagem do logotipo). NÃO envie o resumo final!
- Só envie o resumo final após a aprovação do layout/preview gerado pela ferramenta.

=========================================\n\n`;
  }

  const system = `${warningPrompt}${estadoTexto}${promptBase}\n\n${contextoTexto}
REGRA ABSOLUTA SOBRE CÁLCULO DE PREÇOS (PRIORIDADE MÁXIMA):
- É COMPLETAMENTE PROIBIDO calcular, estimar ou inventar qualquer preço.
- Você NÃO possui permissão para fazer matemática com valores das tabelas.
- SEMPRE que tiver material + tamanho + quantidade confirmados, chame a ferramenta calcular_orcamento.
- A ferramenta retornará o carrinho formatado pronto para enviar ao cliente.
- Se o cliente pedir um produto mas ainda faltar algum dos 3 dados, continue a conversa para coletá-lo — um dado por vez.

REGRA DE GERENCIAMENTO DE ESTADO (PRIORIDADE MÁXIMA):
- Você possui acesso à ferramenta 'atualizar_dados_cliente'.
- Sempre que o cliente fornecer ou confirmar novos dados (como nome, CPF/CNPJ, CEP, itens de compra, opções de layout ou aprovação do layout), chame IMEDIATAMENTE a ferramenta 'atualizar_dados_cliente' para manter a ficha cadastral do cliente atualizada no banco.
- NÃO tente adivinhar ou inventar dados; grave apenas dados confirmados e reais.
- O histórico de mensagens está resumido em apenas 15 mensagens mais recentes. Para se localizar sobre o que o cliente deseja e onde a conversa parou, use a 'FICHA CADASTRAL E ESTADO ATUAL DO CLIENTE' fornecida acima.

REGRA DE FRETE (PRIORIDADE MÁXIMA):
- Sempre que o cliente pedir o frete, pergunte o CEP (se ele ainda não tiver passado).
- Quando o cliente fornecer o CEP, você DEVE acionar a ferramenta calcular_frete IMEDIATAMENTE para buscar os valores reais dos Correios. NÃO invente valores de frete!

REGRA CRÍTICA DE LOGOTIPO E LAYOUT (PRIORIDADE MÁXIMA):
- Se o cliente declarou na conversa que a aplicação é PATRIMONIAL (ou controle de bens, tombamento, identificação de máquinas/ativos/equipamentos), você é OBRIGADO a seguir a "🛑 REGRA CRÍTICA DO LOGOTIPO / PREVIEW" do prompt:
  1. Primeiro pergunte se ele quer ver o layout: "Gostaria de ver uma simulação/layout de como ficaria a sua placa com o seu logotipo antes de fecharmos?"
  2. Se sim, faça as 3 perguntas (furos, código de barras, QR Code) e aguarde a resposta.
  3. Depois peça o logotipo e aguarde a imagem chegar ([Imagem: URL] ou [Arquivo: URL]).
  4. Só então gere a simulação com a ferramenta 'gerar_preview_patrimonial'.
- É ESTRITAMENTE PROIBIDO enviar o resumo final ou falar de transferência para consultores sem passar por essa jornada de layout se a aplicação for patrimonial!

DIRETRIZES DE FORMATO (WhatsApp):
1. Brevidade: máximo 2 a 3 parágrafos curtos por mensagem.
2. Uma pergunta por vez no final da mensagem.
3. Tópicos com emojis discretos (📍, 💰, 📦, 👉) para listas.
4. Tom humano e consultivo como o Rafael.`.trim();

  const user = mensagem;

  const mensagensHistorico = historico.slice(-15).map((h) => ({
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
          tool_choice: 'auto',
          max_tokens: 4000,
          temperature: 0.3
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
            let paramsArray: ParamsCalculo[] = [];
            
            if (args.itens && Array.isArray(args.itens)) {
              paramsArray = args.itens.map((item: any) => ({
                material: String(item.material || '').toLowerCase().trim(),
                largura: Number(item.largura),
                comprimento: Number(item.comprimento),
                quantidade: Number(item.quantidade),
                impressao_uv: item.impressao_uv === true,
                inox_430: item.inox_430 === true,
                espessura_pvc: item.espessura_pvc ?? '2mm',
              }));
            } else {
              paramsArray = [{
                material: String(args.material || '').toLowerCase().trim(),
                largura: Number(args.largura),
                comprimento: Number(args.comprimento),
                quantidade: Number(args.quantidade),
                impressao_uv: args.impressao_uv === true,
                inox_430: args.inox_430 === true,
                espessura_pvc: args.espessura_pvc ?? '2mm',
              }];
            }
            
            const orcamento = await calcularOrcamento(paramsArray);
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
          console.log(`[agente] verificar_cliente CNPJ/CPF recebido: ${args.cnpj_cliente}`);
          try {
            const digitos = String(args.cnpj_cliente).replace(/\D/g, '');
            
            if (!digitos) {
              toolResult = 'CNPJ/CPF inválido. Peça para o cliente enviar o número corretamente.';
            } else {
              // Formata para o padrão brasileiro de pontuação
              let docFormatado = digitos;
              if (digitos.length === 14) {
                docFormatado = digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
              } else if (digitos.length === 11) {
                docFormatado = digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
              }

              const headers = {
                'access-token': 'MKOKBTBHXUNBZaPLADNbIWYHGeKQca',
                'secret-access-token': 'q0GcQ0kT0Vy0SNpWsytPiOZnhEOgFAa',
                'User-Agent': 'MinasPlaca-App/1.0'
              };

              console.log(`[agente] buscando no VHSys com documento formatado: ${docFormatado}`);
              let urlCliente = `https://api.vhsys.com/v2/clientes?cnpj_cliente=${encodeURIComponent(docFormatado)}`;
              let resCliente = await fetch(urlCliente, { headers });
              let dataCliente = await resCliente.json() as any;

              // Se não encontrou com pontuação, tenta buscar apenas com os dígitos limpos
              if (!dataCliente || !Array.isArray(dataCliente.data) || dataCliente.data.length === 0) {
                console.log(`[agente] não encontrado com pontuação. Tentando apenas dígitos: ${digitos}`);
                urlCliente = `https://api.vhsys.com/v2/clientes?cnpj_cliente=${digitos}`;
                resCliente = await fetch(urlCliente, { headers });
                dataCliente = await resCliente.json() as any;
              }

              if (dataCliente && Array.isArray(dataCliente.data) && dataCliente.data.length > 0) {
                const clienteEncontrado = dataCliente.data[0];
                const idCliente = clienteEncontrado.id_cliente;
                const razaoSocial = clienteEncontrado.razao_cliente || clienteEncontrado.nome_destinatario_cliente || '';
                
                toolResult = `Cadastro localizado (ID: ${idCliente}, Razão Social/Nome: ${razaoSocial}). `;
                
                // Tenta buscar o último pedido (orçamento)
                try {
                  const urlPedido = `https://api.vhsys.com/v2/pedidos?id_cliente=${idCliente}&limit=1&sort=id_pedido&order=desc`;
                  const resPedido = await fetch(urlPedido, { headers });
                  const dataPedido = await resPedido.json() as any;
                  
                  if (dataPedido && Array.isArray(dataPedido.data) && dataPedido.data.length > 0) {
                    const ultimoPedido = dataPedido.data[0];
                    const valor = ultimoPedido.valor_total_nota || ultimoPedido.valor_total_produtos;
                    const data = ultimoPedido.data_pedido;
                    toolResult += `Último pedido localizado: R$ ${valor} em ${data}.`;
                  } else {
                    toolResult += `Sem histórico de pedidos anteriores cadastrados.`;
                  }
                } catch (e) {
                  toolResult += `Não foi possível consultar os pedidos anteriores.`;
                }
              } else {
                toolResult = 'Cliente não encontrado no sistema.';
              }
            }
          } catch (err) {
            console.error('[agente] Erro ao verificar cliente na API VHSys:', err);
            toolResult = 'Houve uma instabilidade ao consultar o sistema de cadastro. Continue o atendimento normalmente pedindo as informações que precisar.';
          }
        }

        // -----------------------------------------------
        // TOOL: gerar_preview_patrimonial (Simulação layout)
        // -----------------------------------------------
        else if (toolName === 'gerar_preview_patrimonial') {
          console.log(`[agente] gerar_preview_patrimonial chamado:`, args);
          try {
            const linkLogo = String(args.link_logo);
            const furos = args.furos === 'sim' ? 'sim' : 'não';
            const barras = args.barras === 'sim' ? 'sim' : 'não';
            const qrcode = args.qrcode === 'sim' ? 'sim' : 'não';

            let imagemParaLayout = linkLogo;

            // Se for uma URL do Directus contendo /assets/, baixamos e convertemos para base64
            if (linkLogo.includes('/assets/')) {
              try {
                console.log(`[agente] Carregando imagem do Directus para conversao base64: ${linkLogo}`);
                const headers: Record<string, string> = {};
                if (config.directusToken) {
                  headers['Authorization'] = `Bearer ${config.directusToken}`;
                }
                const resMidia = await fetch(linkLogo, { headers });
                if (resMidia.ok) {
                  const arrBuffer = await resMidia.arrayBuffer();
                  const buffer = Buffer.from(arrBuffer);
                  const mimeType = resMidia.headers.get('content-type') || 'image/jpeg';
                  imagemParaLayout = `data:${mimeType};base64,${buffer.toString('base64')}`;
                  console.log(`[agente] Imagem convertida para base64 com sucesso. Mime: ${mimeType}`);
                } else {
                  console.error(`[agente] Falha ao buscar imagem no Directus (${resMidia.status}):`, await resMidia.text());
                }
              } catch (e) {
                console.error(`[agente] Erro ao carregar imagem do Directus:`, e);
              }
            }

            // Seleção de templateID equivalente às condicionais do n8n
            let templateId = 'template-1777527773246'; // Padrão sem furos, sem barras, sem qrcode (ou com qrcode)
            let incluirDelivery = false;

            if (furos === 'sim' && barras === 'sim' && qrcode !== 'sim') {
              templateId = 'template-1777527533067';
              incluirDelivery = true;
            } else if (furos !== 'sim' && barras === 'sim' && qrcode !== 'sim') {
              templateId = 'template-1777527333570';
              incluirDelivery = true;
            } else if (furos === 'sim' && barras !== 'sim' && qrcode === 'sim') {
              templateId = 'template-1777527656477';
              incluirDelivery = true;
            } else if (furos === 'sim' && barras !== 'sim' && qrcode !== 'sim') {
              templateId = 'template-1777527859311';
              incluirDelivery = false;
            } else if (furos !== 'sim' && barras !== 'sim' && qrcode === 'sim') {
              templateId = 'template-1777527773246';
              incluirDelivery = true;
            } else if (furos !== 'sim' && barras !== 'sim' && qrcode !== 'sim') {
              templateId = 'template-1777527773246';
              incluirDelivery = false;
            }

            const payloadBody: any = {
              templateId,
              data: {
                imagem_1: imagemParaLayout
              }
            };
            if (incluirDelivery) {
              payloadBody.data.delivery = 'link';
            }

            console.log(`[agente] Requisitando simulação de PDF para o template ${templateId}`);
            const resPdf = await fetch('https://editor.propostas.sanjaworks.com/api/gerar-pdf', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payloadBody)
            });

            if (!resPdf.ok) {
              throw new Error(`Erro no serviço de PDF: ${resPdf.status} ${resPdf.statusText}`);
            }

            const dataPdf = await resPdf.json() as any;
            const linkPdf = dataPdf.link;

            if (linkPdf) {
              console.log(`[agente] PDF gerado com sucesso: ${linkPdf}`);
              
              // Envia o PDF via Evolution API
              const urlSendMedia = `${config.evolutionUrl}/message/sendMedia/${config.evolutionInstance}`;
              const resMedia = await fetch(urlSendMedia, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  apikey: config.evolutionApiKey
                },
                body: JSON.stringify({
                  number: telefone,
                  mediatype: 'document',
                  media: linkPdf,
                  fileName: 'simulacao-placa.pdf',
                  caption: 'Aqui está a simulação do layout da sua placa!',
                  options: {
                    delay: 1200,
                    presence: 'composing'
                  }
                })
              });

              if (resMedia.ok) {
                toolResult = `Preview gerado e enviado com sucesso para o WhatsApp do cliente! Link do PDF: ${linkPdf}. Confirme na sua resposta de texto que o preview foi enviado no chat para ele visualizar.`;
              } else {
                const txtErr = await resMedia.text();
                console.error(`[agente] Erro ao enviar media via Evolution:`, txtErr);
                toolResult = `O layout foi gerado com sucesso (Link: ${linkPdf}), mas ocorreu uma falha ao enviar o arquivo de forma direta. Envie este link de visualização na sua resposta de texto para o cliente: ${linkPdf}`;
              }
            } else {
              toolResult = 'O serviço de PDF não retornou o link do arquivo gerado.';
            }
          } catch (err) {
            console.error('[agente] Erro na ferramenta gerar_preview_patrimonial:', err);
            toolResult = 'Houve um erro técnico ao gerar a simulação do layout. Continue o atendimento informando que tentará enviar o layout em instantes.';
          }
        }

        // -----------------------------------------------
        // TOOL: calcular_frete (via webhook n8n / Correios)
        // -----------------------------------------------
        else if (toolName === 'calcular_frete') {
          console.log(`[agente] calcular_frete CEP: ${args.cepDestino}`);
          try {
            const cepDestino = String(args.cepDestino || '').replace(/\D/g, '');
            
            // 1. Cálculo de Peso Programático
            let pesoTotalGrams = 300; // Padrão mínimo
            if (args.itens && Array.isArray(args.itens)) {
              let pesoCalculado = 0;
              for (const item of args.itens) {
                const materialLower = String(item.material ?? item.nome ?? item.desc_produto ?? item.produto ?? '').toLowerCase().trim();
                const qtd = Number(item.quantidade ?? item.qtd ?? item.qtde ?? item.quantity) || 0;
                
                // Etiquetas (Vinil, Poliéster, Void, Casca de ovo/Destrutível): 0.3g por unidade
                // Placas (Alumínio, Flextag, PVC, ACM, Aço Inox): 0.6g por unidade
                if (
                  materialLower.includes('vinil') ||
                  materialLower.includes('poliester') ||
                  materialLower.includes('void') ||
                  materialLower.includes('destrutivel') ||
                  materialLower.includes('casca') ||
                  materialLower.includes('adesivo')
                ) {
                  pesoCalculado += qtd * 0.3;
                } else {
                  pesoCalculado += qtd * 0.6;
                }
              }
              pesoTotalGrams = Math.max(300, Math.ceil(pesoCalculado));
              console.log(`[agente] Peso total calculado pelo backend: ${pesoTotalGrams}g com base em ${args.itens.length} itens.`);
            } else if (args.peso) {
              pesoTotalGrams = Math.max(300, Number(args.peso));
              console.log(`[agente] Peso informado diretamente pela IA: ${pesoTotalGrams}g`);
            }

            // 2. Recuperação do Token de Acesso do n8n (Credencial MinasPlaca - contrato)
            let token = '';
            try {
              console.log('[agente] Recuperando token dos Correios através do webhook do n8n...');
              const resToken = await fetch('https://integradorwebhook.sanjaworks.com/webhook/7332c6d8-4926-43f3-a4e8-b02d684689b9');
              if (resToken.ok) {
                const dataToken = await resToken.json() as any[];
                if (dataToken && dataToken.length > 0 && dataToken[0].token) {
                  token = dataToken[0].token;
                  console.log('[agente] Token dos Correios recuperado com sucesso!');
                }
              }
            } catch (errToken) {
              console.error('[agente] Erro ao recuperar token de autenticação dos Correios:', errToken);
            }

            let consultouComSucesso = false;
            let pacValor = '';
            let pacPrazo = '';
            let pacPrevisao = '';
            let sedexValor = '';
            let sedexPrazo = '';
            let sedexPrevisao = '';

            // 3. Chamadas Diretas à API dos Correios (com o token)
            if (token) {
              try {
                const servicos = [
                  { nome: 'SEDEX', codigo: '03220' },
                  { nome: 'PAC',   codigo: '03298' }
                ];

                const promises = servicos.map(async (servico) => {
                  try {
                    const psObjeto = Math.max(300, pesoTotalGrams);
                    
                    // URLs de Preço e Prazo oficiais
                    const priceUrl = `https://api.correios.com.br/preco/v1/nacional/${servico.codigo}?cepDestino=${cepDestino}&cepOrigem=31330050&nuContrato=9912258911&nuDR=20&psObjeto=${psObjeto}&tpObjeto=2&comprimento=20&largura=20&altura=20&vlDeclarado=0&sCdMaoPropria=N&sCdAvisoRecebimento=N&coProduto=${servico.codigo}`;
                    const deadlineUrl = `https://api.correios.com.br/prazo/v1/nacional/${servico.codigo}?cepOrigem=31330050&cepDestino=${cepDestino}`;

                    const headers = {
                      'Authorization': `Bearer ${token}`,
                      'Accept': 'application/json'
                    };

                    const [resPrice, resDeadline] = await Promise.all([
                      fetch(priceUrl, { headers }),
                      fetch(deadlineUrl, { headers })
                    ]);

                    if (resPrice.ok && resDeadline.ok) {
                      const priceData = await resPrice.json() as any;
                      const deadlineData = await resDeadline.json() as any;

                      // Valor bruto retornado
                      const precoBrutoStr = priceData.pcFinal || '0';
                      const precoBruto = parseFloat(precoBrutoStr.replace('.', '').replace(',', '.'));
                      
                      // Aplicação da margem de lucro comercial de 25%
                      const precoComMargem = precoBruto * 1.25;
                      const precoFinalStr = precoComMargem.toFixed(2).replace('.', ',');

                      const prazo = deadlineData.prazoEntrega || 'A calcular';

                      // Formatação da data para DD/MM/YYYY
                      let dataMaxima = deadlineData.dataMaxima || 'A calcular';
                      if (dataMaxima.includes('T')) {
                        const partes = dataMaxima.split('T')[0].split('-');
                        if (partes.length === 3) {
                          dataMaxima = `${partes[2]}/${partes[1]}/${partes[0]}`;
                        }
                      }

                      if (servico.nome === 'SEDEX') {
                        sedexValor = precoFinalStr;
                        sedexPrazo = String(prazo);
                        sedexPrevisao = dataMaxima;
                      } else {
                        pacValor = precoFinalStr;
                        pacPrazo = String(prazo);
                        pacPrevisao = dataMaxima;
                      }
                    } else {
                      console.warn(`[agente] Falha na API Correios para ${servico.nome}. Preço HTTP: ${resPrice.status}, Prazo HTTP: ${resDeadline.status}`);
                    }
                  } catch (errApi) {
                    console.error(`[agente] Erro de rede ou parse na API do Correios para ${servico.nome}:`, errApi);
                  }
                });

                await Promise.all(promises);

                if (pacValor && sedexValor) {
                  consultouComSucesso = true;
                }
              } catch (errCorreios) {
                console.error('[agente] Erro no fluxo geral de chamadas dos Correios:', errCorreios);
              }
            }

            // 4. Formatação do Prompt com Sucesso
            if (consultouComSucesso) {
              const pesoKgFormatado = (pesoTotalGrams / 1000).toString().replace('.', ',');
              toolResult = `📦 *COTAÇÃO DE FRETE* 📦\n📍 Destino: ${cepDestino}\n⚖️ Peso: ${pesoKgFormatado} kg\n\n🚀 *SEDEX*\n   💰 *VALOR FRETE: R$ ${sedexValor}*\n   📅 Prazo: ${sedexPrazo} dias úteis\n   (Previsão: ${sedexPrevisao})\n\n🚀 *PAC*\n   💰 *VALOR FRETE: R$ ${pacValor}*\n   📅 Prazo: ${pacPrazo} dias úteis\n   (Previsão: ${pacPrevisao})`;
            }

            // 5. Fallback de contingência local combinando o layout caso ocorra alguma falha
            if (!consultouComSucesso) {
              console.warn('[agente] Usando fallback local por Região (ViaCEP)...');
              let fallbackPac = '28,50'; let fallbackPacPrazo = '5';
              let fallbackSedex = '42,90'; let fallbackSedexPrazo = '2';
              
              try {
                const resViaCep = await fetch(`https://viacep.com.br/ws/${cepDestino}/json/`);
                const viaCep = await resViaCep.json() as any;
                
                if (viaCep && viaCep.uf) {
                  const uf = viaCep.uf.toUpperCase();
                  if (['MG', 'SP', 'RJ', 'ES'].includes(uf)) {
                    fallbackPac = '28,50'; fallbackPacPrazo = '5';
                    fallbackSedex = '42,90'; fallbackSedexPrazo = '2';
                  } else if (['PR', 'SC', 'RS', 'DF', 'GO', 'MS', 'MT'].includes(uf)) {
                    fallbackPac = '38,90'; fallbackPacPrazo = '8';
                    fallbackSedex = '58,50'; fallbackSedexPrazo = '4';
                  } else if (['BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA'].includes(uf)) {
                    fallbackPac = '49,90'; fallbackPacPrazo = '12';
                    fallbackSedex = '78,90'; fallbackSedexPrazo = '6';
                  } else {
                    fallbackPac = '65,90'; fallbackPacPrazo = '15';
                    fallbackSedex = '98,50'; fallbackSedexPrazo = '7';
                  }
                }
              } catch (e) {
                console.error('[agente] Falha ao obter dados no fallback ViaCEP:', e);
              }

              const pesoKgFormatado = (pesoTotalGrams / 1000).toString().replace('.', ',');
              toolResult = `📦 *COTAÇÃO DE FRETE (CONTINGÊNCIA)* 📦\n📍 Destino: ${cepDestino}\n⚖️ Peso: ${pesoKgFormatado} kg\n\n🚀 *SEDEX*\n   💰 *VALOR FRETE: R$ ${fallbackSedex}*\n   📅 Prazo: ${fallbackSedexPrazo} dias úteis\n\n🚀 *PAC*\n   💰 *VALOR FRETE: R$ ${fallbackPac}*\n   📅 Prazo: ${fallbackPacPrazo} dias úteis`;
            }
          } catch (err) {
            console.error('[agente] Erro geral ao processar calcular_frete:', err);
            toolResult = 'Houve um erro ao processar o frete. O frete será calculado no fechamento.';
          }
        }

        // -----------------------------------------------
        // TOOL: atualizar_dados_cliente
        // -----------------------------------------------
        else if (toolName === 'atualizar_dados_cliente') {
          console.log(`[agente] atualizar_dados_cliente chamado para ${telefone}:`, args);
          try {
            const estadoAtual = await obterEstadoCliente(telefone);
            const novoEstado = {
              ...estadoAtual,
              ...args
            };
            delete novoEstado.atualizado_em;
            await salvarEstadoCliente(telefone, novoEstado);
            toolResult = 'Dados do cliente atualizados com sucesso no banco de dados.';
          } catch (err) {
            console.error('[agente] Erro ao atualizar dados do cliente:', err);
            toolResult = 'Erro ao atualizar dados do cliente no banco de dados.';
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
