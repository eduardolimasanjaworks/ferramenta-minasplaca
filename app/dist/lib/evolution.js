/**
 * Integracao Evolution API — Minas Placa clean.
 */
import { config } from '../config.js';
import { dividirResposta, normalizarRespostaWhatsapp } from './mensagem.js';
export async function obterStatusConexao(instance) {
    try {
        const res = await fetch(`${config.evolutionUrl}/instance/connectionState/${instance}`, {
            headers: { apikey: config.evolutionApiKey },
        });
        if (!res.ok)
            return { conectado: false };
        const data = await res.json();
        return { conectado: (data.state ?? '').toUpperCase() === 'CONNECTED', state: data.state };
    }
    catch {
        return { conectado: false };
    }
}
export async function enviarTextoSimples(instance, telefone, texto) {
    const res = await fetch(`${config.evolutionUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: config.evolutionApiKey,
        },
        body: JSON.stringify({
            number: telefone,
            text: texto,
            delay: 1200,
        }),
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Evolution erro ${res.status}: ${txt}`);
    }
}
export async function enviarRespostaFragmentada(instance, telefone, textoCompleto, opts) {
    const textos = opts?.fragmentar === false
        ? [normalizarRespostaWhatsapp(textoCompleto)]
        : dividirResposta(normalizarRespostaWhatsapp(textoCompleto));
    for (const texto of textos) {
        await enviarTextoSimples(instance, telefone, texto);
    }
    return textos.length;
}
export async function tentarEnviarResposta(telefone, textoCompleto, instance, opts) {
    const status = await obterStatusConexao(instance);
    if (!status.conectado) {
        return { enviado: false, fragmentos: 0, motivo: 'whatsapp_desconectado' };
    }
    try {
        const fragmentos = await enviarRespostaFragmentada(instance, telefone, textoCompleto, {
            fragmentar: opts?.fragmentar,
        });
        return { enviado: true, fragmentos };
    }
    catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        return { enviado: false, fragmentos: 0, motivo };
    }
}
