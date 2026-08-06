// Thin wrapper around temp-mail providers that speak the mail.tm API contract.
// mail.tm and mail.gw are run by the same team and expose an identical REST API —
// the only difference is the base URL and the pool of domains each one offers.
// Keeping all network calls here means the UI/hook layer never touches fetch() directly.

export const PROVIDERS = [
  { id: 'mail.tm', baseUrl: 'https://api.mail.tm' },
  { id: 'mail.gw', baseUrl: 'https://api.mail.gw' },
];

export const DEFAULT_API_BASE = PROVIDERS[0].baseUrl;

class MailApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'MailApiError';
    this.status = status;
  }
}

async function request(baseUrl, path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
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
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function fetchDomainsForProvider(provider) {
  try {
    const res = await request(provider.baseUrl, '/domains');
    const data = await res.json();
    const domains = (data['hydra:member'] || []).filter((d) => d.isActive !== false);
    return domains.map((d) => ({ domain: d.domain, provider }));
  } catch {
    // if one provider is down, we still want the other to work
    return [];
  }
}

// Combines the available domains from every provider into a single pool.
export async function fetchAllAvailableDomains() {
  const results = await Promise.all(PROVIDERS.map(fetchDomainsForProvider));
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

// Picks a random domain across ALL providers, then creates the account on
// whichever provider that domain belongs to.
export async function createTemporaryAccount() {
  const domains = await fetchAllAvailableDomains();
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
  };
}

export async function listMessages(apiBase, token) {
  const res = await request(apiBase, '/messages?page=1', { headers: authHeaders(token) });
  const data = await res.json();
  return data['hydra:member'] || [];
}

export async function getMessage(apiBase, token, messageId) {
  const res = await request(apiBase, `/messages/${messageId}`, { headers: authHeaders(token) });
  return res.json();
}

export async function fetchAttachmentBlob(apiBase, token, downloadUrl) {
  const res = await request(apiBase, downloadUrl, { headers: authHeaders(token) });
  return res.blob();
}

export { MailApiError };
