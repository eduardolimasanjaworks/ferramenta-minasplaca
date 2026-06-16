/**
 * Envia mídia recebida no WhatsApp para pasta do motorista no Google Drive.
 * Segue a convenção do ERP: pasta por motorista + {placa}_{nome}_{tipo}.ext
 */
import { obterRedis } from '../lib/redis.js';
import { config } from '../config.js';
import { directusListar } from './directus.js';
import type { MidiaCacheada } from './midia-cache.js';
import type { MotoristaGmx } from './motorista-gmx.js';
import {
  criarPastaDrive,
  googleDriveConfigurado,
  uploadBufferParaDrive,
} from './google-drive.js';

const ROTULO_TIPO: Record<string, string> = {
  cnh: 'CNH',
  crlv: 'CRLV',
  antt: 'ANTT',
  endereco: 'Endereco',
  comprovante: 'Comprovante',
  comprovante_entrega: 'Canhoto',
  foto: 'Cavalo',
  entrada: 'Recebido',
  outro: 'Documento',
  carreta_1: 'Carreta1',
  carreta_2: 'Carreta2',
  carreta_3: 'Carreta3',
};

const REDIS_PREFIX = 'iagmx:drive_folder:';

function sanitizarNomeArquivo(s: string): string {
  return s.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function extensaoArquivo(fileName: string, mimetype: string): string {
  const base = fileName.split('.').pop()?.toLowerCase();
  if (base && base.length <= 5) return base;
  if (mimetype.includes('pdf')) return 'pdf';
  if (mimetype.includes('png')) return 'png';
  if (mimetype.includes('webp')) return 'webp';
  return 'jpg';
}

function montarNomeArquivoDrive(opts: {
  placa: string;
  nomeMotorista: string;
  tipo: string;
  fileName: string;
  mimetype: string;
}): string {
  const cleanName = opts.nomeMotorista.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '') || 'Motorista';
  const rotulo = ROTULO_TIPO[opts.tipo] ?? opts.tipo;
  const ext = extensaoArquivo(opts.fileName, opts.mimetype);
  return sanitizarNomeArquivo(`${opts.placa}_${cleanName}_${rotulo}.${ext}`);
}

async function obterPlacaCavalo(motoristaId: number): Promise<string> {
  const lista = await directusListar<Record<string, unknown>>('crlv', {
    'filter[motorista_id][_eq]': String(motoristaId),
    sort: '-date_updated,-date_created',
    limit: '1',
    fields: 'placa_cavalo',
  }).catch(() => []);
  const placa = lista[0]?.placa_cavalo;
  return typeof placa === 'string' && placa.trim() ? placa.trim() : 'SemPlaca';
}

async function obterPastaDriveCache(motoristaId: number): Promise<string | null> {
  try {
    const redis = obterRedis();
    if (redis.status === 'wait') await redis.connect();
    return (await redis.get(`${REDIS_PREFIX}${motoristaId}`)) || null;
  } catch {
    return null;
  }
}

async function salvarPastaDriveCache(motoristaId: number, folderId: string): Promise<void> {
  try {
    const redis = obterRedis();
    if (redis.status === 'wait') await redis.connect();
    await redis.set(`${REDIS_PREFIX}${motoristaId}`, folderId);
  } catch {
    /* cache opcional */
  }
}

async function garantirPastaMotoristaDrive(
  motorista: MotoristaGmx,
  placa: string,
): Promise<string> {
  const cached = await obterPastaDriveCache(motorista.id);
  if (cached) return cached;

  const nome = [motorista.nome, motorista.sobrenome].filter(Boolean).join(' ').trim() || 'Motorista';
  const folderName =
    placa !== 'SemPlaca' ? sanitizarNomeArquivo(`${nome}_${placa}`) : sanitizarNomeArquivo(nome);

  const pasta = await criarPastaDrive(folderName, config.googleDriveRootFolderId);
  await salvarPastaDriveCache(motorista.id, pasta.id);
  console.log(`[drive] Pasta criada para motorista ${motorista.id}: ${folderName} (${pasta.id})`);
  return pasta.id;
}

/**
 * Upload assíncrono — não bloqueia resposta ao motorista; falha só loga.
 */
export function espelharMidiaWhatsappNoDrive(opts: {
  motorista: MotoristaGmx;
  midia: MidiaCacheada;
  tipoDocumento: string;
}): void {
  if (!googleDriveConfigurado()) return;

  void (async () => {
    try {
      if (opts.midia.midiaId) {
        const redis = obterRedis();
        if (redis.status === 'wait') await redis.connect();
        const dedupe = await redis.set(
          `iagmx:drive_uploaded:${opts.midia.midiaId}`,
          '1',
          'EX',
          7 * 86400,
          'NX',
        );
        if (dedupe !== 'OK') return;
      }

      const placa = await obterPlacaCavalo(opts.motorista.id);
      const folderId = await garantirPastaMotoristaDrive(opts.motorista, placa);
      const nome =
        [opts.motorista.nome, opts.motorista.sobrenome].filter(Boolean).join(' ').trim() ||
        'Motorista';
      const fileName = montarNomeArquivoDrive({
        placa,
        nomeMotorista: nome,
        tipo: opts.tipoDocumento,
        fileName: opts.midia.fileName,
        mimetype: opts.midia.mimetype,
      });

      const result = await uploadBufferParaDrive({
        fileName,
        mimeType: opts.midia.mimetype,
        buffer: opts.midia.buffer,
        folderId,
      });

      console.log(
        `[drive] Upload OK motorista=${opts.motorista.id} tipo=${opts.tipoDocumento} file=${fileName} url=${result.webViewLink ?? result.id}`,
      );
    } catch (err) {
      console.warn(
        '[drive] Falha ao espelhar mídia WhatsApp:',
        err instanceof Error ? err.message : err,
      );
    }
  })();
}
