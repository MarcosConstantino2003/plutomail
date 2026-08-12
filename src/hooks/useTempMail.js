import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createTemporaryAccount,
  listMessages,
  getMessage,
  fetchAttachmentBlob,
  MailApiError,
  DEFAULT_API_BASE,
} from '../lib/mailApi';
import { renderMessageBody } from '../lib/renderMessageBody';

const STORAGE_KEY = 'plutomail_account';
const POLLING_INTERVAL_MS = 3000;
const ACCOUNT_COOLDOWN_SEC = 60;
const REFRESH_COOLDOWN_SEC = 2;
const COPIED_FEEDBACK_MS = 750;

// Accounts saved before multi-provider support was added won't have an apiBase field.
// They were always created against mail.tm, so that's the safe fallback.
function withApiBase(account) {
  if (!account) return account;
  return { apiBase: DEFAULT_API_BASE, ...account };
}

export function useTempMail() {
  const [account, setAccount] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(() => {
    const saved = localStorage.getItem('plutomail_selected_provider');
    return saved && saved !== 'auto' ? saved : 'mail.tm';
  });
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [messageBodyHtml, setMessageBodyHtml] = useState('');
  const [attachmentPreviews, setAttachmentPreviews] = useState({});

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [justCopied, setJustCopied] = useState(false);

  const [accountCooldown, setAccountCooldown] = useState(0);
  const [refreshCooldown, setRefreshCooldown] = useState(0);

  const pollingRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const copiedTimeoutRef = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchMessages = useCallback(async (currentAccount) => {
    if (!currentAccount?.token) return;
    setIsRefreshing(true);
    try {
      const msgs = await listMessages(currentAccount);
      setMessages(msgs);
    } catch (err) {
      if (err instanceof MailApiError && err.status === 401) {
        setAccount(null);
        localStorage.removeItem(STORAGE_KEY);
      } else if (err instanceof MailApiError) {
        // Not fatal (e.g. a transient rate limit) — log it instead of failing silently,
        // but don't spam the user with a toast on every 10s poll.
        console.error('[PlutoMail] fetchMessages failed:', err.message);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const createNewAccount = useCallback(async ({ providerId = selectedProvider, isRotation = false } = {}) => {
    setIsBootstrapping(true);
    setError(null);
    try {
      const newAccount = await createTemporaryAccount(providerId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newAccount));
      setAccount(newAccount);
      setMessages([]);
      setSelectedMessage(null);
      if (isRotation) setAccountCooldown(ACCOUNT_COOLDOWN_SEC);
    } catch (err) {
      setError(err.message || 'No se pudo generar la direccion.');
    } finally {
      setIsBootstrapping(false);
    }
  }, [selectedProvider]);

  // Bootstrap: restore saved account or create a fresh one.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = withApiBase(JSON.parse(saved));
      setAccount(parsed);
      setIsBootstrapping(false);
      fetchMessages(parsed);
    } else {
      createNewAccount({ providerId: selectedProvider });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling
  useEffect(() => {
    if (!account?.token) return undefined;
    pollingRef.current = setInterval(() => fetchMessages(account), POLLING_INTERVAL_MS);
    return () => clearInterval(pollingRef.current);
  }, [account, fetchMessages]);

  // Cooldown timers
  useEffect(() => {
    if (accountCooldown <= 0) return undefined;
    const id = setInterval(() => setAccountCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [accountCooldown > 0]);

  useEffect(() => {
    if (refreshCooldown <= 0) return undefined;
    const id = setInterval(() => setRefreshCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [refreshCooldown > 0]);

  useEffect(() => () => clearTimeout(copiedTimeoutRef.current), []);

  const handleManualRefresh = useCallback(() => {
    if (!account?.token || isRefreshing || refreshCooldown > 0) return;
    fetchMessages(account);
    setRefreshCooldown(REFRESH_COOLDOWN_SEC);
  }, [account, isRefreshing, refreshCooldown, fetchMessages]);

  const handleProviderChange = useCallback((newProviderId) => {
    setSelectedProvider(newProviderId);
    localStorage.setItem('plutomail_selected_provider', newProviderId);
    localStorage.removeItem(STORAGE_KEY);
    setAccount(null);
    setMessages([]);
    setSelectedMessage(null);
    createNewAccount({ providerId: newProviderId, isRotation: false });
  }, [createNewAccount]);

  const openMessage = useCallback(async (messageId) => {
    if (!account?.token) return;
    setIsLoadingMessage(true);
    setMessageBodyHtml('');
    setAttachmentPreviews({});
    try {
      const full = await getMessage(account, messageId);
      setSelectedMessage(full);
      const { html, resolvedAttachments } = await renderMessageBody(full, account.token, account.apiBase);
      setMessageBodyHtml(html);
      setAttachmentPreviews(resolvedAttachments);
    } catch {
      showToast('No se pudo abrir el mensaje.', 'error');
    } finally {
      setIsLoadingMessage(false);
    }
  }, [account, showToast]);

  const closeMessage = useCallback(() => {
    setSelectedMessage(null);
    setMessageBodyHtml('');
    setAttachmentPreviews({});
  }, []);

  const rotateAccount = useCallback(() => {
    if (accountCooldown > 0) return;
    localStorage.removeItem(STORAGE_KEY);
    setAccount(null);
    setMessages([]);
    setSelectedMessage(null);
    createNewAccount({ providerId: selectedProvider, isRotation: true });
  }, [accountCooldown, createNewAccount, selectedProvider]);

  const copyAddress = useCallback(async () => {
    if (!account?.address) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(account.address);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = account.address;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      setJustCopied(true);
      copiedTimeoutRef.current = setTimeout(() => setJustCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      showToast('No se pudo copiar la direccion.', 'error');
    }
  }, [account, showToast]);

  const downloadAttachment = useCallback(async (attachment) => {
    if (!account?.token) return;
    try {
      showToast(`Descargando ${attachment.filename}...`);
      const blob = await fetchAttachmentBlob(account.apiBase, account.token, attachment.downloadUrl);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = attachment.filename || 'archivo';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      showToast('Descarga completa.');
    } catch {
      showToast('No se pudo descargar el archivo.', 'error');
    }
  }, [account, showToast]);

  return {
    account,
    selectedProvider,
    messages,
    selectedMessage,
    messageBodyHtml,
    attachmentPreviews,
    isBootstrapping,
    isLoadingMessage,
    isRefreshing,
    error,
    toast,
    justCopied,
    accountCooldown,
    refreshCooldown,
    handleManualRefresh,
    handleProviderChange,
    openMessage,
    closeMessage,
    rotateAccount,
    copyAddress,
    downloadAttachment,
    retryBootstrap: () => createNewAccount({ providerId: selectedProvider }),
  };
}
