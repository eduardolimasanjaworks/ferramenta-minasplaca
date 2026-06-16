/**
 * Rotas para conectar WhatsApp via QR code (Evolution API).
 */
import type { FastifyInstance } from 'fastify';
import {
  obterStatusConexao,
  obterQrCode,
  reconectar,
} from '../servicos/evolution-instancia.js';
import { config } from '../config.js';

export async function rotasWhatsapp(app: FastifyInstance): Promise<void> {
  /** Status da conexão */
  app.get('/api/whatsapp/status', async () => {
    const status = await obterStatusConexao();
    return status;
  });

  /** QR code em base64 (data:image/png;base64,...) */
  app.get('/api/whatsapp/qrcode', async (_req, reply) => {
    const status = await obterStatusConexao();
    if (status.conectado) {
      return { conectado: true, base64: null, mensagem: 'WhatsApp já conectado' };
    }
    const qr = await obterQrCode();
    if (!qr.base64) {
      return reply.status(503).send({ erro: 'QR code não disponível. Tente reconectar.' });
    }
    return {
      conectado: false,
      base64: qr.base64,
      pairingCode: qr.pairingCode,
      instancia: config.evolutionInstance,
    };
  });

  /** Força logout e gera novo QR */
  app.post('/api/whatsapp/reconectar', async () => {
    const qr = await reconectar();
    return {
      ok: true,
      base64: qr.base64,
      pairingCode: qr.pairingCode,
      instancia: config.evolutionInstance,
    };
  });
}
