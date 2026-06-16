/**
 * Classificação leve de entradas confusas — sem LLM.
 * Objetivo: respostas naturais rápidas só em spam/teclado óbvio; o resto vai para o LLM.
 */

export type QualidadeEntrada = 'clara' | 'nonsense' | 'ilegivel' | 'vaga';

export interface ClassificacaoEntrada {
  qualidade: QualidadeEntrada;
  motivo: string;
  respostaSugerida?: string;
}

const SINAL_OPERACIONAL =
  /cadastr|disponib|pagamento|frete|carga|embarque|valor|pix|cnh|crlv|antt|canhoto|placa|caminh|carret|cavalo|bitrem|truck|vazio|carregad|descarreg|entreg|coleta|origem|destino|negoci|aceit|contraprop|atualiz|documento|motorista|oferta|adiantamento|carroceria|sider|bau|localiza|latitude|longitude|\b[a-záéíóúãõ]{3,}\s+(sp|mg|rj|pr|sc|rs|go|mt|ms|ba|pe|ce|pa|am|df)\b/i;

const SAUDACAO_CURTA =
  /^(oi|olá|ola|bom dia|boa tarde|boa noite|eae|e aí|e ai|fala|opa|hey|salve)[\s!.]*$/i;

const ACK_CURTO =
  /^(opa|blz|beleza|show|tmj|fechou|certo|tranquilo|ok|valeu|obrigado|obg)[\s!.]*$/i;

const TECLADO_SPAM =
  /(?:^|\s)(?:asdf|qwer|zxcv|hj{3,}|hs{3,}|ks{3,}|rs{4,}|kk{3,}|haha{2,})(?:\s|$)/i;

const RESPOSTAS_NONSENSE = [
  'Perdi o fio da meada aqui, era brincadeira ou tem algo de frete?',
  'Essa me pegou parceiro, me explica melhor?',
  'Não peguei essa, manda de novo do jeito que você precisa?',
];

const RESPOSTAS_ILEGIVEL = [
  'Acho que cortou aí parceiro, manda de novo?',
  'Ops, não entendi essa parte, pode reformular?',
  'Me perdi um pouco aqui, manda de novo?',
];

function normalizar(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function escolher<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

function temSinalOperacional(texto: string): boolean {
  return SINAL_OPERACIONAL.test(texto);
}

function pareceTecladoSpam(texto: string): boolean {
  const compacto = texto.replace(/\s/g, '');
  if (TECLADO_SPAM.test(texto)) return true;
  if (/(.)\1{4,}/.test(compacto)) return true;

  const tokens = texto.split(/\s+/).filter(Boolean);
  const semVogal = tokens.filter(
    (w) => w.length >= 4 && !/[aeiouáéíóúãõ]/i.test(w) && !/^\d+$/.test(w),
  );
  if (semVogal.length >= 2) return true;

  const consoanteLonga = tokens.filter((w) => /[bcdfghjklmnpqrstvwxyzç]{5,}/i.test(w));
  return consoanteLonga.length >= Math.ceil(tokens.length * 0.6) && tokens.length >= 2;
}

/** Frase com começo compreensível e lixo no final (ex: "gostaria de saber sobr hshshsh"). */
function pareceIlegivel(texto: string): boolean {
  const tokens = texto.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;

  const ultimo = tokens[tokens.length - 1];
  const lixoFinal =
    ultimo.length >= 4 &&
    (/(.)\1{2,}/.test(ultimo) || (!/[aeiouáéíóúãõ]/i.test(ultimo) && !/^\d+$/.test(ultimo)));

  const inicioOk = tokens
    .slice(0, -1)
    .some((w) => w.length >= 3 && /[aeiouáéíóúãõ]/i.test(w));

  return lixoFinal && inicioOk && !temSinalOperacional(texto);
}

/** Frase coerente mas sem nexo com frete (ex: "o abacate de calças cantou"). */
function pareceForaDeContexto(texto: string): boolean {
  const tokens = texto.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return false;
  if (temSinalOperacional(texto)) return false;
  if (/^(quanto|quando|onde|como|tem)\b/i.test(texto)) return false;
  return true;
}

function jaMostrouMenu(
  ultimaAssistant?: string,
  historico?: Array<{ role: string; content: string }>,
): boolean {
  const texto = [
    ultimaAssistant ?? '',
    ...(historico ?? [])
      .filter((h) => h.role === 'assistant')
      .map((h) => h.content),
  ].join(' ');
  return /sou da gmx|aqui é a gmx|me conta no que|manda aí que eu|no que você precisa|cadastro.*disponibilidade|cadastro.*frete|disponibilidade ou pagamento/i.test(
    texto,
  );
}

/** Classifica qualidade da entrada (heurística conservadora — prefere falso negativo). */
export function classificarEntrada(
  mensagem: string,
  opts?: {
    ultimaAssistant?: string;
    historico?: Array<{ role: string; content: string }>;
    emFluxoAtivo?: boolean;
    temMidia?: boolean;
  },
): ClassificacaoEntrada {
  const t = normalizar(mensagem);
  if (!t) return { qualidade: 'clara', motivo: 'vazio' };

  if (opts?.temMidia || opts?.emFluxoAtivo) {
    return { qualidade: 'clara', motivo: 'fluxo_ou_midia' };
  }

  if (SAUDACAO_CURTA.test(t) || ACK_CURTO.test(t)) {
    return { qualidade: 'clara', motivo: 'saudacao_ack' };
  }

  if (temSinalOperacional(t)) {
    return { qualidade: 'clara', motivo: 'sinal_operacional' };
  }

  if (pareceTecladoSpam(t)) {
    return {
      qualidade: 'nonsense',
      motivo: 'teclado_spam',
      respostaSugerida: escolher(RESPOSTAS_NONSENSE),
    };
  }

  if (pareceIlegivel(t)) {
    return {
      qualidade: 'ilegivel',
      motivo: 'lixo_final',
      respostaSugerida: escolher(RESPOSTAS_ILEGIVEL),
    };
  }

  const menuVisto = jaMostrouMenu(opts?.ultimaAssistant, opts?.historico);

  if (menuVisto && pareceForaDeContexto(t)) {
    return {
      qualidade: 'nonsense',
      motivo: 'fora_contexto_curto',
      respostaSugerida: escolher(RESPOSTAS_NONSENSE),
    };
  }

  if (menuVisto && t.length >= 3 && t.length <= 55) {
    return { qualidade: 'clara', motivo: 'sem_sinal_apos_menu_llm' };
  }

  if (menuVisto && t.length > 55 && !temSinalOperacional(t) && t.split(/\s+/).length >= 5) {
    return {
      qualidade: 'nonsense',
      motivo: 'fora_contexto_longo',
      respostaSugerida: escolher(RESPOSTAS_NONSENSE),
    };
  }

  return { qualidade: 'clara', motivo: 'default_llm' };
}

/**
 * Resposta programática para entrada confusa (null = seguir LLM).
 * Só dispara em nonsense/ilegivel/vaga com alta confiança heurística.
 */
export function tentarRespostaEntradaConfusa(
  mensagem: string,
  opts?: {
    ultimaAssistant?: string;
    historico?: Array<{ role: string; content: string }>;
    emFluxoAtivo?: boolean;
    temMidia?: boolean;
  },
): string | null {
  const c = classificarEntrada(mensagem, opts);
  if (c.qualidade === 'clara' || !c.respostaSugerida) return null;

  return c.respostaSugerida;
}
