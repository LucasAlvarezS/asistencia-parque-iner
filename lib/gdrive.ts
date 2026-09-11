// Subida de fotos a Google Drive vía OAuth2 (refresh token, scope `drive`).
// SOLO servidor — se usa desde app/api/subir-foto/route.ts. Habla con la REST de
// Drive por `fetch` (sin dependencias). Las fotos van a una carpeta por parque
// dentro de la carpeta madre (GDRIVE_ROOT_FOLDER_ID); el nombre del archivo lleva
// pala/WTG/parque y se SOBRESCRIBE si ya existe (queda la última reinspección).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const MIME_CARPETA = "application/vnd.google-apps.folder";

let tokenCache: { token: string; exp: number } | null = null;
const carpetaCache = new Map<string, string>(); // nombre de parque → folderId

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

/** Access token fresco (canjea el refresh token). Cacheado hasta ~1 min antes de vencer. */
async function accessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;
  const body = new URLSearchParams({
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
    refresh_token: env("GOOGLE_OAUTH_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, { method: "POST", body });
  if (!res.ok) throw new Error(`OAuth token ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, exp: Date.now() + (json.expires_in - 60) * 1000 };
  return tokenCache.token;
}

/** Escapa comillas/backslash para el parámetro `q` de la API de Drive. */
function escaparQ(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveGet(path: string, token: string): Promise<{ files?: { id: string }[] }> {
  const res = await fetch(`${DRIVE_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive GET ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Carpeta del parque bajo la carpeta madre; la crea si no existe. Cachea en memoria. */
async function carpetaParque(nombre: string, token: string): Promise<string> {
  const cacheado = carpetaCache.get(nombre);
  if (cacheado) return cacheado;
  const root = env("GDRIVE_ROOT_FOLDER_ID");
  const q =
    `'${root}' in parents and name='${escaparQ(nombre)}' ` +
    `and mimeType='${MIME_CARPETA}' and trashed=false`;
  const data = await driveGet(
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name)` +
      `&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    token,
  );
  let id = data.files?.[0]?.id;
  if (!id) {
    const res = await fetch(`${DRIVE_API}/files?supportsAllDrives=true&fields=id`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: nombre, mimeType: MIME_CARPETA, parents: [root] }),
    });
    if (!res.ok) throw new Error(`Drive crear carpeta ${res.status}: ${await res.text()}`);
    id = ((await res.json()) as { id: string }).id;
  }
  carpetaCache.set(nombre, id);
  return id;
}

async function archivoExistente(
  nombre: string,
  carpetaId: string,
  token: string,
): Promise<string | null> {
  const q = `'${carpetaId}' in parents and name='${escaparQ(nombre)}' and trashed=false`;
  const data = await driveGet(
    `/files?q=${encodeURIComponent(q)}&fields=files(id)` +
      `&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    token,
  );
  return data.files?.[0]?.id ?? null;
}

export interface SubirParams {
  parqueNombre: string; // define la carpeta destino
  nombreArchivo: string; // ej. "PALA B WTG31 PE DE LA BAHIA II.jpg"
  bytes: Buffer;
  contentType?: string;
}

/** Sube (o sobrescribe) la foto en la carpeta del parque. Devuelve fileId + link. */
export async function subirFotoDrive(
  p: SubirParams,
): Promise<{ fileId: string; webViewLink?: string }> {
  const token = await accessToken();
  const carpeta = await carpetaParque(p.parqueNombre, token);
  const existente = await archivoExistente(p.nombreArchivo, carpeta, token);
  const ct = p.contentType ?? "image/jpeg";

  if (existente) {
    // Sobrescribe el contenido (mantiene nombre y ubicación).
    const res = await fetch(
      `${DRIVE_UPLOAD}/files/${existente}?uploadType=media` +
        `&supportsAllDrives=true&fields=id,webViewLink`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": ct },
        body: new Uint8Array(p.bytes),
      },
    );
    if (!res.ok) throw new Error(`Drive update ${res.status}: ${await res.text()}`);
    const j = (await res.json()) as { id: string; webViewLink?: string };
    return { fileId: j.id, webViewLink: j.webViewLink };
  }

  // Crear nuevo con multipart/related (metadata JSON + binario en un request).
  const boundary = `iner${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: p.nombreArchivo, parents: [carpeta] });
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: ${ct}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([head, p.bytes, tail]);
  const res = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
    },
  );
  if (!res.ok) throw new Error(`Drive create ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { id: string; webViewLink?: string };
  return { fileId: j.id, webViewLink: j.webViewLink };
}
