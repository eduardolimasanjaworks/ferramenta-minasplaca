/**
 * Envio humanizado: fragmentos, delay aleatório e "digitando..." (Evolution).
 */
import { dividirResposta } from './mensagem.js';
import { enviarTexto, enviarDigitando } from './evolution.js';
import {
  aguardar,
  aleatorioEntre,
  obterConfigHumanizacao,
  type ConfigHumanizacao,
} from './config-humanizacao.js';

/**
 * Envia fragmentos com pausas e typing via Evolution API.
 * Cada trecho entre vírgulas vira uma mensagem separada, sem ponto final.
 */
export async function enviarFragmentosHumanizado(
  instance: string,
  numero: string,
  textoCompleto: string,
  opts?: { fragmentar?: boolean },
): Promise<number> {
  const fragmentos =
    opts?.fragmentar === false ? [textoCompleto.trim() || 'Ok'] : dividirResposta(textoCompleto);
  const cfg = await obterConfigHumanizacao();

  for (let i = 0; i < fragmentos.length; i++) {
    if (i > 0) {
      const pausa = aleatorioEntre(cfg.delayMinMs, cfg.delayMaxMs);
      console.log(`[envio] Pausa ${pausa}ms antes do fragmento ${i + 1}/${fragmentos.length}`);
      await aguardar(pausa);
    }

    await simularDigitacao(instance, numero, cfg);
    await enviarTexto(instance, numero, fragmentos[i]);
    console.log(`[envio] Fragmento ${i + 1}/${fragmentos.length} enviado (${fragmentos[i].length} chars)`);
  }

  return fragmentos.length;
}

async function simularDigitacao(
  instance: string,
  numero: string,
  cfg: ConfigHumanizacao,
): Promise<void> {
  if (!cfg.digitandoAtivo) return;
  const ms = aleatorioEntre(cfg.digitandoMinMs, cfg.digitandoMaxMs);
  console.log(`[envio] Digitando ${ms}ms para ${numero}`);
  await enviarDigitando(instance, numero, ms);
  await aguardar(ms);
}
