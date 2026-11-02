// Thin wrapper around temp-mail providers (mail.tm, guerrillamail, dropmail.me).
// Keeping all network calls here means the UI/hook layer never touches fetch() directly.

export const PROVIDERS = [
  { id: 'mail.tm', name: 'mail.tm', baseUrl: 'https://api.mail.tm', type: 'hydra' },
  { id: 'guerrillamail', name: 'guerrillamail.com', baseUrl: 'https://api.guerrillamail.com', type: 'guerrilla' },
  { id: 'dropmail.me', name: 'dropmail.me', baseUrl: 'https://dropmail.me/api/graphql', type: 'dropmail' },
];

export const DEFAULT_API_BASE = PROVIDERS[0].baseUrl;
const DROPMAIL_TOKEN_KEY = 'plutomail_dropmail_token';

class MailApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'MailApiError';
    this.status = status;
  }
}

function getProxyUrl(fullUrl) {
  if (typeof window !== 'undefined') {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
      if (fullUrl.includes('api.mail.tm')) return fullUrl.replace(/^https?:\/\/api\.mail\.tm/, '/api-mailtm');
      if (fullUrl.includes('api.guerrillamail.com')) return fullUrl.replace(/^https?:\/\/api\.guerrillamail\.com/, '/api-guerrilla');
      if (fullUrl.includes('dropmail.me')) return fullUrl.replace(/^https?:\/\/dropmail\.me/, '/api-dropmail');
    } else {
      return `/api/proxy?targetUrl=${encodeURIComponent(fullUrl)}`;
    }
  }
  return fullUrl;
}

// Proxy-aware fetch helper for Dropmail to prevent CORS issues in dev & production
async function fetchDropmail(path, options = {}) {
  const targetUrl = getProxyUrl(`https://dropmail.me${path}`);
  try {
    const res = await fetch(targetUrl, options);
    return res;
  } catch (err) {
    const directUrl = `https://dropmail.me${path}`;
    if (targetUrl !== directUrl) {
      return fetch(directUrl, options);
    }
    throw err;
  }
}

// Proxy-aware fetch helper for Guerrilla Mail
async function fetchGuerrilla(queryString) {
  const fullUrl = `https://api.guerrillamail.com/ajax.php?${queryString}`;
  const targetUrl = getProxyUrl(fullUrl);
  try {
    const res = await fetch(targetUrl);
    if (!res.ok) throw new MailApiError(`Error en Guerrilla Mail (${res.status})`, res.status);
    return res.json();
  } catch (err) {
    if (err instanceof MailApiError) throw err;
    const directUrl = fullUrl;
    if (targetUrl !== directUrl) {
      try {
        const directRes = await fetch(directUrl);
        if (!directRes.ok) throw new MailApiError(`Error en Guerrilla Mail (${directRes.status})`, directRes.status);
        return directRes.json();
      } catch {
        // fallback failed, continue to throw original error
      }
    }
    throw new MailApiError(err.message || 'Error de red al conectar con Guerrilla Mail.', 0);
  }
}

async function request(baseUrl, path, options = {}, retries = 1) {
  const targetUrl = getProxyUrl(`${baseUrl}${path}`);

  try {
    const res = await fetch(targetUrl, options);
    if (!res.ok) {
      if ([502, 503, 504].includes(res.status) && retries > 0) {
        await new Promise((r) => setTimeout(r, 500));
        return request(baseUrl, path, options, retries - 1);
      }
      let message = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        message = body.message || body.detail || body.error || message;
      } catch {
        // response had no JSON body, keep default message
      }
      throw new MailApiError(message, res.status);
    }
    return res;
  } catch (err) {
    if (err instanceof MailApiError) throw err;
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 500));
      return request(baseUrl, path, options, retries - 1);
    }
    throw new MailApiError(err.message || 'Error de red al contactar el proveedor.', 0);
  }
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function fetchDomainsForProvider(provider) {
  if (provider.type !== 'hydra') return [];
  try {
    const res = await request(provider.baseUrl, '/domains');
    const data = await res.json();
    const domains = (data['hydra:member'] || []).filter((d) => d.isActive !== false);
    return domains.map((d) => ({ domain: d.domain, provider }));
  } catch (err) {
    console.error(`[plutomail] Fallo al obtener dominios de ${provider.id}:`, err.message || err);
    return [];
  }
}

