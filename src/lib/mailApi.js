// Thin wrapper around temp-mail providers (mail.tm, mail.gw, dropmail.me).
// Keeping all network calls here means the UI/hook layer never touches fetch() directly.

export const PROVIDERS = [
  { id: 'mail.tm', name: 'mail.tm', baseUrl: 'https://api.mail.tm', type: 'hydra' },
  { id: 'mail.gw', name: 'mail.gw', baseUrl: 'https://api.mail.gw', type: 'hydra' },
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
    if (fullUrl.includes('api.mail.tm')) return fullUrl.replace(/^https?:\/\/api\.mail\.tm/, '/api-mailtm');
    if (fullUrl.includes('api.mail.gw')) return fullUrl.replace(/^https?:\/\/api\.mail\.gw/, '/api-mailgw');
    if (fullUrl.includes('dropmail.me')) return fullUrl.replace(/^https?:\/\/dropmail\.me/, '/api-dropmail');
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

async function request(baseUrl, path, options = {}) {
  const targetUrl = getProxyUrl(`${baseUrl}${path}`);
  try {
    const res = await fetch(targetUrl, options);
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        message = body.message || body.detail || message;
      } catch {
        // response had no JSON body, keep default message
      }
      throw new MailApiError(message, res.status);
    }
    return res;
  } catch (err) {
    if (err instanceof MailApiError) throw err;
    const directUrl = `${baseUrl}${path}`;
    if (targetUrl !== directUrl) {
      const res = await fetch(directUrl, options);
      if (!res.ok) throw new MailApiError(`Request failed (${res.status})`, res.status);
      return res;
    }
    throw err;
  }
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function fetchDomainsForProvider(provider) {
  if (provider.type === 'dropmail') return [];
  try {
    const res = await request(provider.baseUrl, '/domains');
    const data = await res.json();
    const domains = (data['hydra:member'] || []).filter((d) => d.isActive !== false);
    return domains.map((d) => ({ domain: d.domain, provider }));
  } catch {
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
  if (!combined.length) throw new MailApiError('No hay dominios disponibles en este momento.');
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

async function getDropmailToken(forceRefresh = false) {
  if (!forceRefresh) {
    const savedToken = localStorage.getItem(DROPMAIL_TOKEN_KEY);
    if (savedToken && savedToken.startsWith('af_')) {
      return savedToken;
    }
  }

  localStorage.removeItem(DROPMAIL_TOKEN_KEY);

  const res = await fetchDropmail('/api/token/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ type: 'af', lifetime: '1d' }),
  });

  if (!res.ok) {
    throw new MailApiError('No se pudo obtener el token de Dropmail', res.status);
  }
  const data = await res.json();
  if (data.token && data.token.startsWith('af_')) {
    localStorage.setItem(DROPMAIL_TOKEN_KEY, data.token);
    return data.token;
  }
  throw new MailApiError(data.error || 'Token invalido de Dropmail');
}

async function createDropmailAccount(retryCount = 0) {
  const token = await getDropmailToken(retryCount > 0);
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
    localStorage.removeItem(DROPMAIL_TOKEN_KEY);
    return createDropmailAccount(1);
  }

  const body = await res.json();
  if (body.errors && body.errors.length) {
    const errMsg = body.errors[0]?.message || 'Error al conectar con Dropmail';
    if ((errMsg.includes('token') || errMsg.includes('expired') || res.status === 403) && retryCount === 0) {
      localStorage.removeItem(DROPMAIL_TOKEN_KEY);
      return createDropmailAccount(1);
    }
    localStorage.removeItem(DROPMAIL_TOKEN_KEY);
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

export async function createTemporaryAccount(preferredProvider = 'mail.tm') {
  let providerToUse = preferredProvider;
  if (!providerToUse || providerToUse === 'auto') {
    providerToUse = 'mail.tm';
  }

  if (providerToUse === 'dropmail.me') {
    return createDropmailAccount();
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
        localStorage.removeItem(DROPMAIL_TOKEN_KEY);
        throw new MailApiError('La sesion o token de Dropmail ha expirado.', 401);
      }
      throw new MailApiError(`Error de red Dropmail (${res.status})`, res.status);
    }

    const body = await res.json();

    if (body.errors && body.errors.length) {
      const code = body.errors[0]?.extensions?.code;
      const errMsg = body.errors[0]?.message || 'Error al consultar Dropmail';
      if (code === 'SESSION_NOT_FOUND' || errMsg.includes('token') || errMsg.includes('expired')) {
        localStorage.removeItem(DROPMAIL_TOKEN_KEY);
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
  if (apiBase && apiBase.includes('dropmail.me')) {
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new MailApiError(`Error al descargar archivo (${res.status})`, res.status);
    return res.blob();
  }
  const res = await request(apiBase, downloadUrl, { headers: authHeaders(token) });
  return res.blob();
}

export { MailApiError };


