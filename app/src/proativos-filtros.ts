import { ContaReceberVhsys, PedidoVhsys } from './vhsys-client.js';
import { canonizarTelefoneBr } from './util/telefone.js';

export function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function diffDias(dataFutura: Date, dataBase: Date): number {
  const ms = inicioDoDia(dataFutura).getTime() - inicioDoDia(dataBase).getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function parseDataYmd(ymd: string): Date | null {
  if (!ymd) return null;
  const parts = ymd.split('T')[0].split('-');
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return isNaN(d.getTime()) ? null : d;
}

export interface ContaBoletoFiltrada {
  id_conta: number | string;
  descricao: string;
  valor: string | number;
  vencimento: string;
  vencimento_br: string;
  link_boleto: string;
  dias_restantes: number;
  tipo_aviso: 'HOJE' | 'PREVENTIVO';
  id_cliente: number | string;
  nome_cliente: string;
}

export function filtrarContasBoletoAVencer(
  contas: ContaReceberVhsys[],
  diasParaLembrar: number[],
  hoje = new Date(),
): ContaBoletoFiltrada[] {
  const resultados: ContaBoletoFiltrada[] = [];
  for (const conta of contas) {
    if (conta.liquidado_rec !== 'Nao' || !conta.vencimento_rec) continue;
    const dataVenc = parseDataYmd(conta.vencimento_rec);
    if (!dataVenc) continue;
    const dias = diffDias(dataVenc, hoje);
    if (!diasParaLembrar.includes(dias)) continue;
    const parts = conta.vencimento_rec.split('-');
    const vencimentoBr = `${parts[2]}/${parts[1]}/${parts[0]}`;
    resultados.push({
      id_conta: conta.id_conta_rec ?? conta.id_conta ?? '',
      descricao: conta.nome_conta || '',
      valor: conta.valor_rec ?? '',
      vencimento: conta.vencimento_rec,
      vencimento_br: vencimentoBr,
      link_boleto: conta.link_boleto || 'Link indisponível',
      dias_restantes: dias,
      tipo_aviso: dias === 0 ? 'HOJE' : 'PREVENTIVO',
      id_cliente: conta.id_cliente ?? '',
      nome_cliente: conta.nome_cliente || '',
    });
  }
  return resultados;
}

export interface ContaCobrancaFiltrada {
  id_conta: number | string;
  descricao: string;
  valor: string | number;
  vencimento: string;
  vencimento_br: string;
  link_boleto: string;
  dias_atraso: number;
  id_cliente: number | string;
  nome_cliente: string;
}

export function filtrarContasCobrancaVencidos(
  contas: ContaReceberVhsys[],
  diasParaCobrar: number[],
  hoje = new Date(),
): ContaCobrancaFiltrada[] {
  const resultados: ContaCobrancaFiltrada[] = [];
  for (const conta of contas) {
    if (conta.liquidado_rec !== 'Nao' || !conta.vencimento_rec) continue;
    const dataVenc = parseDataYmd(conta.vencimento_rec);
    if (!dataVenc) continue;
    const diasAtraso = diffDias(hoje, dataVenc);
    if (!diasParaCobrar.includes(diasAtraso)) continue;
    const parts = conta.vencimento_rec.split('-');
    resultados.push({
      id_conta: conta.id_conta_rec ?? conta.id_conta ?? '',
      descricao: conta.nome_conta || '',
      valor: conta.valor_rec ?? '',
      vencimento: conta.vencimento_rec,
      vencimento_br: `${parts[2]}/${parts[1]}/${parts[0]}`,
      link_boleto: conta.link_boleto || 'Peça o link atualizado.',
      dias_atraso: diasAtraso,
      id_cliente: conta.id_cliente ?? '',
      nome_cliente: conta.nome_cliente || '',
    });
  }
  return resultados;
}

const LISTA_NEGRA_RASTREIO = [
  'RETIRA',
  'LOJA',
  'BALCAO',
  'ISENTO',
  'RASTREAR',
  'NULL',
  'UNDEFINED',
  'CLIENTE',
  'A COMBINAR',
  'ENTREGA',
];

export interface PedidoRastreioFiltrado extends PedidoVhsys {
  rastreio_limpo: string;
}

export function filtrarPedidosRastreio(pedidos: PedidoVhsys[]): PedidoRastreioFiltrado[] {
  const validos: PedidoRastreioFiltrado[] = [];
  for (const pedido of pedidos) {
    if (!pedido?.status_pedido) continue;
    const obs = (pedido.obs_interno_pedido || '').toUpperCase();
    if (obs.includes('[RASTREIO_FINALIZADO]')) continue;
    if (pedido.status_pedido !== 'Atendido') continue;

    let rastreio = String(pedido.referencia_pedido || pedido.codigo_rastreio || '').trim().toUpperCase();
    if (!rastreio || rastreio.length < 8) continue;
    if (LISTA_NEGRA_RASTREIO.some((p) => rastreio.includes(p))) continue;
    if (!/[A-Z]{2}\d+/.test(rastreio) && !/\d{10,}/.test(rastreio)) continue;

    rastreio = rastreio.replace(/\s/g, '');
    validos.push({ ...pedido, rastreio_limpo: rastreio });
  }
  return validos;
}

export interface EntregaPosVendaRow {
  id: number;
  id_pedido: string;
  nome: string;
  telefone: string;
  data_entrega: Date;
}

export function filtrarEntregasPosVenda(
  entregas: EntregaPosVendaRow[],
  diasPosEntrega: number,
  hoje = new Date(),
): EntregaPosVendaRow[] {
  return entregas.filter((e) => {
    const diff = diffDias(hoje, e.data_entrega);
    return diff === diasPosEntrega;
  });
}

export function rastreioEntregue(status: string): boolean {
  const s = status.toUpperCase();
  return (
    s.includes('OBJETO ENTREGUE AO DESTINATÁRIO') ||
    s.includes('OBJETO ENTREGUE AO DESTINATARIO') ||
    s.includes('ENTREGA EFETUADA') ||
    s.includes('OBJETO ENTREGUE')
  );
}

export function normalizarTelefoneBrasil(raw: string): string {
  return canonizarTelefoneBr(String(raw || ''));
}
