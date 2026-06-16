/**
 * Sessão de "digitando..." por contato — inicia na chegada da mensagem, para após o envio.
 */
import { enviarDigitando } from './evolution.js';
import { iniciarDigitandoInferencia, type SessaoDigitando } from './digitando-inferencia.js';
import { jidParaTelefone } from '../util/telefone.js';

const DURACAO_PRESENCA_MS = 12000;

const ativas = new Map<string, SessaoDigitando>();
const iniciando = new Set<string>();

/** Dispara composing imediatamente e mantém até pararDigitando(remoteJid). */
export function garantirDigitando(instance: string, remoteJid: string): void {
  const telefone = jidParaTelefone(remoteJid);

  void enviarDigitando(instance, telefone, DURACAO_PRESENCA_MS).catch(() => {});

  if (ativas.has(remoteJid) || iniciando.has(remoteJid)) return;

  iniciando.add(remoteJid);
  void (async () => {
    try {
      const sessao = await iniciarDigitandoInferencia(instance, telefone);
      if (!sessao) return;
      const anterior = ativas.get(remoteJid);
      if (anterior) {
        sessao.parar();
        return;
      }
      ativas.set(remoteJid, sessao);
    } catch {
      /* digitando é best-effort — não derruba o processo */
    } finally {
      iniciando.delete(remoteJid);
    }
  })();
}

export function pararDigitando(remoteJid: string): void {
  ativas.get(remoteJid)?.parar();
  ativas.delete(remoteJid);
  iniciando.delete(remoteJid);
}
