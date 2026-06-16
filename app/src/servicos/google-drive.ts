/**
 * Google Drive — mesma lógica do ERP (gmx/scripts/google_drive_service.js).
 */
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { google, type drive_v3 } from 'googleapis';
import { config } from '../config.js';

let driveService: drive_v3.Drive | null = null;

export function googleDriveConfigurado(): boolean {
  return existsSync(config.googleOAuthClientFile) && existsSync(config.googleTokenFile);
}

function getOAuth2Client() {
  const raw = JSON.parse(readFileSync(config.googleOAuthClientFile, 'utf8'));
  const creds = raw.web || raw.installed || raw;
  const { client_id, client_secret } = creds;
  const redirect_uri = 'http://localhost:3333';
  const tokens = JSON.parse(readFileSync(config.googleTokenFile, 'utf8'));

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);
  oauth2Client.setCredentials(tokens);

  oauth2Client.on('tokens', (newTokens) => {
    try {
      const current = JSON.parse(readFileSync(config.googleTokenFile, 'utf8'));
      const merged = { ...current, ...newTokens };
      writeFileSync(config.googleTokenFile, JSON.stringify(merged, null, 2));
    } catch {
      /* token file read-only — refresh só em memória */
    }
  });

  return oauth2Client;
}

function getDriveService(): drive_v3.Drive {
  if (!driveService) {
    driveService = google.drive({ version: 'v3', auth: getOAuth2Client() });
  }
  return driveService;
}

export async function criarPastaDrive(
  folderName: string,
  parentFolderId = config.googleDriveRootFolderId,
): Promise<{ id: string; webViewLink?: string | null }> {
  const drive = getDriveService();
  const response = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id, webViewLink',
  });
  if (!response.data.id) throw new Error('Drive não retornou id da pasta');
  return { id: response.data.id, webViewLink: response.data.webViewLink };
}

export async function uploadBufferParaDrive(opts: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  folderId: string;
}): Promise<{ id: string; webViewLink?: string | null }> {
  const drive = getDriveService();
  const stream = Readable.from(opts.buffer);
  const response = await drive.files.create({
    requestBody: {
      name: opts.fileName,
      parents: [opts.folderId],
    },
    media: {
      mimeType: opts.mimeType,
      body: stream,
    },
    fields: 'id, webViewLink',
  });
  if (!response.data.id) throw new Error('Drive não retornou id do arquivo');
  return { id: response.data.id, webViewLink: response.data.webViewLink };
}

/** Upload a partir de arquivo no disco (scripts de manutenção). */
export async function uploadArquivoParaDrive(
  fileName: string,
  mimeType: string,
  filePath: string,
  folderId: string,
): Promise<{ id: string; webViewLink?: string | null }> {
  const drive = getDriveService();
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: createReadStream(filePath),
    },
    fields: 'id, webViewLink',
  });
  if (!response.data.id) throw new Error('Drive não retornou id do arquivo');
  return { id: response.data.id, webViewLink: response.data.webViewLink };
}
