import React, { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import {
  Mail,
  Copy,
  RefreshCw,
  Trash2,
  Moon,
  Sun,
  Inbox,
  ChevronLeft,
  Loader2,
  AlertCircle,
  Paperclip,
  Download,
  Github,
  Linkedin,
  CheckCircle2,
  XCircle,
  Image as ImageIcon
} from 'lucide-react';

const API_BASE = 'https://api.mail.tm';
const POLLING_INTERVAL = 10000;
const ACCOUNT_CREATION_COOLDOWN = 60;
const MANUAL_REFRESH_COOLDOWN_SEC = 5;


const WaitingDots = () => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);


  return <span>{dots}</span>;
};

export default function App() {

  const [account, setAccount] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [messageContentHtml, setMessageContentHtml] = useState('');


  const [attachmentPreviews, setAttachmentPreviews] = useState({});
  const [attachmentBlobSizes, setAttachmentBlobSizes] = useState({});


  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);


  const [creationCooldown, setCreationCooldown] = useState(0);
  const [refreshCooldown, setRefreshCooldown] = useState(0);


  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return true;
  });

  const pollingRef = useRef(null);
  const cooldownIntervalRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const sizeDebugLoggedRef = useRef(new Set());



  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const init = async () => {
      const savedAccount = localStorage.getItem('tm_account');
      if (savedAccount) {
        console.log("💾 Cuenta encontrada. Restaurando...");
        const parsedAccount = JSON.parse(savedAccount);
        setAccount(parsedAccount);
        fetchMessages(parsedAccount.token);
      } else {
        await createNewAccount();
      }
    };
    init();

    return () => {
      stopPolling();
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (account?.token) startPolling();
    return () => stopPolling();
  }, [account]);

  useEffect(() => {
    if (selectedMessage && account?.token) {

      setAttachmentPreviews({});
      setAttachmentBlobSizes({});
      sizeDebugLoggedRef.current = new Set();
      processMessageContent(selectedMessage);
    }
  }, [selectedMessage]);


  useEffect(() => {
    if (creationCooldown > 0) {
      cooldownIntervalRef.current = setInterval(() => {
        setCreationCooldown(prev => prev > 0 ? prev - 1 : 0);
      }, 1000);
    }
    return () => clearInterval(cooldownIntervalRef.current);
  }, [creationCooldown > 0]);


  useEffect(() => {
    let interval = null;
    if (refreshCooldown > 0) {
      interval = setInterval(() => {
        setRefreshCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [refreshCooldown > 0]);



  const showToast = (message, type = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  };

  const generatePassword = () => Math.random().toString(36).slice(-8) + "Aa1!";

  const createNewAccount = async () => {
    if (creationCooldown > 0 && account) return;

    setIsLoading(true);
    setError(null);
    stopPolling();

    try {
      const domainRes = await fetch(`${API_BASE}/domains`);
      if (!domainRes.ok) throw new Error("Error obteniendo dominios");
      const domainData = await domainRes.json();

      if (!domainData['hydra:member']?.length) throw new Error("No hay dominios disponibles");
      const domain = domainData['hydra:member'][0].domain;

      const username = `user${Math.random().toString(36).substring(2, 8)}`;
      const address = `${username}@${domain}`;
      const password = generatePassword();

      const createRes = await fetch(`${API_BASE}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password })
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.message || "Error creando cuenta");
      }

      const tokenRes = await fetch(`${API_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password })
      });

      if (!tokenRes.ok) throw new Error("Error de autenticación");
      const tokenData = await tokenRes.json();

      const newAccount = {
        address,
        password,
        token: tokenData.token,
        id: tokenData.id
      };

      localStorage.setItem('tm_account', JSON.stringify(newAccount));
      setAccount(newAccount);
      setMessages([]);
      setSelectedMessage(null);

      if (account) setCreationCooldown(ACCOUNT_CREATION_COOLDOWN);

    } catch (err) {
      console.error("❌ Error:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualRefresh = () => {
    if (refreshCooldown > 0 || isRefreshing) return;

    fetchMessages();
    setRefreshCooldown(MANUAL_REFRESH_COOLDOWN_SEC);
  };

  const fetchMessages = async (tokenOverride = null) => {
    const token = tokenOverride || account?.token;
    if (!token) return;

    setIsRefreshing(true);

    try {
      const res = await fetch(`${API_BASE}/messages?page=1`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401) {
        logoutAndReset();
        return;
      }

      if (!res.ok) throw new Error("Error al sincronizar");

      const data = await res.json();
      const msgs = data['hydra:member'] || [];
      setMessages(msgs);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchMessageContent = async (msgId) => {
    if (!account?.token) return;
    setIsLoading(true);
    setMessageContentHtml('');
    setAttachmentPreviews({});
    setAttachmentBlobSizes({});

    try {
      const res = await fetch(`${API_BASE}/messages/${msgId}`, {
        headers: { 'Authorization': `Bearer ${account.token}` }
      });
      if (!res.ok) throw new Error("Error al leer mensaje");
      const fullMsg = await res.json();
      setSelectedMessage(fullMsg);
    } catch (err) {
      console.error("Error leyendo:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadAuthenticated = async (url, filename) => {
    try {
      showToast(`Descargando ${filename}...`, 'success');
      const res = await fetch(`${API_BASE}${url}`, {
        headers: { 'Authorization': `Bearer ${account.token}` }
      });

      if (!res.ok) throw new Error('Error de descarga');

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename || 'archivo';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);

      showToast("¡Descarga completada!", 'success');
    } catch (e) {
      console.error(e);
      showToast("Error al descargar archivo", 'error');
    }
  };


  const processMessageContent = async (msg) => {
    console.log("🛠️ Iniciando procesamiento de mensaje...");
    let html = msg.html || `<pre>${msg.text}</pre>`;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const newPreviews = {};
    const newBlobSizes = {};

    if (msg.attachments && msg.attachments.length > 0) {
      const imageAttachments = msg.attachments.filter(att => att.contentType.startsWith('image/'));

      const promises = imageAttachments.map(async (att) => {
        let needsReplacement = false;
        let isOrphan = true;


        if (att.contentId) {
          const cleanId = att.contentId.replace(/[<>]/g, '');
          if (html.includes(`cid:${cleanId}`)) {
            needsReplacement = true;
            isOrphan = false;
          }
        }


        if (!needsReplacement) {
          const imgs = doc.querySelectorAll('img');
          imgs.forEach(img => {
            if (img.src.includes(att.downloadUrl) || img.getAttribute('src')?.includes(att.downloadUrl)) {
              needsReplacement = true;
              isOrphan = false;
            }
          });
        }


        if (!needsReplacement) {
          const attachmentSrc = `attachment:${att.id}`;
          if (html.includes(attachmentSrc)) {
            needsReplacement = true;
            isOrphan = false;
          }
        }


        try {
          const res = await fetch(`${API_BASE}${att.downloadUrl}`, {
            headers: { 'Authorization': `Bearer ${account.token}` }
          });

          if (!res.ok) throw new Error(`Fetch error: ${res.status}`);

          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);


          newPreviews[att.id] = objectUrl;
          newBlobSizes[att.id] = blob.size;


          if (needsReplacement) {
            if (att.contentId) {
              const cleanId = att.contentId.replace(/[<>]/g, '');
              html = html.split(`cid:${cleanId}`).join(objectUrl);
            }
            const fullUrl = `${API_BASE}${att.downloadUrl}`;
            html = html.split(fullUrl).join(objectUrl);
            html = html.split(att.downloadUrl).join(objectUrl);
            html = html.split(`attachment:${att.id}`).join(objectUrl);
            console.log(`✅ Imagen reemplazada inline: ${att.filename}`);
          }

        } catch (e) {
          console.error("❌ Error cargando imagen:", e);
        }
      });

      await Promise.all(promises);

      setAttachmentPreviews(prev => ({ ...prev, ...newPreviews }));
      setAttachmentBlobSizes(prev => ({ ...prev, ...newBlobSizes }));
    }


    const sanitizedDoc = parser.parseFromString(html, 'text/html');
    sanitizedDoc.querySelectorAll('img').forEach((img) => {
      const rawSrc = img.getAttribute('src') || '';
      const normalizedSrc = rawSrc.trim().toLowerCase();

      if (normalizedSrc.startsWith('attachment:') || normalizedSrc.startsWith('cid:')) {
        img.removeAttribute('src');
        img.setAttribute('data-src-pending', rawSrc);
      }
    });
    html = sanitizedDoc.body.innerHTML;

    html = DOMPurify.sanitize(html, {
      ADD_TAGS: ['style'],
      ADD_ATTR: ['data-src-pending']
    });

    setMessageContentHtml(html);
  };

  const startPolling = () => {
    stopPolling();
    pollingRef.current = setInterval(() => fetchMessages(), POLLING_INTERVAL);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const logoutAndReset = () => {
    if (creationCooldown > 0) return;
    localStorage.removeItem('tm_account');
    setAccount(null);
    setMessages([]);
    setSelectedMessage(null);
    createNewAccount();
  };

  const copyToClipboard = async () => {
    if (!account?.address) return;

    const success = () => showToast("¡Dirección copiada!", 'success');
    const fail = (e) => {
      console.error("Copy failed:", e);
      showToast("Error al copiar", 'error');
    };

    const runFallback = () => {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = account.address;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) success();
        else fail("ExecCommand returned false");
      } catch (e) {
        fail(e);
      }
    };

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(account.address);
        success();
      } catch (err) {
        console.warn("Navigator clipboard failed, trying fallback...", err);
        runFallback();
      }
    } else {
      runFallback();
    }
  };

  const formatBytes = (bytes) => {
    if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) return 'N/D';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const inferAttachmentSizeMultiplier = () => {
    if (!selectedMessage?.attachments?.length) return 1;

    for (const att of selectedMessage.attachments) {
      const rawSize = Number(att?.size);
      const blobSize = attachmentBlobSizes[att.id];

      if (Number.isFinite(rawSize) && rawSize > 0 && Number.isFinite(blobSize) && blobSize > 0) {
        const ratio = blobSize / rawSize;

        if (ratio > 900 && ratio < 1150) {
          return 1024;
        }

        if (ratio > 0.85 && ratio < 1.15) {
          return 1;
        }
      }
    }

    return 1;
  };

  const logAttachmentSizeCalculation = ({ att, source, rawSize, multiplier, computedBytes }) => {
    const messageId = selectedMessage?.id || 'no-message';
    const logKey = `${messageId}:${att.id}:${source}:${rawSize}:${multiplier}:${computedBytes}`;

    if (sizeDebugLoggedRef.current.has(logKey)) return;
    sizeDebugLoggedRef.current.add(logKey);

    console.log('📦 Cálculo tamaño adjunto', {
      filename: att.filename,
      attachmentId: att.id,
      source,
      apiRawSize: rawSize,
      appliedMultiplier: multiplier,
      computedBytes,
      computedLabel: formatBytes(computedBytes)
    });
  };

  const getAttachmentSizeLabel = (att) => {
    const isImageAttachment = att?.contentType?.startsWith('image/');
    const previewBytes = attachmentBlobSizes[att.id];

    if (isImageAttachment && typeof previewBytes !== 'number') {
      const messageId = selectedMessage?.id || 'no-message';
      const pendingKey = `${messageId}:${att.id}:pending-image-size`;

      if (!sizeDebugLoggedRef.current.has(pendingKey)) {
        sizeDebugLoggedRef.current.add(pendingKey);
        console.log('📦 Cálculo tamaño adjunto', {
          filename: att.filename,
          attachmentId: att.id,
          source: 'pending.image',
          note: 'Esperando blob.size para evitar tamaño incorrecto inicial'
        });
      }

      return 'Cargando...';
    }

    if (typeof previewBytes === 'number') {
      logAttachmentSizeCalculation({
        att,
        source: 'blob.size',
        rawSize: previewBytes,
        multiplier: 1,
        computedBytes: previewBytes
      });
      return formatBytes(previewBytes);
    }

    const rawApiSize = Number(att?.size);
    if (Number.isFinite(rawApiSize) && rawApiSize >= 0) {
      const multiplier = inferAttachmentSizeMultiplier();
      const computedBytes = rawApiSize * multiplier;

      logAttachmentSizeCalculation({
        att,
        source: 'api.size',
        rawSize: rawApiSize,
        multiplier,
        computedBytes
      });

      return formatBytes(computedBytes);
    }

    return 'N/D';
  };



  const Toast = () => (
    <div className={`fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
      <div className={`px-6 py-3 rounded-full shadow-lg flex items-center gap-3 font-medium ${toast?.type === 'error'
        ? 'bg-red-600 text-white'
        : 'bg-gray-800 dark:bg-white text-white dark:text-gray-900'
        }`}>
        {toast?.type === 'error' ? (
          <XCircle size={20} className="text-white" />
        ) : (
          <CheckCircle2 size={20} className="text-green-400 dark:text-green-600" />
        )}
        {toast?.message}
      </div>
    </div>
  );


  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900 text-gray-800 dark:text-gray-100 flex flex-col font-sans transition-colors duration-200">
      <Toast />


      <nav className="bg-white dark:bg-slate-800 shadow-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">

          <div className="flex items-center gap-3 select-none cursor-default group">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-full h-full drop-shadow-md" xmlns="http://www.w3.org/2000/svg" viewBox="40 50 420 420">
                <defs>
                  <linearGradient id="planetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#9E9E9E" />
                    <stop offset="50%" stopColor="#616161" />
                    <stop offset="100%" stopColor="#212121" />
                  </linearGradient>

                  <linearGradient id="heartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#F5F5F5" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#9E9E9E" stopOpacity="0.4" />
                  </linearGradient>

                  <linearGradient id="mailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00E5FF" />
                    <stop offset="100%" stopColor="#2979FF" />
                  </linearGradient>

                  <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <clipPath id="backHalf">
                    <rect x="0" y="-100" width="500" height="350" transform="rotate(-20 250 250)" />
                  </clipPath>
                  <clipPath id="frontHalf">
                    <rect x="0" y="250" width="500" height="350" transform="rotate(-20 250 250)" />
                  </clipPath>
                </defs>

                <circle cx="120" cy="150" r="2.5" fill="#00E5FF" opacity="0.6" />
                <circle cx="380" cy="120" r="1.5" fill="#E1BEE7" opacity="0.4" />
                <circle cx="150" cy="380" r="3" fill="#2979FF" opacity="0.5" />
                <circle cx="400" cy="400" r="2" fill="#8E24AA" opacity="0.4" />

                <ellipse cx="250" cy="250" rx="190" ry="75" fill="none" stroke="#2979FF" strokeWidth="2" strokeDasharray="6 12" transform="rotate(-20 250 250)" opacity="0.3" clipPath="url(#backHalf)" />

                <g id="Pluto">
                  <circle cx="250" cy="250" r="100" fill="url(#planetGrad)" />
                  <circle cx="250" cy="250" r="102" fill="none" stroke="#9E9E9E" strokeWidth="1.5" opacity="0.5" />
                  <path d="M 250 290
                               C 205 240, 185 215, 205 190
                               C 215 175, 240 180, 250 205
                               C 260 180, 285 175, 295 190
                               C 315 215, 295 240, 250 290 Z"
                    fill="url(#heartGrad)" transform="rotate(12 250 250)" />
                  <circle cx="200" cy="210" r="14" fill="#000000" opacity="0.3" />
                  <circle cx="290" cy="260" r="8" fill="#000000" opacity="0.25" />
                  <circle cx="195" cy="280" r="22" fill="#000000" opacity="0.2" />
                  <path d="M 150 250 A 100 100 0 0 0 350 250 A 90 90 0 0 1 150 250 Z" fill="#000000" opacity="0.35" />
                </g>

                <ellipse cx="250" cy="250" rx="190" ry="75" fill="none" stroke="#00E5FF" strokeWidth="3" strokeDasharray="6 12" transform="rotate(-20 250 250)" opacity="0.8" clipPath="url(#frontHalf)" />

                <g transform="translate(370, 290) rotate(-15)">
                  <g opacity="0.9">
                    <rect x="45" y="-12" width="8" height="8" rx="2" fill="#00E5FF" opacity="0.8" />
                    <rect x="62" y="2" width="5" height="5" rx="1" fill="#2979FF" opacity="0.6" />
                    <rect x="50" y="14" width="6" height="6" rx="1.5" fill="#00E5FF" opacity="0.7" />
                    <rect x="75" y="-6" width="4" height="4" rx="1" fill="#2979FF" opacity="0.4" />
                    <rect x="85" y="8" width="3" height="3" rx="0.5" fill="#00E5FF" opacity="0.3" />
                  </g>
                  <g filter="url(#neonGlow)">
                    <rect x="-38" y="-25" width="76" height="50" rx="6" fill="#0f111a" stroke="url(#mailGrad)" strokeWidth="3.5" />
                    <path d="M -38 -25 L 0 5 L 38 -25" fill="none" stroke="url(#mailGrad)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M -38 25 L -10 2 M 38 25 L 10 2" fill="none" stroke="url(#mailGrad)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                </g>
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              Pluto<span className="text-blue-600 dark:text-blue-400">Mail</span>
            </h1>
          </div>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors focus:outline-none"
            title="Cambiar tema"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center w-full max-w-4xl mx-auto px-4 py-8 gap-8">


        <section className="w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 sm:p-10 text-center relative overflow-hidden transition-colors duration-200">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 via-blue-500 to-purple-600"></div>

          <h2 className="text-gray-500 dark:text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4">Tu dirección temporal es</h2>

          {isLoading && !account ? (
            <div className="flex justify-center items-center py-4 text-blue-500">
              <Loader2 className="animate-spin" size={32} />
              <span className="ml-2 font-medium">Generando dirección segura...</span>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-slate-900 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl p-4 sm:p-6 mb-6 transition-colors">
              <p className="text-xl sm:text-3xl md:text-4xl font-mono break-all text-blue-600 dark:text-blue-400 font-bold select-all">
                {account?.address || '...'}
              </p>
            </div>
          )}


          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={copyToClipboard}
              disabled={!account}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              <Copy size={18} /> Copiar
            </button>

            <button
              onClick={handleManualRefresh}
              disabled={!account || isRefreshing || refreshCooldown > 0}
              className={`flex items-center gap-2 px-6 py-3 text-white rounded-lg font-medium shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${refreshCooldown > 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
            >
              <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? 'Actualizando...' : refreshCooldown > 0 ? `Espera ${refreshCooldown}s` : 'Actualizar'}
            </button>

            <button
              onClick={logoutAndReset}
              disabled={isLoading || creationCooldown > 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${creationCooldown > 0
                ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-600 border border-gray-200 dark:border-slate-700'
                : 'bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200'
                }`}
            >
              <Trash2 size={18} />
              {creationCooldown > 0 ? `Espera ${creationCooldown}s` : 'Eliminar'}
            </button>
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg flex items-center justify-center gap-2 text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button onClick={() => window.location.reload()} className="underline font-semibold ml-1 hover:text-red-800 dark:hover:text-red-300">Reintentar</button>
            </div>
          )}
        </section>


        {selectedMessage ? (

          <section className="w-full">
            <button
              onClick={() => setSelectedMessage(null)}
              className="flex items-center gap-2 mb-4 px-4 py-2 text-blue-600 dark:text-blue-400 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors"
            >
              <ChevronLeft size={20} /> Volver a Bandeja
            </button>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
              <div className="p-6 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h1 className="text-xl md:text-2xl font-bold mb-2 text-gray-900 dark:text-white">
                      {selectedMessage.subject || '(Sin Asunto)'}
                    </h1>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      <span className="font-semibold text-gray-500 dark:text-gray-400">De:</span> {selectedMessage.from.name}
                      <span className="text-xs ml-2 opacity-75">&lt;{selectedMessage.from.address}&gt;</span>
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      <span className="font-semibold text-gray-500 dark:text-gray-400">Para:</span> {selectedMessage.to[0].address}
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(selectedMessage.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="p-6 min-h-[300px] bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200">
                {messageContentHtml ? (
                  <div
                    className="prose dark:prose-invert max-w-none break-words [&>img]:max-w-full [&>img]:h-auto [&>img]:rounded-md"
                    dangerouslySetInnerHTML={{ __html: messageContentHtml }}
                  />
                ) : (
                  <div className="flex justify-center items-center py-10 opacity-50">
                    <Loader2 className="animate-spin mr-2" /> Cargando contenido...
                  </div>
                )}
              </div>

              {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                <div className="bg-gray-50 dark:bg-slate-900/50 p-4 border-t border-gray-200 dark:border-slate-700">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    <Paperclip size={16} /> Adjuntos ({selectedMessage.attachments.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedMessage.attachments.map((att) => {
                      const previewUrl = attachmentPreviews[att.id];

                      if (previewUrl) {
                        return (
                          <div key={att.id} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-all">
                            <div className="h-40 w-full bg-gray-200 dark:bg-slate-700 relative overflow-hidden flex items-center justify-center">
                              <img
                                src={previewUrl}
                                alt={att.filename}
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                  onClick={() => window.open(previewUrl, '_blank')}
                                  className="p-2 bg-white/90 text-gray-800 rounded-full hover:bg-white transition-colors"
                                  title="Ver completa"
                                >
                                  <ImageIcon size={18} />
                                </button>
                                <button
                                  onClick={() => downloadAuthenticated(att.downloadUrl, att.filename)}
                                  className="p-2 bg-blue-600/90 text-white rounded-full hover:bg-blue-600 transition-colors"
                                  title="Descargar"
                                >
                                  <Download size={18} />
                                </button>
                              </div>
                            </div>

                            <div className="p-3 text-sm flex items-center justify-between bg-white dark:bg-slate-800">
                              <span className="truncate font-medium flex-1 text-gray-700 dark:text-gray-200" title={att.filename}>{att.filename}</span>
                              <span className="text-xs text-gray-400 ml-2">{getAttachmentSizeLabel(att)}</span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={att.id}
                          onClick={() => downloadAuthenticated(att.downloadUrl, att.filename)}
                          className="flex items-center p-3 bg-white dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-700 hover:border-blue-500 transition-colors group text-left w-full shadow-sm"
                        >
                          <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded mr-3 text-blue-600 dark:text-blue-300">
                            <div className="text-xs font-bold">FILE</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                              {att.filename || 'Archivo sin nombre'}
                            </p>
                            <p className="text-xs text-gray-500">{getAttachmentSizeLabel(att)}</p>
                          </div>
                          <Download size={16} className="text-gray-400 group-hover:text-blue-500" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : (

          <section className="w-full">
            <div className="flex items-center justify-between mb-4 px-2">
              <h3 className="text-xl font-bold flex items-center gap-2 text-gray-800 dark:text-white">
                <Inbox size={24} className="text-gray-500 dark:text-gray-400" />
                Bandeja de Entrada
              </h3>
              <span className="text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-800">
                {messages.length} mensajes
              </span>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden min-h-[300px] border border-gray-100 dark:border-slate-700 transition-colors duration-200">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-80 text-gray-400 dark:text-gray-500 p-8 text-center">
                  {isLoading ? (
                    <Loader2 className="animate-spin mb-4 text-blue-500" size={48} />
                  ) : (
                    <div className="bg-gray-100 dark:bg-slate-700/50 p-6 rounded-full mb-4 transition-colors">
                      <Mail size={48} />
                    </div>
                  )}
                  <p className="text-lg font-medium">Esperando correos<WaitingDots /></p>
                  <p className="text-sm mt-2 opacity-75">La bandeja se actualiza automáticamente cada 10s.</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                  {messages.map((msg) => (
                    <li key={msg.id}>
                      <button
                        onClick={() => fetchMessageContent(msg.id)}
                        className="w-full text-left p-4 sm:p-6 hover:bg-blue-50 dark:hover:bg-slate-700/50 transition-colors flex flex-col sm:flex-row gap-4 group"
                      >
                        <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-slate-700 text-blue-700 dark:text-blue-300 rounded-full flex items-center justify-center font-bold text-xl shadow-sm">
                          {msg.from.name ? msg.from.name[0].toUpperCase() : '@'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1">
                            <h4 className="font-semibold text-lg truncate pr-2 text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {msg.from.name || msg.from.address}
                            </h4>
                            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono">
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate mb-1">
                            {msg.subject || '(Sin asunto)'}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate opacity-90">
                            {msg.intro || 'Haga clic para leer el contenido del mensaje...'}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

      </main>


      <footer className="py-8 text-center text-gray-500 dark:text-gray-400 text-sm border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors">
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-3">
            <span className="font-medium">&copy; {new Date().getFullYear()} Marcos Constantino</span>
            <div className="flex items-center gap-3 border-l border-gray-300 dark:border-gray-700 pl-3">
              <a
                href="https://github.com/MarcosConstantino2003"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-900 dark:hover:text-white transition-colors"
                aria-label="GitHub"
              >
                <Github size={18} />
              </a>
              <a
                href="https://www.linkedin.com/in/marquitosconstantino"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin size={18} />
              </a>
            </div>
          </div>
          <p className="text-xs opacity-60">Powered by Mail.tm API</p>
        </div>
      </footer>

    </div>
  );
}