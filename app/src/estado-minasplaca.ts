/**
 * Gerenciamento de Estado do Cliente — Minas Placa.
 * Armazena informações cadastrais e do carrinho de compras estruturado.
 */
import pg from 'pg';
import { config } from './config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

/**
 * Inicializa a tabela no banco de dados se não existir.
 */
export async function inicializarBancoEstado(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS estado_cliente (
      telefone TEXT PRIMARY KEY,
      dados JSONB NOT NULL,
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

/**
 * Recupera o estado estruturado do cliente pelo telefone.
 * Retorna um objeto vazio caso o cliente não tenha nenhum registro prévio.
 */
export async function obterEstadoCliente(telefone: string): Promise<any> {
  try {
    const res = await pool.query(
      'SELECT dados, atualizado_em FROM estado_cliente WHERE telefone = $1',
      [telefone]
    );
    if (res.rowCount === 0) {
      return {};
    }
    return {
      ...res.rows[0].dados,
      atualizado_em: res.rows[0].atualizado_em
    };
  } catch (err) {
    console.error(`[estado] Erro ao obter estado para ${telefone}:`, err);
    return {};
  }
}

/**
 * Salva ou atualiza o estado estruturado do cliente.
 */
export async function salvarEstadoCliente(telefone: string, dados: any): Promise<void> {
  try {
    // Evita salvar timestamps duplicados ou bagunçar os dados internos
    const { atualizado_em, ...dadosLimpos } = dados;

    await pool.query(
      `INSERT INTO estado_cliente (telefone, dados, atualizado_em)
       VALUES ($1, $2, NOW())
       ON CONFLICT (telefone) DO UPDATE 
       SET dados = $2, atualizado_em = NOW()`,
      [telefone, JSON.stringify(dadosLimpos)]
    );
    console.log(`[estado] Estado de ${telefone} atualizado com sucesso.`);
  } catch (err) {
    console.error(`[estado] Erro ao salvar estado para ${telefone}:`, err);
  }
}
