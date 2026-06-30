import { adicionarAoDebounce } from './debounce-minasplaca.js';
import { jidParaTelefone } from './util/telefone.js';
function normalizarEvento(evento) {
    return (evento ?? '').toLowerCase().replace(/\./g, '_');
}
function extrairTexto(message) {
    if (!message)
        return '';
    const conversation = message.conversation ?? '';
    const extended = message.extendedTextMessage?.text ?? '';
    const image = message.imageMessage?.caption ?? '';
    const video = message.videoMessage?.caption ?? '';
    return conversation || extended || image || video;
}
function detectarTipo(message) {
    if (!message)
        return 'texto';
    if (message.imageMessage)
        return 'imagem';
    if (message.videoMessage)
        return 'video';
    if (message.audioMessage)
        return 'audio';
    if (message.documentMessage)
        return 'documento';
    return 'texto';
}
export async function rotasWebhook(app) {
    app.post('/webhook/evolution', async (req, reply) => {
        const payload = req.body;
        if (normalizarEvento(payload.event) !== 'messages_upsert') {
            return reply.status(200).send({ ok: true, ignorado: payload.event });
        }
        const dados = payload.data ?? {};
        if (dados.key?.fromMe) {
            return reply.status(200).send({ ok: true, ignorado: 'fromMe' });
        }
        const remoteJid = dados.key?.remoteJid ?? '';
        if (!remoteJid) {
            return reply.status(200).send({ ok: true, ignorado: 'sem_remoteJid' });
        }
        const telefone = jidParaTelefone(remoteJid);
        const message = dados.message ?? {};
        const texto = extrairTexto(message);
        const tipo = detectarTipo(message);
        if (!texto && tipo === 'texto') {
            return reply.status(200).send({ ok: true, ignorado: 'sem_texto' });
        }
        await adicionarAoDebounce({
            remoteJid,
            telefone,
            conteudo: texto,
            tipo,
            pushName: dados.pushName,
            instance: payload.instance ?? 'minasplaca-atendimento',
            recebidoEm: Date.now(),
        });
        return reply.status(200).send({ ok: true, processado: true });
    });
}
