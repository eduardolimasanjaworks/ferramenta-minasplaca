/**
 * Worker de disparos proativos — cron interno + Evolution.
 * Clones dos 4 workflows n8n (boleto, rastreio, cobrança, pós-venda).
 */
import { config } from './config.js';
import { obterRedis } from './lib/redis.js';
import { obterStatusConexaoAtivo, enviarTextoAtivo } from './lib/canal-whatsapp.js';
import { adicionarAoHistorico } from './historico-minasplaca.js';
import { iaEstaPausada } from './pausa-minasplaca.js';
import { canonizarTelefoneBr, telefoneEhContatoValido } from './util/telefone.js';
import {
  obterConfigProativos,
  salvarConfigProativos,
  alternarDisparosProativos,
  obterAbordagemPorSlug,
  type AbordagemProativa,
  type ConfigProativos,
} from './proativos-config.js';
import {
  inicializarTabelasProativos,
  inserirEntregaPosVenda,
  listarEntregasPosVenda,
  registrarLogDisparo,
} from './proativos-store.js';
import {
  filtrarContasBoletoAVencer,
  filtrarContasCobrancaVencidos,
  filtrarPedidosRastreio,
  filtrarEntregasPosVenda,
  normalizarTelefoneBrasil,
  rastreioEntregue,
} from './proativos-filtros.js';
import { interpolarTemplate, saudacaoWhatsapp, formatarDataBr } from './proativos-templates.js';
import {
  listarContasReceberAbertas,
  obterCliente,
  listarPedidosAtendidos,
  atualizarObsPedido,
  telefoneClienteVhsys,
  type ClienteVhsys,
} from './vhsys-client.js';
import { consultarRastreio } from './rastreio-client.js';

const redis = obterRedis();
const PREFIXO_SENT = 'proativo:sent:';
const RATE_LIMIT_MS = 1500;

let workerRodando = false;
let ultimoEnvioMs = 0;

export type JobSlug = 'boleto-a-vencer' | 'envia-rastreamento' | 'cobranca-vencidos' | 'pesquisa-pos-venda';

function agoraProativos(): { data: string; hora: string; diaSemana: number } {
  const s = new Date().toLocaleString('en-US', { timeZone: config.proativosTimezone });
  const d = new Date(s);
  return {
    data: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    diaSemana: d.getDay(),
  };
}

function jobDeveRodar(abordagem: AbordagemProativa, slot: { hora: string; diaSemana: number }): boolean {
  if (!abordagem.ativo) return false;
  for (const regra of abordagem.regras) {
    if (!regra.dias_semana.includes(slot.diaSemana)) continue;
    if (regra.horarios.includes(slot.hora)) return true;
  }
  return false;
}

async function jaEnviado(slug: string, slot: string, idAlvo: string): Promise<boolean> {
  const chave = `${PREFIXO_SENT}${slug}:${slot}:${idAlvo}`;
  const v = await redis.get(chave);
  return v === '1';
}

async function marcarEnviado(slug: string, slot: string, idAlvo: string): Promise<void> {
  const chave = `${PREFIXO_SENT}${slug}:${slot}:${idAlvo}`;
  await redis.set(chave, '1', 'EX', 60 * 60 * 26);
}

async function aguardarRateLimit(): Promise<void> {
  const agora = Date.now();
  const espera = RATE_LIMIT_MS - (agora - ultimoEnvioMs);
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimoEnvioMs = Date.now();
}

interface ContextoEnvio {
  slug: JobSlug;
  telefone: string;
  idAlvo: string;
  mensagem: string;
  slot: string;
  forcar?: boolean;
  telefoneTeste?: string;
}

