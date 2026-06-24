/**
 * Painel de auditoria do /phone ligado ao backend real.
 * Carrega jornadas atuais e a oferta proativa montada pelos serviços reais.
 * Recarrega somente sob comando do operador.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const state = { idx: 0, msg: {}, conversations: [], loaded: false, loading: false };

  function current() {
    return state.conversations[state.idx] || null;
  }

  function selected(conv) {
    if (!conv) return null;
    const chosen = conv.messages.find((m) => m.id === state.msg[conv.id] && m.audit);
    return chosen || [...conv.messages].reverse().find((m) => m.audit) || null;
  }

  function renderEmpty(text) {
    $('simConversationTabs').innerHTML = '';
    $('simConversationMeta').innerHTML = '';
    $('simMessages').innerHTML = `<div class="empty-inline">${esc(text)}</div>`;
    $('simAuditPanel').innerHTML = `<div class="audit-box"><div class="audit-label">Auditoria</div><div class="audit-value">${esc(text)}</div></div>`;
    $('simCurrentConversationMeta').textContent = 'Sem carga';
    $('simConversationProgressLabel').textContent = '0%';
    $('simConversationProgressBar').style.width = '0%';
  }

  function renderTabs() {
    $('simConversationTabs').innerHTML = state.conversations.map((c, idx) => `
      <button class="pill ${idx === state.idx ? 'active' : ''}" data-sim-tab="${idx}">
        <span>${esc(c.title)}</span>
        <strong>${esc(c.progressLabel || `${c.progressPct || 100}%`)}</strong>
      </button>
    `).join('');
    document.querySelectorAll('[data-sim-tab]').forEach((btn) => btn.addEventListener('click', () => {
      state.idx = Number(btn.dataset.simTab);
      render();
    }));
  }

  function renderMessages(conv, chosen) {
    $('simMessages').innerHTML = conv.messages.map((m) => `
      <div class="message-row ${m.role}">
        <button type="button" class="bubble ${m.role === 'assistant' ? 'assistant' : ''} ${chosen?.id === m.id ? 'selected' : ''}" data-sim-msg="${m.id}">
          <div class="bubble-head"><span>${esc(m.role === 'assistant' ? 'IA GMX' : m.name)}</span><span>${esc(m.time)}</span></div>
          <div class="bubble-body">${esc(m.text)}</div>
          ${m.audit ? `<div class="bubble-tags">${(m.audit.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        </button>
      </div>
    `).join('');
    document.querySelectorAll('[data-sim-msg]').forEach((btn) => btn.addEventListener('click', () => {
      const msg = conv.messages.find((m) => m.id === btn.dataset.simMsg);
      if (!msg?.audit) return;
      state.msg[conv.id] = msg.id;
      renderAudit(msg);
      renderMessages(conv, msg);
    }));
  }

  function renderAudit(chosen) {
    if (!chosen?.audit) {
      $('simAuditPanel').innerHTML = '<div class="audit-box"><div class="audit-label">Auditoria</div><div class="audit-value">Selecione uma mensagem da IA.</div></div>';
      return;
    }
    $('simAuditPanel').innerHTML = `
      <div class="audit-box">
        <div class="audit-label">Motivo da resposta</div>
        <div class="audit-value">${esc(chosen.audit.reason)}</div>
      </div>
      <div class="audit-box">
        <div class="audit-label">Regra carregada no backend</div>
        <pre class="code-block">${esc(chosen.audit.prompt || 'Sem texto complementar')}</pre>
      </div>
      <div class="audit-box">
        <div class="audit-label">Escrita operacional prevista</div>
        <span class="section-copy">Cada acao mostra a entidade, os campos e o efeito operacional esperado.</span>
        ${chosen.audit.erp?.length ? `<div class="object-list">${chosen.audit.erp.map((item) => `
          <div class="mini-card">
            <strong>${esc(item.entity)} · ${esc(item.action)}</strong>
            <p>${esc(item.time)}</p>
            <div class="structured-grid">${Object.entries(item.fields || {}).map(([k, v]) => `
              <div class="structured-card"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>
            `).join('')}</div>
            <span class="helper-line">Resultado: ${esc(item.result)}</span>
          </div>`).join('')}</div>` : '<div class="audit-value">Nenhuma escrita nesta etapa.</div>'}
      </div>
    `;
  }

  function renderMeta(conv) {
    $('simCurrentConversationMeta').textContent = conv.meta || 'Backend real';
    $('simConversationMeta').innerHTML = `
      <div><strong>${esc(conv.nome)}</strong> · ${esc(conv.phone)}</div>
      <div>Resumo: ${esc(conv.resumo)}</div>
      <div>Resultado esperado: ${esc(conv.esperado)}</div>
      <div>Origem: auditoria real do backend</div>
    `;
    $('simConversationProgressLabel').textContent = esc(conv.progressLabel || `${conv.progressPct || 100}%`);
    $('simConversationProgressBar').style.width = `${Math.max(0, Math.min(100, Number(conv.progressPct || 100)))}%`;
  }

  function render() {
    const conv = current();
    if (!conv) {
      renderEmpty('Nenhuma jornada auditavel carregada.');
      return;
    }
    const chosen = selected(conv);
    renderTabs();
    renderMeta(conv);
    renderMessages(conv, chosen);
    renderAudit(chosen);
  }

  async function load(force = false) {
    if (state.loading) return;
    if (state.loaded && !force) return;
    state.loading = true;
    const btn = $('simReloadBtn');
    if (btn) btn.disabled = true;
    try {
      const data = await IagmxPainelAuth.json('/api/admin/simulador/auditoria');
      state.conversations = Array.isArray(data.conversations) ? data.conversations : [];
      state.loaded = true;
      if (state.idx >= state.conversations.length) state.idx = 0;
      render();
    } catch (error) {
      renderEmpty(error?.message || 'Falha ao carregar a auditoria real.');
    } finally {
      state.loading = false;
      if (btn) btn.disabled = false;
    }
  }

  $('simReloadBtn')?.addEventListener('click', () => load(true));
  window.addEventListener('phone-monitor-ready', () => load(false), { once: true });
})();
