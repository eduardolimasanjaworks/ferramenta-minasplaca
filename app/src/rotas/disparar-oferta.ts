/**
 * Disparo proativo de oferta — Evolution API apenas (texto fixo ERP).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { montarMensagemOferta } from '../servicos/oferta-disparo.js';
import { tentarEnviarResposta } from '../servicos/enviar-resposta.js';
import { adicionarAoHistorico } from '../servicos/historico.js';
import { telefoneParaJid, normalizarTelefone } from '../util/telefone.js';
import { marcarEnvioIa } from '../servicos/envio-ia.js';
import { logEvento } from '../util/log-eventos.js';

function verificarAdmin(req: FastifyRequest): boolean {
  if (!config.adminKey) return true;
  const chave = req.headers['x-iagmx-key'];
  return chave === config.adminKey;
}

export interface BodyDispararOferta {
  telefone: string;
  embarque_id: string | number;
  origem: string;
  destino: string;
  valor_ofertado: number;
  valor_minimo?: number;
  valor_maximo?: number;
  operacao?: string;
  produto?: string;
  motorista_id?: string | number;
}

export async function rotasDispararOferta(app: FastifyInstance): Promise<void> {
  app.post<{ Body: BodyDispararOferta }>('/api/disparar-oferta', async (req, reply) => {
    if (!verificarAdmin(req)) {
      return reply.status(401).send({ erro: 'Não autorizado' });
    }

    const body = req.body;
    const telefone = normalizarTelefone(body.telefone);
    if (!telefone || telefone.length < 10) {
      return reply.status(400).send({ erro: 'telefone inválido' });
    }
    if (!body.origem?.trim() || !body.destino?.trim()) {
      return reply.status(400).send({ erro: 'origem e destino obrigatórios' });
    }
    if (body.valor_ofertado == null || !Number.isFinite(Number(body.valor_ofertado))) {
      return reply.status(400).send({ erro: 'valor_ofertado obrigatório' });
    }

    const texto = montarMensagemOferta({
      origem: body.origem.trim(),
      destino: body.destino.trim(),
      operacao: body.operacao,
      valorOfertado: Number(body.valor_ofertado),
      produto: body.produto,
    });

    const remoteJid = telefoneParaJid(telefone);
    const envio = await tentarEnviarResposta(telefone, texto, config.evolutionInstance, {
      remoteJid,
      mensagensEntrada: 0,
      origem: 'evolution',
    });

    if (envio.enviado) {
      await marcarEnvioIa(telefone, 8);
      await adicionarAoHistorico(remoteJid, 'assistant', texto);
      logEvento('oferta', 'Disparo autorizado enviado', {
        telefone,
        embarque_id: body.embarque_id,
        motorista_id: body.motorista_id,
        fragmentos: envio.fragmentos,
      });
    } else {
      logEvento(
        'oferta',
        'Disparo falhou — fila ou WhatsApp desconectado',
        { telefone, motivo: envio.motivo },
        'warn',
      );
      return reply.status(503).send({
        ok: false,
        enviado: false,
        motivo: envio.motivo,
        filaId: envio.filaId,
        texto_preview: texto.slice(0, 200),
      });
    }

    return {
      ok: true,
      enviado: true,
      telefone,
      embarque_id: body.embarque_id,
      fragmentos: envio.fragmentos,
    };
  });
}
