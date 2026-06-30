/**
 * Agente Minas Placa — gera resposta via LLM com RAG e calculadora.
 */
import { config } from './config.js';
import { buscarContexto } from './rag-minasplaca.js';
import { calcularOrcamento, textoOrcamento } from './calculadora-minasplaca.js';
import { obterPromptBruto } from './prompt-minasplaca.js';
import type { RegistroHistorico } from './lib/tipos.js';

interface OpcoesResposta {
  telefone: string;
  mensagem: string;
  historico: RegistroHistorico[];
  pushName?: string;
}

export async function gerarRespostaAgente(opts: OpcoesResposta): Promise<string> {
  const { mensagem, historico, pushName } = opts;

  const promptBase = await obterPromptBruto();
  const contexto = await buscarContexto(mensagem);
  const contextoTexto = contexto.length
    ? `Contexto relevante:\n${contexto.map((c) => `- ${c}`).join('\n')}\n\n`
    : '';

  const historicoTexto = historico
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'Cliente' : 'Assistente'}: ${h.content}`)
    .join('\n');

  const system = `${promptBase}\n\n${contextoTexto}Voce e a assistente comercial da Minas Placa. Responda de forma clara, prestativa e objetiva. Se o cliente pedir orcamento, calcule os valores conforme as regras de produtos.`.trim();

  const user = pushName ? `${pushName}: ${mensagem}` : mensagem;
  const body = {
    model: config.modeloChat,
    messages: [
      { role: 'system', content: system },
      ...(historicoTexto ? [{ role: 'user', content: historicoTexto }] : []),
      { role: 'user', content: user },
    ],
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const respostaBruta = json.choices?.[0]?.message?.content?.trim() ?? '';

  const orcamento = tentarExtrairOrcamento(mensagem);
  if (orcamento) {
    return textoOrcamento(orcamento);
  }

  return respostaBruta || 'Oi! Sou a assistente da Minas Placa. Como posso te ajudar?';
}

function tentarExtrairOrcamento(mensagem: string) {
  const linhas = mensagem.split(/[\n,;]/);
  const solicitacao: Array<{ nome: string; quantidade: number }> = [];
  for (const linha of linhas) {
    const match = linha.match(/(\d+)\s*(?:un|m|metros|pecas|placas)?\s*(?:de|da|do)?\s*([\w\s\u00C0-\u00FF]+)/i);
    if (match) {
      const qtd = Number(match[1]);
      const nome = match[2].trim();
      solicitacao.push({ nome, quantidade: qtd });
    }
  }
  if (!solicitacao.length) return null;
  return calcularOrcamento(solicitacao);
}
