/**
 * Mantém "digitando..." ativo durante inferência LLM (antes do envio dos fragmentos).
 */
import { enviarDigitando } from './evolution.js';
import { obterStatusConexao } from './evolution-instancia.js';

const REFRESH_MS = 8000;
const DURACAO_PRESENCA_MS = 12000;

export interface SessaoDigitando {
  parar: () => void;
}

/** Envia composing periodicamente até chamar parar() */
export async function iniciarDigitandoInferencia(
  instance: string,
  telefone: string,
): Promise<SessaoDigitando | null> {
  // Primeiro pulso sem esperar checagem de conexão — feedback imediato no WhatsApp
  void enviarDigitando(instance, telefone, DURACAO_PRESENCA_MS).catch(() => {});

  let status: Awaited<ReturnType<typeof obterStatusConexao>>;
  try {
    status = await obterStatusConexao();
  } catch {
    return null;
  }
  if (!status.conectado) return null;

  let ativo = true;

  const pulso = () => {
    if (!ativo) return;
    enviarDigitando(instance, telefone, DURACAO_PRESENCA_MS).catch(() => {});
  };

  const timer = setInterval(pulso, REFRESH_MS);

  return {
    parar: () => {
      ativo = false;
      clearInterval(timer);
    },
  };
}
