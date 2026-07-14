/**
 * Rotas do painel WhatsApp (status / QR / reiniciar / desconectar).
 * Usa canal-whatsapp (UazAPI ou Evolution conforme WHATSAPP_PROVIDER).
 */
import type { FastifyInstance } from 'fastify';
import { config } from './config.js';
import {
  desconectarAtivo,
  obterInfoInstanciaAtiva,
  obterQrAtivo,
  provedorWhatsapp,
  reiniciarAtivo,
} from './lib/canal-whatsapp.js';
import { uazConfigurarWebhook, uazInitInstance } from './lib/uazapi.js';

export async function rotasWhatsappPainel(app: FastifyInstance): Promise<void> {
  app.get('/api/whatsapp/status', async (_req, reply) => {
    try {
      const info = await obterInfoInstanciaAtiva();
      return {
        connected: info.connected,
        state: info.state,
        telefone: info.telefone,
        profileName: info.profileName,
        instanceName: info.instanceName,
        provider: info.provider,
      };
    } catch (err) {
      return reply.status(502).send({ error: String(err) });
    }
  });

  app.get('/api/whatsapp/info', async (_req, reply) => {
    try {
      const info = await obterInfoInstanciaAtiva();
      return { ok: true, ...info };
    } catch (err) {
      return reply.status(502).send({ ok: false, erro: String(err) });
    }
  });

  app.post('/api/whatsapp/reiniciar', async (_req, reply) => {
    try {
      const resultado = await reiniciarAtivo();
      const info = await obterInfoInstanciaAtiva();
      return { ok: true, state: resultado.state, info };
    } catch (err) {
      return reply.status(502).send({ ok: false, erro: String(err) });
    }
  });

  app.post('/api/whatsapp/desconectar', async (_req, reply) => {
    try {
      const resultado = await desconectarAtivo();
      const info = await obterInfoInstanciaAtiva();
      return { ok: true, state: resultado.state, info };
    } catch (err) {
      return reply.status(502).send({ ok: false, erro: String(err) });
    }
  });

  app.post('/api/whatsapp/uazapi/webhook', async (_req, reply) => {
    try {
      await uazConfigurarWebhook();
      return { ok: true, url: config.uazapiWebhookUrl };
    } catch (err) {
      return reply.status(502).send({ ok: false, erro: String(err) });
    }
  });

  app.post('/api/whatsapp/uazapi/init', async (_req, reply) => {
    try {
      const data = await uazInitInstance();
      return { ok: true, data };
    } catch (err) {
      return reply.status(502).send({ ok: false, erro: String(err) });
    }
  });

  app.get('/api/whatsapp/qr', async (_req, reply) => {
    try {
      if (provedorWhatsapp() === 'uazapi') {
        const data = await obterQrAtivo();
        console.log('[whatsapp] QR uazapi', { connected: data.connected, hasCode: !!data.code });
        return data;
      }

      // --- legado Evolution ---
      const state = await fetch(
        `${config.evolutionUrl}/instance/connectionState/${config.evolutionInstance}`,
        { headers: { apikey: config.evolutionApiKey } },
      );
      const stateData = await state.json() as { state?: string; instance?: { state?: string } };
      const currentState = String(stateData.instance?.state ?? stateData.state ?? '').toLowerCase();
      if (currentState === 'open' || currentState === 'connected') {
        return { connected: true };
      }
      let res = await fetch(
        `${config.evolutionUrl}/instance/connect/${config.evolutionInstance}`,
        { headers: { apikey: config.evolutionApiKey } },
      );
      let data = await res.json() as {
        code?: string; qrcode?: string; base64?: string;
        pairingCode?: string | null; message?: unknown; error?: unknown; status?: number;
      };

      if (
        res.status === 404
        || (data.message && String(data.message).includes('does not exist'))
        || data.status === 404
      ) {
        const createRes = await fetch(`${config.evolutionUrl}/instance/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: config.evolutionApiKey },
          body: JSON.stringify({
            instanceName: config.evolutionInstance,
            token: config.evolutionApiKey,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
          signal: AbortSignal.timeout(25_000),
        });
        if (!createRes.ok) {
          throw new Error(`criar instancia (${createRes.status}): ${await createRes.text()}`);
        }
        const URL_WEBHOOK =
          process.env.IAGMX_WEBHOOK_EVOLUTION_URL?.trim()
          || 'http://app:8095/webhook/evolution';
        await fetch(`${config.evolutionUrl}/webhook/set/${config.evolutionInstance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: config.evolutionApiKey },
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: URL_WEBHOOK,
              webhook_by_events: false,
              webhook_base64: true,
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
            },
          }),
        }).catch((err) => console.error('[whatsapp] webhook evo:', err));

        res = await fetch(
          `${config.evolutionUrl}/instance/connect/${config.evolutionInstance}`,
          { headers: { apikey: config.evolutionApiKey } },
        );
        data = await res.json() as typeof data;
      }

      return {
        code: data.base64 ?? data.code ?? data.qrcode,
        pairingCode: data.pairingCode,
        message: data.message ?? data.error,
      };
    } catch (err) {
      console.error('[whatsapp] QR erro:', err);
      return reply.status(502).send({ error: String(err) });
    }
  });
}
