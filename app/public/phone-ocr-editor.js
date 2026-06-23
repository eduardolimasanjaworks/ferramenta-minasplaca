/**
 * Editor guiado do OCR dentro do /phone.
 * Usa listas assertivas de campos e destinos para evitar configuracao solta.
 * Mantem o CRUD de OCR separado do CRUD de jornadas para ficar modular.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    json: null,
    docs: [],
    docId: '',
    ocr: { tiposDocumento: [], areasBanco: [], chavesPorTipo: {}, camposAreaPorDestino: {}, camposCadastro: [] },
  };
  const AREA_PADRAO = { cnh: 'cnh', crlv: 'crlv', antt: 'antt', endereco: 'comprovante_endereco', foto: 'fotos' };

  function setBox(id, text, kind = '') {
    const el = $(id);
    if (!el) return;
    el.className = `result-box${kind ? ` ${kind}` : ''}`;
    el.textContent = text;
  }

  function nId(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  }

  function pickById(list, id) {
    return list.find((item) => item.id === id) || null;
  }

  function optionsHtml(list, current, empty) {
    return [`<option value=\"\">${empty}</option>`].concat((list || []).map((item) => `<option value=\"${item.value}\" ${item.value === current ? 'selected' : ''}>${item.label}</option>`)).join('');
  }

  function blankDoc(seed = {}) {
    return { id: '', rotulo: '', tipoDocumento: '', colecao: '', dicaPrompt: '', ativo: true, campos: [], ...seed };
  }

  function blankCampo(seed = {}) {
    return { id: '', rotulo: '', chaveExtraida: '', campoDirectus: '', destino: 'documento', regex: '', ...seed };
  }

  function areaOptions(tipo) {
    return state.ocr.areasBanco.filter((item) => item.value === (AREA_PADRAO[tipo] || item.value));
  }

  function renderDocSelect() {
    $('ocrDocSelect').innerHTML = ['<option value=\"\">Novo documento</option>'].concat(state.docs.map((item) => `<option value=\"${item.id}\">${item.rotulo || item.id}</option>`)).join('');
    $('ocrDocSelect').value = state.docId || '';
  }

  function renderTypeAndArea(data) {
    $('ocrDocTipo').innerHTML = optionsHtml(state.ocr.tiposDocumento, data.tipoDocumento, 'Escolha o tipo');
    $('ocrDocColecao').innerHTML = optionsHtml(areaOptions(data.tipoDocumento), data.colecao, 'Escolha a area');
  }

  function chaveOptions(tipo) {
    return state.ocr.chavesPorTipo[tipo] || [];
  }

  function destinoOptions(destino, area) {
    return destino === 'motorista' ? state.ocr.camposCadastro : (state.ocr.camposAreaPorDestino[area] || []);
  }

  function collectCampos() {
    return Array.from(document.querySelectorAll('#ocrCamposList .stack-item')).map((row, index) => {
      const read = (name) => row.querySelector(`[data-name=\"${name}\"]`)?.value || '';
      return blankCampo({ id: read('id') || `campo_${index + 1}`, rotulo: read('rotulo').trim(), chaveExtraida: read('chaveExtraida').trim(), campoDirectus: read('campoDirectus').trim(), destino: read('destino') === 'motorista' ? 'motorista' : 'documento', regex: read('regex').trim() });
    }).filter((campo) => campo.chaveExtraida && campo.campoDirectus);
  }

  function renderCampos(campos) {
    const area = $('ocrDocColecao').value;
    const tipo = $('ocrDocTipo').value;
    $('ocrCamposList').innerHTML = (campos || []).map((item, index) => {
      const campo = blankCampo(item || {});
      return `<div class=\"stack-item\" data-index=\"${index}\"><div class=\"stack-grid guided-grid\">
        <div class=\"field compact-field\"><label>Nome interno</label><input data-name=\"id\" type=\"text\" value=\"${campo.id}\" readonly /></div>
        <div class=\"field compact-field\"><label>Rotulo</label><input data-name=\"rotulo\" type=\"text\" value=\"${campo.rotulo}\" placeholder=\"Ex.: CPF do motorista\" /></div>
        <div class=\"field compact-field\"><label>Campo lido</label><select data-name=\"chaveExtraida\">${optionsHtml(chaveOptions(tipo), campo.chaveExtraida, 'Escolha o campo lido')}</select></div>
        <div class=\"field compact-field\"><label>Salvar em</label><select data-name=\"destino\"><option value=\"documento\" ${campo.destino === 'documento' ? 'selected' : ''}>Documento</option><option value=\"motorista\" ${campo.destino === 'motorista' ? 'selected' : ''}>Cadastro principal</option></select></div>
        <div class=\"field compact-field\"><label>Campo do banco</label><select data-name=\"campoDirectus\">${optionsHtml(destinoOptions(campo.destino, area), campo.campoDirectus, 'Escolha o destino')}</select></div>
        <div class=\"field compact-field\"><label>Regra extra</label><input data-name=\"regex\" type=\"text\" value=\"${campo.regex || ''}\" placeholder=\"Opcional\" /></div>
      </div><button class=\"stack-remove\" type=\"button\" data-remove-index=\"${index}\">Remover campo</button></div>`;
    }).join('') || '<div class=\"stack-empty\">Nenhum campo configurado para este documento.</div>';
  }

  function syncDocIdentity(keepLabel = true) {
    const tipo = $('ocrDocTipo').value;
    const tipoOpt = state.ocr.tiposDocumento.find((item) => item.value === tipo);
    $('ocrDocId').value = tipo;
    $('ocrDocColecao').value = AREA_PADRAO[tipo] || '';
    if (!keepLabel || !$('ocrDocRotulo').value.trim()) $('ocrDocRotulo').value = tipoOpt?.label || '';
  }

  function fillDocForm(item) {
    const data = blankDoc(item || {});
    renderTypeAndArea(data);
    $('ocrDocId').value = data.id;
    $('ocrDocRotulo').value = data.rotulo;
    $('ocrDocDica').value = data.dicaPrompt;
    $('ocrDocAtivo').checked = data.ativo !== false;
    renderCampos(data.campos || []);
  }

  function collectDocForm() {
    return blankDoc({ id: $('ocrDocId').value, rotulo: $('ocrDocRotulo').value.trim(), tipoDocumento: $('ocrDocTipo').value.trim(), colecao: $('ocrDocColecao').value.trim(), dicaPrompt: $('ocrDocDica').value.trim(), ativo: $('ocrDocAtivo').checked, campos: collectCampos() });
  }

  function selectDoc(id) {
    state.docId = id || '';
    renderDocSelect();
    fillDocForm(pickById(state.docs, state.docId));
  }

  async function loadOcr(statusText) {
    const [docData, promptData] = await Promise.all([state.json('/api/admin/ocr-documentos'), state.json('/api/config/ocr')]);
    state.docs = docData.documentos || [];
    state.ocr = docData.opcoes || state.ocr;
    if (!pickById(state.docs, state.docId)) state.docId = state.docs[0]?.id || '';
    renderDocSelect();
    fillDocForm(pickById(state.docs, state.docId));
    $('ocrPrompt').value = promptData.prompt || '';
    $('ocrPromptForcado').value = promptData.promptForcado || '';
    if (statusText) setBox('editorOcrStatus', statusText, 'ok');
  }

  async function saveDoc() {
    const body = collectDocForm();
    if (!body.id || !body.tipoDocumento || !body.colecao) return setBox('editorOcrStatus', 'Escolha tipo, area e campos obrigatorios antes de salvar.', 'warn');
    const currentId = state.docId;
    const data = await state.json(currentId ? `/api/admin/ocr-documentos/${encodeURIComponent(currentId)}` : '/api/admin/ocr-documentos', { method: currentId ? 'PUT' : 'POST', body: JSON.stringify(body) });
    state.docs = data.documentos || [];
    state.docId = nId(body.id || body.tipoDocumento);
    renderDocSelect();
    fillDocForm(pickById(state.docs, state.docId));
    setBox('editorOcrStatus', data.mensagem || 'Documento OCR salvo com sucesso.', 'ok');
  }

  async function deleteDoc() {
    if (!state.docId) return setBox('editorOcrStatus', 'Selecione um documento salvo para excluir.', 'warn');
    if (!window.confirm(`Excluir o documento OCR \"${state.docId}\"?`)) return;
    const data = await state.json(`/api/admin/ocr-documentos/${encodeURIComponent(state.docId)}`, { method: 'DELETE' });
    state.docs = data.documentos || [];
    state.docId = state.docs[0]?.id || '';
    renderDocSelect();
    fillDocForm(pickById(state.docs, state.docId));
    setBox('editorOcrStatus', data.mensagem || 'Documento OCR removido.', 'ok');
  }

  async function savePrompts() {
    await state.json('/api/config/ocr', { method: 'PUT', body: JSON.stringify({ prompt: $('ocrPrompt').value.trim(), promptForcado: $('ocrPromptForcado').value.trim() }) });
    setBox('editorOcrStatus', 'Prompts OCR salvos com sucesso.', 'ok');
  }

  function bind() {
    $('ocrDocSelect').addEventListener('change', () => selectDoc($('ocrDocSelect').value));
    $('ocrDocNovoBtn').addEventListener('click', () => { state.docId = ''; fillDocForm(blankDoc()); });
    $('ocrDocDuplicarBtn').addEventListener('click', () => fillDocForm(blankDoc({ ...collectDocForm(), id: `${nId($('ocrDocId').value || 'documento')}_copia`, rotulo: `${$('ocrDocRotulo').value.trim() || 'Novo documento'} copia` })));
    $('ocrDocTipo').addEventListener('change', () => { renderTypeAndArea({ tipoDocumento: $('ocrDocTipo').value, colecao: AREA_PADRAO[$('ocrDocTipo').value] || '' }); syncDocIdentity(false); renderCampos(collectCampos()); });
    $('ocrDocColecao').addEventListener('change', () => renderCampos(collectCampos()));
    $('ocrCampoAddBtn').addEventListener('click', () => renderCampos([...collectCampos(), blankCampo({ id: `campo_${collectCampos().length + 1}` })]));
    $('ocrCamposList').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-remove-index]');
      if (!btn) return;
      renderCampos(collectCampos().filter((_, idx) => idx !== Number(btn.dataset.removeIndex)));
    });
    $('ocrCamposList').addEventListener('change', (event) => {
      if (event.target.matches('[data-name=\"destino\"]')) renderCampos(collectCampos());
      if (event.target.matches('[data-name=\"chaveExtraida\"]')) {
        const row = event.target.closest('.stack-item');
        if (!row.querySelector('[data-name=\"rotulo\"]').value) row.querySelector('[data-name=\"rotulo\"]').value = event.target.value.replaceAll('_', ' ');
      }
    });
    $('ocrDocSalvarBtn').addEventListener('click', () => saveDoc().catch((error) => setBox('editorOcrStatus', error.message || 'Falha ao salvar documento OCR.', 'warn')));
    $('ocrDocExcluirBtn').addEventListener('click', () => deleteDoc().catch((error) => setBox('editorOcrStatus', error.message || 'Falha ao excluir documento OCR.', 'warn')));
    $('ocrPromptSalvarBtn').addEventListener('click', () => savePrompts().catch((error) => setBox('editorOcrStatus', error.message || 'Falha ao salvar prompts OCR.', 'warn')));
  }

  let started = false;
  window.addEventListener('phone-monitor-ready', () => {
    if (started) return;
    started = true;
    state.json = window.PhoneMonitorPage?.json?.bind(window.PhoneMonitorPage) || window.IagmxPainelAuth?.json;
    if (!state.json) return;
    bind();
    loadOcr('Configuracao OCR carregada e pronta para salvar.').catch((error) => setBox('editorOcrStatus', error.message || 'Falha ao carregar editor OCR.', 'warn'));
  });
})();
