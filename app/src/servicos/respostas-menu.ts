/**
 * Respostas fixas do menu (Cenário 6) — evita repetição e LLM desnecessário.
 */
const INDICIO_PEDIDO =
  /\?|quanto|quando|onde|como|tem carga|preciso|cadastr|manda|envia|quero|pode|valor|frete|documento|cnh|crlv|disponib|pagamento/i;

const SAUDACAO_CURTA =
  /^(oi|olá|ola|bom dia|boa tarde|boa noite|eae|e aí|e ai|fala|opa|hey|salve|opa parceiro|oi parceiro)[\s!.]*$/i;

const ACK_CURTO =
  /^(opa|blz|beleza|show|tmj|e aí|e ai|fala|fechou|certo|tranquilo)[\s!.]*$/i;

function normalizarEntrada(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function jaMostrouMenu(ultimaAssistant?: string, historico?: Array<{ role: string; content: string }>): boolean {
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

/** Primeira saudação — tom de atendente, sem lista de URA */
export const MENU_INICIAL = 'Fala parceiro, sou da GMX, me conta no que você precisa';

/** Segunda saudação/ack — não repetir menu, convidar a falar */
export const MENU_RELEMBRE = 'Opa, manda aí que eu te ajudo';

/**
 * Resposta programática para saudação/menu — desativado: conversa via LLM.
 */
export function tentarRespostaMenuProgramatica(
  _mensagemUsuario: string,
  _opts?: {
    ultimaAssistant?: string;
    historico?: Array<{ role: string; content: string }>;
  },
): string | null {
  return null;
}
