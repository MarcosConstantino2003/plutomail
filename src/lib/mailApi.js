// Thin wrapper around the mail.tm REST API.
// Keeping all network calls here means the UI/hook layer never touches fetch() directly.

const API_BASE = 'https://api.mail.tm';

class MailApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'MailApiError';
    this.status = status;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
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

export async function fetchAvailableDomain() {
  const res = await request('/domains');
  const data = await res.json();
  const domain = data['hydra:member']?.[0]?.domain;
  if (!domain) throw new MailApiError('No hay dominios disponibles en este momento.');
  return domain;
}

export function generatePassword() {
  return Math.random().toString(36).slice(-8) + 'Aa1!';
}

export async function createAccount(address, password) {
  await request('/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  });
}

export async function requestToken(address, password) {
  const res = await request('/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  });
  return res.json();
}

export async function createTemporaryAccount() {
  const domain = await fetchAvailableDomain();
  const username = `user${Math.random().toString(36).substring(2, 8)}`;
  const address = `${username}@${domain}`;
  const password = generatePassword();

  await createAccount(address, password);
  const { token, id } = await requestToken(address, password);

  return { address, password, token, id };
}

export async function listMessages(token) {
  const res = await request('/messages?page=1', { headers: authHeaders(token) });
  const data = await res.json();
  return data['hydra:member'] || [];
}

export async function getMessage(token, messageId) {
  const res = await request(`/messages/${messageId}`, { headers: authHeaders(token) });
  return res.json();
}

export async function fetchAttachmentBlob(token, downloadUrl) {
  const res = await request(downloadUrl, { headers: authHeaders(token) });
  return res.blob();
}

export { MailApiError, API_BASE };
