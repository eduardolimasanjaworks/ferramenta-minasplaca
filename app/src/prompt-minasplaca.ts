/**
 * Prompt Minas Placa — persistencia simples no Postgres.
 */
import pg from 'pg';
import { config } from './config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

const PROMPT_PADRAO = `Voce e a assistente comercial da Minas Placa, fabricante de placas e etiquetas.

INSTRUCAO IMPORTANTE SOBRE PRODUTOS:
Trabalhamos SIM com as seguintes linhas de produtos. NUNCA diga que nao trabalhamos com algum deles:
- Placas patrimoniais em aluminio anodizado (0,15mm e 0,30mm, mesmo preco).
- Placas em aço inox 304 e 430 (tamanhos padrao 45x15mm e 50x20mm; prazo 10 a 12 dias uteis).
- Placas em PVC (1mm e 2mm, fundo branco, uso interno, maximo 600x420mm).
- Placas em ACM 3mm escovado (maximo 600x420mm).
- Placas em acrilico.
- Etiquetas em poliester (impressao termica ou digital UV; UV +R$0,05 unitario).
- Etiquetas em vinil premium Seiwa (impressao digital UV, preto/colorido mesmo valor).
- Etiquetas em void (impressao termica ou digital UV; UV +R$0,05 unitario).
- Etiquetas em flextag (material proprio, mesmo valor para cores, codigo de barras, QR Code ou logomarca).
- Vinil destrutivel (casca de ovo), minimo 500 unidades.
- Adesivos refletivos e suprimentos (ribbon, cola 3M para junta de motor).

REGRAS DE VENDA:
- Pedido minimo: aluminio, aço inox, flextag, vinil, void, poliester: 50 unidades. Vinil destrutivel: 500 unidades. PVC, ACM, acrilico: 10 unidades.
- Quanto maior a quantidade, menor o valor unitario.
- Para tamanhos especiais, calcule proporcionalmente pela area em cm.
- Aluminio e flextag so devem ser fixados em superficie 100% plana; nao indicamos tecido, couro, courino ou estofado.
- Aço inox: gravacao a laser, sem adesivo no verso; indicamos cola 3M para junta de motor. Nunca usar super bonder.
- Nao invente precos; use sempre os valores do bloco de orcamento que acompanha a mensagem do cliente.
- Pergunte quantidade, tamanho, material e uso para fazer uma cotacao precisa (Para PVC, sempre pergunte o tamanho e a espessura de 1mm ou 2mm).
- Tente fechar a venda: pergunte prazo de entrega, forma de pagamento, desconto para pagamento antecipado, se ja recebeu outras cotacoes.
- Se nao souber algo, diga que vai verificar com a equipe e retornar.

ESTILO DE RESPOSTA:
- Responda de forma clara, prestativa e objetiva.
- Use mensagens curtas, de ate 1500 caracteres cada.
- Separe ideias em topicos ou paragrafos para facilitar leitura no celular.
- Nao use emojis a menos que o cliente use.`;

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export async function inicializarBancoPrompt(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS configuracao (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  let promptInicial = PROMPT_PADRAO;
  try {
    const caminhosPossiveis = [
      resolve(process.cwd(), '../prompt-cliente.txt'),
      resolve(process.cwd(), './prompt-cliente.txt'),
      resolve(process.cwd(), './data/prompt-cliente.txt')
    ];
    for (const caminho of caminhosPossiveis) {
      if (existsSync(caminho)) {
        promptInicial = readFileSync(caminho, 'utf-8');
        console.log(`[prompt] Carregando prompt a partir de: ${caminho}`);
        break;
      }
    }
  } catch (err) {
    console.error('[prompt] Erro ao ler prompt-cliente.txt:', err);
  }

  const existe = await pool.query('SELECT valor FROM configuracao WHERE chave = $1', ['prompt_sistema']);
  if (existe.rowCount === 0) {
    await pool.query(
      'INSERT INTO configuracao (chave, valor) VALUES ($1, $2)',
      ['prompt_sistema', promptInicial],
    );
  } else {
    await pool.query(
      'UPDATE configuracao SET valor = $2, atualizado_em = NOW() WHERE chave = $1',
      ['prompt_sistema', promptInicial],
    );
  }
}

export async function obterPromptBruto(): Promise<string> {
  const res = await pool.query('SELECT valor FROM configuracao WHERE chave = $1', ['prompt_sistema']);
  return (res.rows[0]?.valor as string) ?? PROMPT_PADRAO;
}

export async function salvarPrompt(prompt: string): Promise<void> {
  await pool.query(
    `INSERT INTO configuracao (chave, valor, atualizado_em)
     VALUES ($1, $2, NOW())
     ON CONFLICT (chave) DO UPDATE SET valor = $2, atualizado_em = NOW()`,
    ['prompt_sistema', prompt],
  );
}
