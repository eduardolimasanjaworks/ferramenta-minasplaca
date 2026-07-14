#!/usr/bin/env node
/**
 * Bateria de testes do CRM (API).
 *
 * Uso:
 *   node scripts/teste-crm.mjs
 *   TEST_BASE_URL=http://127.0.0.1:8096 \
 *   TEST_EMAIL=admin@tilitgroup.com \
 *   TEST_SENHA='Tilit2026!' \
 *   node scripts/teste-crm.mjs
 */
const BASE = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8095').replace(/\/$/, '')
const EMAIL = process.env.TEST_EMAIL || 'admin@minasplaca.com'
const SENHA = process.env.TEST_SENHA || 'MinasPlaca2026!'

const results = []
let cookie = ''

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function api(path, opts = {}) {
  const headers = {
    ...(opts.body && !(opts.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(opts.headers || {}),
  }
  if (cookie) headers.Cookie = cookie
  const res = await fetch(`${BASE}${path}`, { ...opts, headers })
  const setCookie = res.headers.getSetCookie?.() || []
  for (const c of setCookie) {
    const part = c.split(';')[0]
    if (part) cookie = cookie ? `${cookie}; ${part}` : part
  }
  const sc = res.headers.get('set-cookie')
  if (sc && !cookie.includes('mp_session')) {
    cookie = sc
      .split(',')
      .map((x) => x.split(';')[0].trim())
      .join('; ')
  }
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { _raw: text }
  }
  return { res, data }
}

async function run(name, fn) {
  const t0 = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - t0 })
    console.log(`PASS  ${name} (${Date.now() - t0}ms)`)
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, erro: e.message })
    console.error(`FAIL  ${name}: ${e.message}`)
  }
}

async function login() {
  const { res, data } = await api('/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, senha: SENHA }),
  })
  assert(res.ok && data?.ok !== false, `login falhou: ${res.status}`)
  if (!cookie) {
    const raw = res.headers.get('set-cookie')
    assert(raw, 'login sem Set-Cookie')
    cookie = raw
      .split(',')
      .map((x) => x.split(';')[0].trim())
      .join('; ')
  }
}