async function enviarProativo(ctx: ContextoEnvio): Promise<void> {
  const modoTeste = Boolean(ctx.telefoneTeste);
  const telefoneDestino = modoTeste ? ctx.telefoneTeste! : ctx.telefone;
  const slot = ctx.slot;

  if (!ctx.forcar && !modoTeste && (await jaEnviado(ctx.slug, slot, ctx.idAlvo))) {
    await registrarLogDisparo({
      job_slug: ctx.slug,
      telefone: telefoneDestino,
      id_alvo: ctx.idAlvo,
      status: 'pulado',
      payload_resumo: 'dedupe',
    });
    return;
  }

  if (!telefoneEhContatoValido(telefoneDestino)) {
    await registrarLogDisparo({
      job_slug: ctx.slug,
      telefone: telefoneDestino,
      id_alvo: ctx.idAlvo,
      status: 'erro',
      erro: 'telefone invalido',
    });
    return;
  }

  if (!ctx.forcar && !modoTeste && (await iaEstaPausada(telefoneDestino))) {
    await registrarLogDisparo({
      job_slug: ctx.slug,
      telefone: telefoneDestino,
      id_alvo: ctx.idAlvo,
      status: 'pulado',
      payload_resumo: 'ia pausada',
    });
    return;
  }

  if (config.proativosDryRun) {
    console.log(`[proativos] dry-run ${ctx.slug} -> ${telefoneDestino}: ${ctx.mensagem.slice(0, 80)}...`);
    await registrarLogDisparo({
      job_slug: ctx.slug,
      telefone: telefoneDestino,
      id_alvo: ctx.idAlvo,
      status: 'dry_run',
      payload_resumo: ctx.mensagem.slice(0, 200),
    });
    if (!modoTeste) await marcarEnviado(ctx.slug, slot, ctx.idAlvo);
    return;
  }

  const status = await obterStatusConexaoAtivo();
  if (!status.conectado) {
    await registrarLogDisparo({
      job_slug: ctx.slug,
      telefone: telefoneDestino,
      id_alvo: ctx.idAlvo,
      status: 'erro',
      erro: `whatsapp desconectado (${status.state ?? 'unknown'})`,
    });
    return;
  }

  await aguardarRateLimit();
  try {
    await enviarTextoAtivo(telefoneDestino, ctx.mensagem);
    await adicionarAoHistorico(telefoneDestino, [{
      role: 'assistant',
      content: `[Disparo proativo — ${ctx.slug}]\n${ctx.mensagem}`,
      timestamp: Date.now(),
    }]);
    if (!modoTeste) await marcarEnviado(ctx.slug, slot, ctx.idAlvo);
    await registrarLogDisparo({
      job_slug: ctx.slug,
      telefone: telefoneDestino,
      id_alvo: ctx.idAlvo,
      status: modoTeste ? 'teste' : 'enviado',
      payload_resumo: ctx.mensagem.slice(0, 200),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await registrarLogDisparo({
      job_slug: ctx.slug,
      telefone: telefoneDestino,
      id_alvo: ctx.idAlvo,
      status: 'erro',
      erro: msg,
    });
  }
}

async function executarBoletoAVencer(abordagem: AbordagemProativa, slot: string, opts?: { forcar?: boolean; telefoneTeste?: string }): Promise<void> {
  const dias = abordagem.parametros?.dias_antes ?? [0, 3];
  const contas = await listarContasReceberAbertas();
  const filtradas = filtrarContasBoletoAVencer(contas, dias);

  for (const conta of filtradas) {
    const cliente = await obterCliente(conta.id_cliente);
    const telefone = normalizarTelefoneBrasil(telefoneClienteVhsys(cliente));
    const tpl =
      conta.tipo_aviso === 'HOJE'
        ? abordagem.templates?.hoje || abordagem.copy
        : abordagem.templates?.preventivo || abordagem.copy;
    const mensagem = interpolarTemplate(tpl, {
      descricao: conta.descricao,
      vencimento: conta.vencimento_br,
      link_boleto: conta.link_boleto,
      valor: String(conta.valor),
      nome: cliente?.razao_cliente || conta.nome_cliente || '',
    });
    await enviarProativo({
      slug: 'boleto-a-vencer',
      telefone,
      idAlvo: String(conta.id_conta),
      mensagem,
      slot,
      forcar: opts?.forcar,
      telefoneTeste: opts?.telefoneTeste,
    });
  }
}

async function executarCobrancaVencidos(abordagem: AbordagemProativa, slot: string, opts?: { forcar?: boolean; telefoneTeste?: string }): Promise<void> {
  const dias = abordagem.parametros?.dias_atraso ?? [1, 3, 5, 7];
  const contas = await listarContasReceberAbertas();
  const filtradas = filtrarContasCobrancaVencidos(contas, dias);

  for (const conta of filtradas) {
    const cliente = await obterCliente(conta.id_cliente);
    const telefone = normalizarTelefoneBrasil(telefoneClienteVhsys(cliente));
    const tpl = abordagem.templates?.padrao || abordagem.copy;
    const mensagem = interpolarTemplate(tpl, {
      descricao: conta.descricao,
      dias_atraso: conta.dias_atraso,
      valor: String(conta.valor),
      vencimento: conta.vencimento_br,
      link_boleto: conta.link_boleto,
      nome: cliente?.fantasia_cliente || conta.nome_cliente || '',
    });
    await enviarProativo({
      slug: 'cobranca-vencidos',
      telefone,
      idAlvo: String(conta.id_conta),
      mensagem,
      slot,
      forcar: opts?.forcar,
      telefoneTeste: opts?.telefoneTeste,
    });
  }
}

function montarMensagemRastreio(
  abordagem: AbordagemProativa,
  pedido: { id_pedido?: number | string; rastreio_limpo: string },
  cliente: ClienteVhsys | null,
  status: string,
  dataFmt: string,
): string {
  const nome = cliente?.fantasia_cliente || cliente?.nome_cliente || '';
  const saudacao = saudacaoWhatsapp(nome);
  const dataLinha = dataFmt ? `📅 *Data:* ${dataFmt}\n\n` : '';
  const tpl = abordagem.templates?.padrao || abordagem.copy;
  return interpolarTemplate(tpl, {
    saudacao,
    id_pedido: String(pedido.id_pedido ?? ''),
    status,
    data_linha: dataLinha,
    link_rastreio: `https://www.linkcorreios.com.br/${pedido.rastreio_limpo}`,
  });
}

async function executarEnviaRastreamento(abordagem: AbordagemProativa, slot: string, opts?: { forcar?: boolean; telefoneTeste?: string }): Promise<void> {
  const pedidos = filtrarPedidosRastreio(await listarPedidosAtendidos(150));

  for (const pedido of pedidos) {
    const cliente = await obterCliente(pedido.id_cliente ?? '');
    if (!cliente) continue;
    if (String(pedido.id_cliente).trim() !== String(cliente.id_cliente).trim()) continue;

    const telefone = normalizarTelefoneBrasil(telefoneClienteVhsys(cliente));
    const rastreio = await consultarRastreio(pedido.rastreio_limpo);

    let status = 'Etiqueta emitida / Em trânsito';
    let dataFmt = '';
    const eventos = rastreio.objetos?.[0]?.eventos;
    if (eventos?.length) {
      const ultimo = eventos[0];
      status = ultimo.descricao || status;
      const raw = ultimo.dtEvent || ultimo.dtHrCriado || ultimo.data || '';
      dataFmt = formatarDataBr(raw);
    } else if (rastreio.error) {
      await registrarLogDisparo({
        job_slug: 'envia-rastreamento',
        telefone,
        id_alvo: String(pedido.id_pedido),
        status: 'erro',
        erro: rastreio.error,
      });
      continue;
    }

    const mensagem = montarMensagemRastreio(abordagem, pedido, cliente, status, dataFmt);
    await enviarProativo({
      slug: 'envia-rastreamento',
      telefone,
      idAlvo: String(pedido.id_pedido),
      mensagem,
      slot,
      forcar: opts?.forcar,
      telefoneTeste: opts?.telefoneTeste,
    });

    if (rastreioEntregue(status) && pedido.id_ped && !opts?.telefoneTeste) {
      const obs = `${pedido.obs_interno_pedido || ''} [RASTREIO_FINALIZADO]`.trim();
      try {
        await atualizarObsPedido(pedido.id_ped, {
          obs_interno_pedido: obs,
          status_pedido: pedido.status_pedido || 'Atendido',
          id_cliente: pedido.id_cliente ?? '',
          vendedor_pedido_id: pedido.vendedor_pedido_id,
          condicao_pagamento_id: pedido.condicao_pagamento_id,
        });
        await inserirEntregaPosVenda({
          id_pedido: String(pedido.id_pedido),
          nome: cliente.fantasia_cliente || cliente.nome_cliente || 'Cliente',
          telefone,
          data_entrega: new Date(),
        });
      } catch (err) {
        console.error('[proativos] erro ao finalizar rastreio pedido', pedido.id_pedido, err);
      }
    }
  }
}

async function executarPesquisaPosVenda(abordagem: AbordagemProativa, slot: string, opts?: { forcar?: boolean; telefoneTeste?: string }): Promise<void> {
  const dias = abordagem.parametros?.dias_pos_entrega ?? 2;
  const entregas = await listarEntregasPosVenda();
  const filtradas = filtrarEntregasPosVenda(
    entregas.map((e) => ({ id: e.id, id_pedido: e.id_pedido, nome: e.nome, telefone: e.telefone, data_entrega: e.data_entrega })),
    dias,
  );

  const tpl = abordagem.templates?.padrao || abordagem.copy;
  for (const entrega of filtradas) {
    const telefone = normalizarTelefoneBrasil(entrega.telefone);
    const mensagem = interpolarTemplate(tpl, {
      id_pedido: entrega.id_pedido,
      nome: entrega.nome,
    });
    await enviarProativo({
      slug: 'pesquisa-pos-venda',
      telefone,
      idAlvo: entrega.id_pedido,
      mensagem,
      slot,
      forcar: opts?.forcar,
      telefoneTeste: opts?.telefoneTeste,
    });
  }
}

const EXECUTORES: Record<JobSlug, (a: AbordagemProativa, slot: string, o?: { forcar?: boolean; telefoneTeste?: string }) => Promise<void>> = {
  'boleto-a-vencer': executarBoletoAVencer,
  'envia-rastreamento': executarEnviaRastreamento,
  'cobranca-vencidos': executarCobrancaVencidos,
  'pesquisa-pos-venda': executarPesquisaPosVenda,
};

async function tickProativos(): Promise<void> {
  if (workerRodando) return;
  workerRodando = true;
  try {
    const cfg = await obterConfigProativos();
    if (!cfg.disparos_habilitados) return;

    const slotInfo = agoraProativos();
    const slot = `${slotInfo.data}:${slotInfo.hora}`;

    for (const abordagem of cfg.abordagens) {
      const slug = abordagem.slug as JobSlug;
      if (!EXECUTORES[slug]) continue;
      if (!jobDeveRodar(abordagem, slotInfo)) continue;
      console.log(`[proativos] executando job ${slug} slot ${slot}`);
      try {
        await EXECUTORES[slug](abordagem, slot);
      } catch (err) {
        console.error(`[proativos] erro no job ${slug}:`, err);
      }
    }
  } finally {
    workerRodando = false;
  }
}

export async function dispararJobTeste(slug: JobSlug, telefone?: string): Promise<{ ok: boolean; erro?: string }> {
  const cfg = await obterConfigProativos();
  const abordagem = obterAbordagemPorSlug(cfg, slug);
  if (!abordagem) return { ok: false, erro: 'Job não encontrado' };
  const tel = telefone || config.proativosTelefoneTeste;
  if (!tel) return { ok: false, erro: 'Configure PROATIVOS_TELEFONE_TESTE ou informe telefone' };
  const executor = EXECUTORES[slug];
  if (!executor) return { ok: false, erro: 'Executor inválido' };
  const slot = `teste:${Date.now()}`;
  await executor(abordagem, slot, { forcar: true, telefoneTeste: normalizarTelefoneBrasil(tel) });
  return { ok: true };
}

export function iniciarWorkerProativos(intervaloMs = 60_000): void {
  inicializarTabelasProativos().catch((err) => console.error('[proativos] init tabelas:', err));
  console.log(`[proativos] worker iniciado (tick ${intervaloMs}ms, tz=${config.proativosTimezone}, dryRun=${config.proativosDryRun})`);
  setInterval(() => {
    tickProativos().catch((err) => console.error('[proativos] tick erro:', err));
  }, intervaloMs);
}

export { agoraProativos, jobDeveRodar };
