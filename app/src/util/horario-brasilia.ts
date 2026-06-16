/**
 * Horário atual em Brasília (America/Sao_Paulo) para contexto da IA.
 */
const FUSO = 'America/Sao_Paulo';

export function obterDataHoraBrasilia(): Date {
  return new Date();
}

/** Texto formatado para injetar no prompt do sistema */
export function obterContextoHorarioBrasilia(agora = obterDataHoraBrasilia()): string {
  const fmtData = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const fmtHora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const data = fmtData.format(agora);
  const hora = fmtHora.format(agora);

  return `=== AGORA (horário de Brasília — ${FUSO}) ===
${data}, ${hora}
Use este horário para saudações (bom dia/boa tarde/boa noite) e prazos relativos (hoje, amanhã).`;
}