export async function fetchAllAvailableDomains(targetProviderId = 'mail.tm') {
  let targetProviders = PROVIDERS.filter((p) => p.type === 'hydra');
  if (targetProviderId) {
    targetProviders = targetProviders.filter((p) => p.id === targetProviderId);
  }
  if (!targetProviders.length) {
    targetProviders = PROVIDERS.filter((p) => p.id === 'mail.tm');
  }
  const results = await Promise.all(targetProviders.map(fetchDomainsForProvider));
  const combined = results.flat();

  if (!combined.length) {
    throw new MailApiError('No hay dominios disponibles en este momento. Revisa la consola para más detalles.');
  }
  return combined;
}

export function generatePassword() {
  return Math.random().toString(36).slice(-8) + 'Aa1!';
}

export async function createAccount(baseUrl, address, password) {
  await request(baseUrl, '/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  });
}

export async function requestToken(baseUrl, address, password) {
  const res = await request(baseUrl, '/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  });
  return res.json();
}

function generateDropmailToken() {
  const secret = 'tm_graphql_secret_2026';
  const _h = (str) => {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16);
  };

  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomStr = '';
  for (let i = 0; i < 16; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const now = new Date();
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const randomPart = dateStr + randomStr;
  const hash = _h(randomPart + secret);
  return `website_${randomPart}_${hash}`;
}

function isValidDropmailToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('_');
  if (parts.length !== 3 || parts[0] !== 'website') return false;
  const [, randomPart, storedHash] = parts;
  const secret = 'tm_graphql_secret_2026';
  const _h = (str) => {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16);
  };
  return storedHash === _h(randomPart + secret);
}

function getDropmailToken(forceRefresh = false) {
  if (typeof localStorage !== 'undefined') {
    if (!forceRefresh) {
      const savedToken = localStorage.getItem(DROPMAIL_TOKEN_KEY);
      if (isValidDropmailToken(savedToken)) {
        return savedToken;
      }
    }
    const token = generateDropmailToken();
    try {
      localStorage.setItem(DROPMAIL_TOKEN_KEY, token);
    } catch {
      // ignore storage quota issues
    }
    return token;
  }
  return generateDropmailToken();
}

