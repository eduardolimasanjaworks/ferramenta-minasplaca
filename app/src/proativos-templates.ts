export function interpolarTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const val = vars[key];
    return val === undefined || val === null ? '' : String(val);
  });
}

export function formatarDataBr(isoOrYmd: string): string {
  if (!isoOrYmd) return '';
  if (isoOrYmd.includes('/')) return isoOrYmd.split(' ')[0];
  const base = isoOrYmd.split('T')[0];
  if (base.includes('-')) {
    const parts = base.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoOrYmd;
}

export function formatarNomeCliente(nome: string): string {
  const raw = String(nome || '').trim();
  if (!raw || raw === 'undefined' || raw === 'null') return '';
  return raw.toLowerCase().replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
}

export function saudacaoWhatsapp(nome: string): string {
  const bonito = formatarNomeCliente(nome);
  return bonito.length > 1 ? `Olá *${bonito}*!` : 'Olá, tudo bem?';
}
