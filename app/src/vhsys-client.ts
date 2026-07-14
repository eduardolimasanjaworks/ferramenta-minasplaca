import { config } from './config.js';

const BASE = 'https://api.vhsys.com/v2';

function headers(userAgent = 'MinasPlaca-App/1.0'): Record<string, string> {
  return {
    'access-token': config.vhsysAccessToken,
    'secret-access-token': config.vhsysSecretAccessToken,
    'User-Agent': userAgent,
  };
}

async function vhsysGet<T>(path: string, userAgent?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(userAgent) });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`VhSys ${res.status}: ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

async function vhsysPut(path: string, body: Record<string, unknown>, userAgent?: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { ...headers(userAgent), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`VhSys PUT ${res.status}: ${txt.slice(0, 300)}`);
  }
}

export interface ContaReceberVhsys {
  id_conta_rec?: number;
  id_conta?: number;
  nome_conta?: string;
  valor_rec?: string | number;
  vencimento_rec?: string;
  link_boleto?: string;
  liquidado_rec?: string;
  id_cliente?: number | string;
  nome_cliente?: string;
}

export interface ClienteVhsys {
  id_cliente?: number | string;
  razao_cliente?: string;
  nome_cliente?: string;
  fantasia_cliente?: string;
  nome_destinatario_cliente?: string;
  celular_cliente?: string;
  telefone_cliente?: string;
  celular?: string;
  telefone?: string;
  email_cliente?: string;
}

export interface PedidoVhsys {
  id_ped?: number;
  id_pedido?: number | string;
  id_cliente?: number | string;
  status_pedido?: string;
  referencia_pedido?: string;
  codigo_rastreio?: string;
  obs_interno_pedido?: string;
  valor_total_nota?: string | number;
  vendedor_pedido_id?: string | number;
  condicao_pagamento_id?: string | number;
}

export async function listarContasReceberAbertas(): Promise<ContaReceberVhsys[]> {
  const data = await vhsysGet<{ data?: ContaReceberVhsys[] }>(
    '/contas-receber?order=vencimento_rec&sort=Asc&status=Em%20Aberto&limit=250&valor_pago=0&liquidado=Nao',
    'MinasPlaca Cobranca',
  );
  return Array.isArray(data.data) ? data.data : [];
}

export async function obterCliente(idCliente: string | number): Promise<ClienteVhsys | null> {
  const data = await vhsysGet<{ data?: ClienteVhsys }>(`/clientes/${idCliente}`, 'MinasPlaca Cobranca');
  return data.data ?? null;
}

export async function listarPedidosAtendidos(limit = 100): Promise<PedidoVhsys[]> {
  const data = await vhsysGet<{ data?: PedidoVhsys[] }>(
    `/pedidos?status_pedido=Atendido&limit=${limit}&sort=id_ped&order=desc`,
    'MinasPlaca Rastreio',
  );
  return Array.isArray(data.data) ? data.data : [];
}

export async function atualizarObsPedido(
  idPed: number,
  payload: {
    obs_interno_pedido: string;
    status_pedido: string;
    id_cliente: string | number;
    vendedor_pedido_id?: string | number;
    condicao_pagamento_id?: string | number;
  },
): Promise<void> {
  await vhsysPut(`/pedidos/${idPed}`, payload, 'MinasPlaca Rastreio');
}

export async function buscarClientePorDocumento(cnpjOuCpf: string): Promise<ClienteVhsys | null> {
  const digitos = String(cnpjOuCpf).replace(/\D/g, '');
  if (!digitos) return null;

  let docFormatado = digitos;
  if (digitos.length === 14) {
    docFormatado = digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  } else if (digitos.length === 11) {
    docFormatado = digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }

  let data = await vhsysGet<{ data?: ClienteVhsys[] }>(
    `/clientes?cnpj_cliente=${encodeURIComponent(docFormatado)}`,
  );
  if (!data.data?.length) {
    data = await vhsysGet<{ data?: ClienteVhsys[] }>(`/clientes?cnpj_cliente=${digitos}`);
  }
  return data.data?.[0] ?? null;
}

export async function obterUltimoPedidoCliente(idCliente: string | number): Promise<{ valor?: string | number; data?: string } | null> {
  const data = await vhsysGet<{ data?: Array<{ valor_total_nota?: string | number; valor_total_produtos?: string | number; data_pedido?: string }> }>(
    `/pedidos?id_cliente=${idCliente}&limit=1&sort=id_pedido&order=desc`,
  );
  const pedido = data.data?.[0];
  if (!pedido) return null;
  return {
    valor: pedido.valor_total_nota || pedido.valor_total_produtos,
    data: pedido.data_pedido,
  };
}

export function telefoneClienteVhsys(cliente: ClienteVhsys | null): string {
  if (!cliente) return '';
  const raw = cliente.celular_cliente || cliente.telefone_cliente || cliente.celular || cliente.telefone || '';
  return String(raw).replace(/\D/g, '');
}