async function createDropmailAccount(retryCount = 0) {
  const token = getDropmailToken(retryCount > 0);
  const mutation = `mutation {
    introduceSession {
      id
      expiresAt
      addresses {
        address
      }
    }
  }`;

  const res = await fetchDropmail(`/api/graphql/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: mutation }),
  });

  if ((!res.ok && (res.status === 403 || res.status === 401)) && retryCount === 0) {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(DROPMAIL_TOKEN_KEY);
    return createDropmailAccount(1);
  }

  const body = await res.json();
  if (body.errors && body.errors.length) {
    const errMsg = body.errors[0]?.message || 'Error al conectar con Dropmail';
    if ((errMsg.includes('token') || errMsg.includes('expired') || res.status === 403) && retryCount === 0) {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(DROPMAIL_TOKEN_KEY);
      return createDropmailAccount(1);
    }
    if (typeof localStorage !== 'undefined') localStorage.removeItem(DROPMAIL_TOKEN_KEY);
    throw new MailApiError(`Dropmail API Error: ${errMsg}`);
  }

  const session = body.data?.introduceSession;
  const address = session?.addresses?.[0]?.address;
  if (!address || !session?.id) {
    throw new MailApiError('No se pudo generar una direccion de correo en Dropmail.');
  }

  return {
    address,
    password: generatePassword(),
    token,
    id: session.id,
    apiBase: `dropmail.me/api/graphql/${token}`,
    provider: 'dropmail.me',
    type: 'dropmail',
  };
}

async function createGuerrillaAccount() {
  const data = await fetchGuerrilla('f=get_email_address');
  if (!data?.email_addr || !data?.sid_token) {
    throw new MailApiError('No se pudo generar una direccion en Guerrilla Mail.');
  }

  return {
    address: data.email_addr,
    password: generatePassword(),
    token: data.sid_token,
    id: data.sid_token,
    apiBase: 'https://api.guerrillamail.com',
    provider: 'guerrillamail',
    type: 'guerrilla',
  };
}

export async function createTemporaryAccount(preferredProvider = 'mail.tm') {
  let providerToUse = preferredProvider;
  if (!providerToUse || providerToUse === 'auto' || providerToUse === 'mail.gw') {
    providerToUse = 'mail.tm';
  }

  if (providerToUse === 'dropmail.me') {
    return createDropmailAccount();
  }

  if (providerToUse === 'guerrillamail') {
    return createGuerrillaAccount();
  }

  const domains = await fetchAllAvailableDomains(providerToUse);
  const choice = domains[Math.floor(Math.random() * domains.length)];
  const username = `user${Math.random().toString(36).substring(2, 8)}`;
  const address = `${username}@${choice.domain}`;
  const password = generatePassword();

  await createAccount(choice.provider.baseUrl, address, password);
  const { token, id } = await requestToken(choice.provider.baseUrl, address, password);

  return {
    address,
    password,
    token,
    id,
    apiBase: choice.provider.baseUrl,
    provider: choice.provider.id,
    type: 'hydra',
  };
}

export async function listMessages(accountOrApiBase, token, id, provider) {
  let apiBase = accountOrApiBase;
  let accountToken = token;
  let accountId = id;
  let providerId = provider;

  if (typeof accountOrApiBase === 'object' && accountOrApiBase !== null) {
    apiBase = accountOrApiBase.apiBase;
    accountToken = accountOrApiBase.token;
    accountId = accountOrApiBase.id;
    providerId = accountOrApiBase.provider;
  }

  if (providerId === 'guerrillamail' || (apiBase && apiBase.includes('guerrillamail'))) {
    const data = await fetchGuerrilla(`f=check_email&seq=0&sid_token=${encodeURIComponent(accountToken)}`);
    const list = data.list || [];
    return list.map((item) => {
      const isHtml = item.content_type === 'html' || (item.mail_body && item.mail_body.includes('<') && item.mail_body.includes('>'));
      return {
        id: String(item.mail_id),
        from: {
          address: item.mail_from || 'desconocido',
          name: item.mail_from || 'desconocido',
        },
        to: [{ address: data.email || item.mail_recipient || '' }],
        subject: item.mail_subject || '(Sin asunto)',
        intro: (item.mail_excerpt || item.mail_body || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        text: !isHtml ? (item.mail_body || '') : '',
        html: isHtml ? (item.mail_body || '') : (item.mail_body ? `<pre style="white-space: pre-wrap; font-family: inherit;">${item.mail_body}</pre>` : ''),
        createdAt: item.mail_timestamp ? new Date(item.mail_timestamp * 1000).toISOString() : new Date().toISOString(),
        downloadUrl: null,
        attachments: [],
        provider: 'guerrillamail',
      };
    });
  }

  if (providerId === 'dropmail.me' || (apiBase && apiBase.includes('dropmail.me'))) {
    const query = `query GetSession($id: ID!) {
      session(id: $id) {
        mails {
          id
          fromAddr
          toAddr
          downloadUrl
          text
          html
          headerSubject
          receivedAt
        }
      }
    }`;

    const res = await fetchDropmail(`/api/graphql/${accountToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { id: accountId } }),
    });

    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(DROPMAIL_TOKEN_KEY);
        throw new MailApiError('La sesion o token de Dropmail ha expirado.', 401);
      }
      throw new MailApiError(`Error de red Dropmail (${res.status})`, res.status);
    }

    const body = await res.json();

    if (body.errors && body.errors.length) {
      const code = body.errors[0]?.extensions?.code;
      const errMsg = body.errors[0]?.message || 'Error al consultar Dropmail';
      if (code === 'SESSION_NOT_FOUND' || errMsg.includes('token') || errMsg.includes('expired')) {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(DROPMAIL_TOKEN_KEY);
        throw new MailApiError('La sesion o token de Dropmail ha expirado.', 401);
      }
      throw new MailApiError(errMsg, 400);
    }

    const mails = body.data?.session?.mails || [];

    return mails.map((mail) => ({
      id: mail.id,
      from: {
        address: mail.fromAddr || 'desconocido',
        name: mail.fromAddr || 'desconocido',
      },
      to: [{ address: mail.toAddr || '' }],
      subject: mail.headerSubject || '(Sin asunto)',
      intro: (mail.text || '').replace(/\s+/g, ' ').trim().slice(0, 100),
      text: mail.text || '',
      html: mail.html || (mail.text ? `<pre style="white-space: pre-wrap; font-family: inherit;">${mail.text}</pre>` : ''),
      createdAt: mail.receivedAt || new Date().toISOString(),
      downloadUrl: mail.downloadUrl || null,
      attachments: [],
      provider: 'dropmail.me',
      isDropmail: true,
    }));
  }

  const res = await request(apiBase, '/messages?page=1', { headers: authHeaders(accountToken) });
  const data = await res.json();
  return data['hydra:member'] || [];
}

