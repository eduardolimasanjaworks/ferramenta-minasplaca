/**
 * Controles de pausa global da IA na tela /phone.
 * Usa o mesmo login admin do painel para consultar e alterar o modo global.
 * Mantem a leitura operacional separada da pausa por contato.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const state = { json: null, timer: null, bloqueado: false };

  function setStatus(texto, classe = '') {
    const box = $('globalPauseStatus');
    if (!box) return;
    box.className = `result-box${classe ? ` ${classe}` : ''}`;
    box.textContent = texto;
  }

  function formatarStatus(data) {
    const globalAtiva = data?.modoGlobal === 'default_off';
    return [
      `Pausa global ativa: ${globalAtiva ? 'sim' : 'nao'}`,
      `Modo global: ${globalAtiva ? 'desligada por padrao' : 'liberada por padrao'}`,
      `Motivo global: ${data?.globalMotivo || 'sem motivo registrado'}`,
      `Contatos pausados manualmente: ${Array.isArray(data?.contatos) ? data.contatos.length : 0}`,
      `Contatos liberados individualmente: ${Array.isArray(data?.contatosAtivos) ? data.contatosAtivos.length : 0}`,
    ].join('\n');
  }

  async function carregarEstado() {
    if (state.bloqueado) return;
    try {
      const data = await state.json('/api/pausa');
      setStatus(formatarStatus(data), data?.modoGlobal === 'default_off' ? 'warn' : 'ok');
    } catch (error) {
      if (/autentic|autoriz|admin/i.test(String(error?.message || ''))) {
        state.bloqueado = true;
        if (state.timer) clearInterval(state.timer);
        return setStatus('Seu login atual nao pode consultar a pausa global da IA.', 'warn');
      }
      setStatus(error.message || 'Falha ao consultar o estado global da IA.', 'warn');
    }
  }

  async function pausarGlobalmente() {
    if (state.bloqueado) return;
    const btn = $('pauseGlobalBtn');
    btn.disabled = true;
    setStatus('Desligando a IA globalmente...');
    try {
      await state.json('/api/pausa/global', {
        method: 'POST',
        body: JSON.stringify({
          motivo: $('globalPauseReason').value.trim() || 'pausado_globalmente_pelo_monitor_phone',
        }),
      });
      await carregarEstado();
    } catch (error) {
      setStatus(error.message || 'Falha ao desligar a IA globalmente.', 'warn');
    } finally {
      btn.disabled = false;
    }
  }

  async function liberarGlobalmente() {
    if (state.bloqueado) return;
    const btn = $('resumeGlobalBtn');
    btn.disabled = true;
    setStatus('Liberando a IA globalmente...');
    try {
      await state.json('/api/pausa/global', { method: 'DELETE' });
      await carregarEstado();
    } catch (error) {
      setStatus(error.message || 'Falha ao liberar a IA globalmente.', 'warn');
    } finally {
      btn.disabled = false;
    }
  }

  function iniciarPolling() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(() => {
      carregarEstado().catch(() => undefined);
    }, 4000);
  }

  function iniciar() {
    state.json = window.PhoneMonitorPage?.json?.bind(window.PhoneMonitorPage) || window.IagmxPainelAuth?.json;
    if (!state.json) return;
    $('pauseGlobalBtn')?.addEventListener('click', pausarGlobalmente);
    $('resumeGlobalBtn')?.addEventListener('click', liberarGlobalmente);
    $('refreshGlobalPauseBtn')?.addEventListener('click', () => carregarEstado());
    carregarEstado().catch(() => undefined);
    iniciarPolling();
  }

  let iniciado = false;
  window.addEventListener('phone-monitor-ready', () => {
    if (iniciado) return;
    iniciado = true;
    iniciar();
  });
})();