async function main() {
  console.log(`\n=== CRM battery @ ${BASE} (${EMAIL}) ===\n`)

  let colunaId = ''
  let coluna2 = ''
  let contatoId = ''
  let campoId = ''
  let tagId = ''
  const telUnico = `3199${String(Date.now()).slice(-7)}`

  await run('01 auth login', login)

  await run('02 board GET', async () => {
    const { res, data } = await api('/api/crm/board')
    assert(res.ok && data.ok, `board: ${res.status}`)
    assert(data.colunas.length > 0, 'sem colunas')
    colunaId = data.colunas[0].id
    coluna2 = data.colunas[1]?.id || data.colunas[0].id
  })

  await run('03 usuarios GET', async () => {
    const { res, data } = await api('/api/crm/usuarios')
    assert(res.ok && data.ok, `usuarios: ${res.status}`)
    assert(Array.isArray(data.usuarios), 'lista usuarios')
  })

  await run('04 contato sem telefone rejeitado', async () => {
    const { res, data } = await api('/api/crm/contatos', {
      method: 'POST',
      body: JSON.stringify({ colunaId, nome: 'Sem Tel' }),
    })
    assert(res.status === 400 && data.codigo === 'telefone_obrigatorio', 'esperado telefone_obrigatorio')
  })

  await run('05 contato POST com telefone+IA', async () => {
    const { res, data } = await api('/api/crm/contatos', {
      method: 'POST',
      body: JSON.stringify({
        colunaId,
        nome: `Battery ${Date.now()}`,
        telefone: telUnico,
        ddi: '+55',
        iaAtiva: false,
      }),
    })
    assert(res.ok && data.ok && data.contato?.id, `criar: ${JSON.stringify(data)}`)
    assert(data.contato.telefone.replace(/\D/g, '').endsWith(telUnico.slice(-8)), 'telefone gravado')
    assert(data.contato.automacaoAtiva === false, 'ia off')
    contatoId = data.contato.id
  })

  await run('06 telefone duplicado', async () => {
    const { res, data } = await api('/api/crm/contatos', {
      method: 'POST',
      body: JSON.stringify({
        colunaId,
        nome: 'Dup',
        telefone: telUnico,
        ddi: '+55',
      }),
    })
    assert(res.status === 409 && data.codigo === 'telefone_duplicado', 'esperado 409')
    assert(data.contatoExistenteId === contatoId, 'id existente')
  })

  await run('07 mover contato', async () => {
    const { res, data } = await api(`/api/crm/contatos/${contatoId}/mover`, {
      method: 'POST',
      body: JSON.stringify({ colunaId: coluna2 }),
    })
    assert(res.ok && data.contato.colunaId === coluna2, 'mover')
  })

  await run('08 tags catalogo CRUD', async () => {
    const nome = `tag-bat-${Date.now()}`
    const { res, data } = await api('/api/crm/tags', {
      method: 'POST',
      body: JSON.stringify({ nome }),
    })
    assert(res.ok && data.tag?.id, `criar tag: ${JSON.stringify(data)}`)
    tagId = data.tag.id
    const { data: d2 } = await api(`/api/crm/contatos/${contatoId}`, {
      method: 'PATCH',
      body: JSON.stringify({ tags: [nome] }),
    })
    assert(d2.contato.tags.includes(nome), 'tag no contato')
  })

  await run('09 campos rename/desativar', async () => {
    const { data } = await api('/api/crm/campos', {
      method: 'POST',
      body: JSON.stringify({
        nome: `CampoBat-${Date.now()}`,
        descricao: '',
        ativo: true,
        tipo: 'texto',
        opcoes: [],
      }),
    })
    campoId = data.campo.id
    const nome1 = data.campo.nome
    await api(`/api/crm/contatos/${contatoId}`, {
      method: 'PATCH',
      body: JSON.stringify({ camposPersonalizados: { [nome1]: 'v1' } }),
    })
    const nome2 = `${nome1}-ren`
    await api(`/api/crm/campos/${campoId}`, {
      method: 'PATCH',
      body: JSON.stringify({ nome: nome2 }),
    })
    const { data: c } = await api(`/api/crm/contatos/${contatoId}`)
    assert(c.contato.camposPersonalizados[nome2] === 'v1', 'rename migrou')
    assert(!c.contato.camposPersonalizados[nome1], 'chave antiga sumiu')
    await api(`/api/crm/campos/${campoId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: false }),
    })
    const { data: c2 } = await api(`/api/crm/contatos/${contatoId}`)
    assert(!c2.contato.camposPersonalizados[nome2], 'desativar apagou valor')
  })

  await run('10 coluna cor', async () => {
    const { res, data } = await api(`/api/crm/colunas/${colunaId}`, {
      method: 'PATCH',
      body: JSON.stringify({ cor: 'rgb(16, 185, 129)' }),
    })
    assert(res.ok && data.coluna.cor.includes('16'), 'cor')
  })

  await run('11 CRM html', async () => {
    const { res } = await api('/crm/')
    assert(res.ok, `crm html ${res.status}`)
  })

  await run('12 auth 401', async () => {
    const saved = cookie
    cookie = ''
    const { res } = await api('/api/crm/board')
    cookie = saved
    assert(res.status === 401, `401 got ${res.status}`)
  })

  await run('13 cleanup', async () => {
    if (tagId) await api(`/api/crm/tags/${tagId}`, { method: 'DELETE' })
    if (campoId) await api(`/api/crm/campos/${campoId}`, { method: 'DELETE' })
    if (contatoId) await api(`/api/crm/contatos/${contatoId}`, { method: 'DELETE' })
  })

  const failed = results.filter((r) => !r.ok)
  console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===\n`)
  if (failed.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