export async function getMessage(accountOrApiBase, tokenOrMessageId, messageId, accountId, provider) {
  let apiBase = accountOrApiBase;
  let token = tokenOrMessageId;
  let msgId = messageId;
  let accId = accountId;
  let providerId = provider;

  if (typeof accountOrApiBase === 'object' && accountOrApiBase !== null) {
    apiBase = accountOrApiBase.apiBase;
    token = accountOrApiBase.token;
    msgId = tokenOrMessageId;
    accId = accountOrApiBase.id;
    providerId = accountOrApiBase.provider;
  }

  if (providerId === 'guerrillamail' || (apiBase && apiBase.includes('guerrillamail'))) {
    const full = await fetchGuerrilla(`f=fetch_email&email_id=${encodeURIComponent(msgId)}&sid_token=${encodeURIComponent(token)}`);
    if (!full || full.error) {
      throw new MailApiError('Mensaje no encontrado.', 404);
    }
    const isHtml = full.content_type === 'html' || (full.mail_body && full.mail_body.includes('<') && full.mail_body.includes('>'));
    return {
      id: String(full.mail_id || msgId),
      from: {
        address: full.mail_from || 'desconocido',
        name: full.mail_from || 'desconocido',
      },
      to: [{ address: full.mail_recipient || '' }],
      subject: full.mail_subject || '(Sin asunto)',
      intro: (full.mail_excerpt || full.mail_body || '').replace(/\s+/g, ' ').trim().slice(0, 100),
      text: !isHtml ? (full.mail_body || '') : '',
      html: isHtml ? (full.mail_body || '') : (full.mail_body ? `<pre style="white-space: pre-wrap; font-family: inherit;">${full.mail_body}</pre>` : ''),
      createdAt: full.mail_timestamp ? new Date(full.mail_timestamp * 1000).toISOString() : new Date().toISOString(),
      downloadUrl: null,
      attachments: [],
      provider: 'guerrillamail',
    };
  }

  if (providerId === 'dropmail.me' || (apiBase && apiBase.includes('dropmail.me'))) {
    const messages = await listMessages(apiBase, token, accId, 'dropmail.me');
    const found = messages.find((m) => m.id === msgId);
    if (!found) throw new MailApiError('Mensaje no encontrado.', 404);
    return found;
  }

  const res = await request(apiBase, `/messages/${msgId}`, { headers: authHeaders(token) });
  return res.json();
}

export async function fetchAttachmentBlob(apiBase, token, downloadUrl) {
  if (!downloadUrl) return new Blob();
  if (apiBase && (apiBase.includes('dropmail.me') || apiBase.includes('guerrillamail'))) {
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new MailApiError(`Error al descargar archivo (${res.status})`, res.status);
    return res.blob();
  }
  const res = await request(apiBase, downloadUrl, { headers: authHeaders(token) });
  return res.blob();
}

export { MailApiError };
