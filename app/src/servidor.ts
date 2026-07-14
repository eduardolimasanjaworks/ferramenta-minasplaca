/**
 * Servidor Fastify — Minas Placa clean.
 */
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { rotasWebhook } from './webhook-evolution.js';
import { rotasWebhookUazapi } from './webhook-uazapi.js';
import { rotasWebhookChatwoot } from './webhook-chatwoot.js';
import { rotasChatwootSso } from './chatwoot-sso.js';
import { rotasPainelEventos } from './painel-eventos.js';
import { rotasSaude } from './saude-minasplaca.js';
import {
  criarToken,
  definirCookieSessao,
  limparCookieSessao,
  ehCaminhoPublico,
  estaAutenticado,
  loginComCredenciais,
  obterUsuarioDaSessao,
  ttlSessao,
} from './auth-minasplaca.js';
import { alterarSenhaUsuario } from './usuarios-store.js';
import { atualizarUsuarioChatwoot } from './chatwoot-usuarios.js';
import { rotasUsuariosPainel } from './usuarios-rotas.js';
import { rotasCrm } from './crm-rotas.js';
import { rotasWhatsappPainel } from './whatsapp-rotas.js';

const PAGINA_LOGIN = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TechFala — Acesso</title>
<link rel="icon" type="image/png" href="/assets/favicon.png">
<style>
  :root { --brand: #111224; --brand2: #1e2140; --accent: #ff2e88; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; }
  .wrap { display: flex; min-height: 100vh; }

  /* Painel esquerdo (branding) */
  .side {
    flex: 1; position: relative; color: #fff; padding: 40px 48px;
    display: flex; flex-direction: column; align-items: center;
    background: radial-gradient(circle at 10% 10%, var(--brand), #050505);
    overflow: hidden; text-align: center;
  }
  .pcanvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }
  .side .center, .side .legal { position: relative; z-index: 1; }
  .brand-logo { width: 210px; max-width: 62%; margin: 0 auto 8px; display: block; }
  .center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; max-width: 460px; }
  .slide { display: none; }
  .slide.active { display: block; animation: fade .6s ease; }
  @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .slide h2 { font-size: 30px; line-height: 1.25; margin: 0 0 16px; font-weight: 800; }
  .slide p { color: #c9cbe0; font-size: 15px; line-height: 1.7; margin: 0; }
  .dots { display: flex; gap: 9px; justify-content: center; margin-top: 34px; }
  .dots span { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.28); cursor: pointer; transition: background .2s, width .2s; }
  .dots span.on { background: #fff; width: 22px; border-radius: 5px; }
  .legal { font-size: 12px; color: #8a8da8; }
  .legal a { color: #c9cbe0; text-decoration: none; }

  /* Painel direito (form) */
  .panel { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px; background: #fff; }
  .card { width: 100%; max-width: 380px; }
  .card-logo { width: 54px; height: 54px; object-fit: contain; display: block; margin: 0 auto 14px; }
  .card h1 { font-size: 22px; margin: 0 0 6px; text-align: center; }
  .card .sub { color: #666; font-size: 14px; margin-bottom: 22px; text-align: center; }
  .tabs { display: flex; gap: 6px; background: #f1f2f5; border-radius: 10px; padding: 5px; margin-bottom: 24px; }
  .tab { flex: 1; border: none; border-radius: 7px; padding: 9px; font-size: 14px; font-weight: 600; cursor: pointer;
    background: transparent; color: #888; }
  .tab.on { background: #fff; color: var(--brand); box-shadow: 0 0 5px rgba(0,0,0,0.06); }
  .ou { display: flex; align-items: center; gap: 12px; margin: 20px 0; color: #999; font-size: 13px; }
  .ou span { flex: 1; height: 1px; background: #e6e6e6; }
  label { display: block; font-size: 13px; color: #333; margin-bottom: 7px; font-weight: 500; }
  .field { margin-bottom: 18px; }
  .input-wrap { position: relative; }
  input[type=email], input[type=password], input[type=text] {
    width: 100%; padding: 12px 13px; border: 1px solid #dcdfe4; border-radius: 10px; font-size: 15px;
    transition: border-color .15s, box-shadow .15s;
  }
  input:focus { outline: none; border-color: var(--brand2); box-shadow: 0 0 0 3px rgba(30,33,64,0.1); }
  .eye { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none;
    cursor: pointer; font-size: 16px; color: #888; padding: 6px; }
  .row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; font-size: 13px; }
  .row label { display: flex; align-items: center; gap: 7px; margin: 0; font-weight: 400; color: #444; cursor: pointer; }
  .row a { color: var(--brand); text-decoration: none; }
  .entrar { width: 100%; border: none; border-radius: 10px; padding: 13px; font-size: 15px; font-weight: 600; color: #fff;
    cursor: pointer; background: radial-gradient(circle at 10% 10%, var(--brand), rgba(17,18,36,0.85)); }
  .entrar:disabled { opacity: .6; cursor: not-allowed; }
  .erro { color: #c0392b; font-size: 13px; margin-bottom: 14px; min-height: 18px; text-align: center; }

  @media (max-width: 860px) { .side { display: none; } }
</style></head>
<body>
  <div class="wrap">
    <div class="side">
      <canvas id="particles" class="pcanvas"></canvas>
      <div class="center">
        <img class="brand-logo" src="https://xltw-api6-8lww.b2.xano.io/vault/4kRWyNwe/QezP_u6Ao3VM3NmOboZ2I76BdTg/-rHoZw../logotipo+%2811%29.png" alt="TechFala">
        <div class="slide" data-slide>
          <h2>Não somos um chatbot, somos o futuro</h2>
          <p>Utilize a nossa solução inteligente para transformar a comunicação da sua empresa com atendimento de qualidade e eficiência.</p>
        </div>
        <div class="slide" data-slide>
          <h2>Descubra um futuro de possibilidades</h2>
          <p>A nossa IA proporciona resultados impressionantes, aumentando a satisfação dos clientes e otimizando o tempo de atendimento.</p>
        </div>
        <div class="slide active" data-slide>
          <h2>O poder de uma IA em suas mãos</h2>
          <p>Controle o atendimento, o prompt e o CRM em um só painel — com a mesma clareza para toda a equipe.</p>
        </div>
        <div class="dots" id="dots"></div>
      </div>
      <div class="legal">Este site é regido pelas <a href="/termos.html" target="_blank" rel="noopener">Políticas de Privacidades</a> e pelas <a href="/termos.html" target="_blank" rel="noopener">Termos de Serviços.</a></div>
    </div>

    <div class="panel">
      <form class="card" onsubmit="entrar(event)">
        <img class="card-logo" src="https://xltw-api6-8lww.b2.xano.io/vault/4kRWyNwe/uCvgJQ866Y83SgLRht-OpKfZ_MI/248OYQ../TechFala+%281%29.png" alt="TechFala">
        <h1>Bem-vindo(a) de volta a TechFala</h1>
        <div class="sub">Digite as suas credenciais de login para continuar</div>

        <div class="tabs">
          <button type="button" class="tab on">Login</button>
        </div>

        <div id="erro" class="erro"></div>

        <div class="field">
          <label for="email">Endereço de E-mail: *</label>
          <input id="email" type="email" placeholder="Endereço de E-mail" autocomplete="email" autofocus required>
        </div>

        <div class="field">
          <label for="senha">Senha: *</label>
          <div class="input-wrap">
            <input id="senha" type="password" placeholder="Senha" autocomplete="current-password" required>
            <button type="button" class="eye" onclick="verSenha()" title="Mostrar/ocultar senha">👁</button>
          </div>
        </div>

        <div class="row">
          <label><input type="checkbox" id="lembrar"> Mantenha-me conectado</label>
        </div>

        <button id="btn" class="entrar" type="submit">Entrar</button>
      </form>
    </div>
  </div>

  <script>
    (function () {
      var slides = document.querySelectorAll('[data-slide]');
      var dots = document.getElementById('dots');
      var atual = 2;
      for (var i = 0; i < slides.length; i++) {
        (function (idx) {
          var s = document.createElement('span');
          if (idx === atual) s.className = 'on';
          s.onclick = function () { mostrar(idx); };
          dots.appendChild(s);
        })(i);
      }
      function mostrar(i) {
        atual = i;
        for (var k = 0; k < slides.length; k++) slides[k].classList.toggle('active', k === i);
        var ds = dots.children;
        for (var j = 0; j < ds.length; j++) ds[j].className = j === i ? 'on' : '';
      }
      setInterval(function () { mostrar((atual + 1) % slides.length); }, 5000);
    })();

    (function () {
      var c = document.getElementById('particles');
      if (!c) return;
      var ctx = c.getContext('2d');
      var w, h, pts;
      function dims() {
        var r = c.parentElement.getBoundingClientRect();
        w = c.width = Math.max(1, Math.floor(r.width));
        h = c.height = Math.max(1, Math.floor(r.height));
      }
      var LINK = 150;
      function init() {
        dims();
        var n = Math.max(70, Math.min(220, Math.floor((w * h) / 6500)));
        pts = [];
        for (var i = 0; i < n; i++) {
          pts.push({
            x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
          });
        }
      }
      function step() {
        ctx.clearRect(0, 0, w, h);
        for (var i = 0; i < pts.length; i++) {
          var p = pts[i];
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        }
        ctx.lineWidth = 1;
        for (var a = 0; a < pts.length; a++) {
          for (var b = a + 1; b < pts.length; b++) {
            var dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y;
            var d = Math.sqrt(dx * dx + dy * dy);
            if (d < LINK) {
              ctx.strokeStyle = 'rgba(255,255,255,' + (0.28 * (1 - d / LINK)) + ')';
              ctx.beginPath();
              ctx.moveTo(pts[a].x, pts[a].y);
              ctx.lineTo(pts[b].x, pts[b].y);
              ctx.stroke();
            }
          }
        }
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (var k = 0; k < pts.length; k++) {
          ctx.beginPath();
          ctx.arc(pts[k].x, pts[k].y, 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
        requestAnimationFrame(step);
      }
      var t;
      window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(init, 150); });
      init();
      step();
    })();

    function verSenha() {
      const i = document.getElementById('senha');
      i.type = i.type === 'password' ? 'text' : 'password';
    }

    const LS_LOGIN = 'mp_painel_login';

    function salvarLoginLocal(email, senha, lembrar) {
      try {
        localStorage.setItem(LS_LOGIN, JSON.stringify({
          email: email,
          senha: senha,
          lembrar: !!lembrar,
        }));
      } catch (_) {}
    }

    function carregarLoginLocal() {
      try {
        const raw = localStorage.getItem(LS_LOGIN);
        if (!raw) return;
        const d = JSON.parse(raw);
        if (d.email) document.getElementById('email').value = d.email;
        if (d.senha) document.getElementById('senha').value = d.senha;
        if (d.lembrar) document.getElementById('lembrar').checked = true;
      } catch (_) {}
    }

    carregarLoginLocal();

    async function entrar(e) {
      e.preventDefault();
      const btn = document.getElementById('btn');
      const erro = document.getElementById('erro');
      erro.textContent = '';
      btn.disabled = true;
      const email = document.getElementById('email').value;
      const senha = document.getElementById('senha').value;
      const lembrar = document.getElementById('lembrar').checked;
      try {
        const res = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, senha, lembrar }),
        });
        if (res.ok) {
          salvarLoginLocal(email, senha, lembrar);
          const params = new URLSearchParams(location.search);
          location.href = params.get('proximo') || '/phone.html?painel=whatsapp';
        } else {
          erro.textContent = 'E-mail ou senha incorretos.';
          btn.disabled = false;
        }
      } catch (err) {
        erro.textContent = 'Erro ao conectar. Tente novamente.';
        btn.disabled = false;
      }
    }
  </script>
</body></html>`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORIGENS_CORS = new Set(['https://iaminas.sanjaworks.com', 'http://iaminas.sanjaworks.com']);

export async function criarServidor() {
  const app = Fastify({ logger: true, bodyLimit: 26 * 1024 * 1024 });

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body: string, done) => {
    if (!body || body.trim() === '') {
      done(null, {});
    } else {
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        done(err as Error);
      }
    }
  });

  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_req, body: Buffer, done) => {
      done(null, body);
    },
  );

  app.addHook('onRequest', async (req, reply) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
    if (origin && ORIGENS_CORS.has(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, x-minasplaca-key, Authorization, X-Filename, X-Mime');
      if (req.method === 'OPTIONS') {
        return reply.code(204).send();
      }
    }
  });

  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') return;
    if (ehCaminhoPublico(req.url)) return;
    if (estaAutenticado(req)) return;

    const caminho = req.url.split('?')[0];
    if (caminho.startsWith('/api/') || caminho.startsWith('/webhook/')) {
      return reply.code(401).send({ ok: false, erro: 'Nao autenticado' });
    }
    const proximo = encodeURIComponent(req.url);
    return reply.redirect(`/login?proximo=${proximo}`);
  });

  app.get('/login', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store, must-revalidate');
    return reply.type('text/html').send(PAGINA_LOGIN);
  });

  app.post('/login', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string; senha?: string; lembrar?: boolean };
    const usuario = await loginComCredenciais(String(body.email ?? ''), String(body.senha ?? ''));
    if (!usuario) {
      return reply.code(401).send({ ok: false, erro: 'Credenciais invalidas' });
    }
    const ttl = ttlSessao(body.lembrar === true);
    definirCookieSessao(reply, criarToken(usuario.id, ttl), ttl);
    return { ok: true, usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome, role: usuario.role } };
  });

  app.get('/logout', async (_req, reply) => {
    limparCookieSessao(reply);
    return reply.redirect('/login');
  });

  app.get('/api/auth/perfil', async (req, reply) => {
    const u = await obterUsuarioDaSessao(req);
    if (!u) return reply.code(401).send({ ok: false, erro: 'Nao autenticado' });
    return {
      ok: true,
      id: u.id,
      email: u.email,
      nome: u.nome,
      role: u.role,
      abas: u.role === 'admin' ? undefined : u.abas,
      admin: u.role === 'admin',
      chatwoot_user_id: u.chatwoot_user_id,
    };
  });

  app.post('/api/auth/alterar-senha', async (req, reply) => {
    const u = await obterUsuarioDaSessao(req);
    if (!u) return reply.code(401).send({ ok: false, erro: 'Nao autenticado' });

    const body = (req.body ?? {}) as {
      senha_atual?: string;
      senha_nova?: string;
      senha_nova_confirmacao?: string;
    };
    const atual = String(body.senha_atual ?? '');
    const nova = String(body.senha_nova ?? '');
    const conf = String(body.senha_nova_confirmacao ?? body.senha_nova ?? '');

    if (nova.length < 8) {
      return reply.status(400).send({ ok: false, erro: 'Nova senha deve ter pelo menos 8 caracteres' });
    }
    if (nova !== conf) {
      return reply.status(400).send({ ok: false, erro: 'Confirmacao da nova senha nao confere' });
    }

    try {
      await alterarSenhaUsuario(u.id, atual, nova);
      let chatwoot: { ok: boolean; motivo?: string } | null = null;
      if (u.chatwoot_user_id) {
        chatwoot = await atualizarUsuarioChatwoot(u.chatwoot_user_id, { senha: nova });
      }
      return { ok: true, mensagem: 'Senha alterada com sucesso', chatwoot };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ ok: false, erro: msg });
    }
  });

  await app.register(fastifyStatic, {
    root: resolve(__dirname, '../public'),
    prefix: '/',
    setHeaders(res, pathName) {
      const p = pathName.replace(/\\/g, '/');
      if (p.endsWith('.html') || p.endsWith('/crm') || p.endsWith('/crm/')) {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
      } else if (p.includes('/crm/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });

  app.addHook('onSend', async (req, reply, payload) => {
    const url = req.url.split('?')[0];
    if (url.startsWith('/api/crm') || url.startsWith('/api/auth')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
      reply.header('Pragma', 'no-cache');
    }
    return payload;
  });

  await app.register(rotasSaude);
  await app.register(rotasWebhook);
  await app.register(rotasWebhookUazapi);
  await app.register(rotasWebhookChatwoot);
  await app.register(rotasPainelEventos);
  await app.register(rotasChatwootSso);
  await app.register(rotasUsuariosPainel);
  await app.register(rotasCrm);
  await app.register(rotasWhatsappPainel);

  app.get('/', async (_req, reply) => reply.redirect('/phone.html?painel=whatsapp'));
  app.get('/whatsapp', async (_req, reply) => reply.redirect('/phone.html?painel=whatsapp'));
  app.get('/phone', async (_req, reply) => reply.redirect('/phone.html'));

  return app;
}

export async function iniciarServidor() {
  const app = await criarServidor();
  await app.listen({ port: config.porta, host: '0.0.0.0' });
  console.log(`[servidor] Rodando na porta ${config.porta}`);
  return app;
}
