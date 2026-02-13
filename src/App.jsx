import React, { useState, useEffect, useRef } from 'react';
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
  Linkedin
} from 'lucide-react';

const API_BASE = 'https://api.mail.tm';
const POLLING_INTERVAL = 10000; // 10 segundos para auto-refresh
const ACCOUNT_CREATION_COOLDOWN = 60; // 60 segundos entre cuentas nuevas
const MANUAL_REFRESH_COOLDOWN = 5000; // 5 segundos entre clicks manuales

export default function App() {
  // --- Estados ---
  const [account, setAccount] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [messageContentHtml, setMessageContentHtml] = useState('');
  
  // Estados de carga y UI
  const [isLoading, setIsLoading] = useState(false); // Carga general (crear cuenta)
  const [isRefreshing, setIsRefreshing] = useState(false); // Carga de mensajes
  const [error, setError] = useState(null);
  
  // Estados de Rate Limiting (Cooldowns)
  const [creationCooldown, setCreationCooldown] = useState(0); // Segundos restantes para cambiar mail
  const [canManualRefresh, setCanManualRefresh] = useState(true); // Bloqueo de botón actualizar

  // Modo Oscuro
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return true;
  });

  const pollingRef = useRef(null);
  const cooldownIntervalRef = useRef(null);

  // --- Efectos ---

  // 1. Manejo del Modo Oscuro
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // 2. Inicialización
  useEffect(() => {
    const init = async () => {
      // Restaurar cooldown si existe (opcional, por ahora reinicia al recargar para no ser molesto)
      // const savedCooldown = localStorage.getItem('tm_cooldown_end');
      
      const savedAccount = localStorage.getItem('tm_account');
      if (savedAccount) {
        console.log("💾 Cuenta encontrada. Restaurando...");
        const parsedAccount = JSON.parse(savedAccount);
        setAccount(parsedAccount);
        fetchMessages(parsedAccount.token);
      } else {
        console.log("✨ Iniciando primera cuenta...");
        await createNewAccount();
      }
    };
    init();

    return () => {
      stopPolling();
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    };
  }, []);

  // 3. Polling automático
  useEffect(() => {
    if (account?.token) {
      startPolling();
    }
    return () => stopPolling();
  }, [account]);

  // 4. Procesar HTML de mensajes
  useEffect(() => {
    if (selectedMessage && account?.token) {
      processMessageContent(selectedMessage);
    }
  }, [selectedMessage]);

  // 5. Gestión del contador de Cooldown
  useEffect(() => {
    if (creationCooldown > 0) {
      cooldownIntervalRef.current = setInterval(() => {
        setCreationCooldown(prev => {
          if (prev <= 1) {
            clearInterval(cooldownIntervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(cooldownIntervalRef.current);
  }, [creationCooldown]);


  // --- Lógica de Negocio ---

  const generatePassword = () => Math.random().toString(36).slice(-8) + "Aa1!";

  const createNewAccount = async () => {
    // Protección doble por si acaso
    if (creationCooldown > 0 && account) return; 

    setIsLoading(true);
    setError(null);
    stopPolling();

    try {
      // 1. Obtener dominio
      const domainRes = await fetch(`${API_BASE}/domains`);
      if (!domainRes.ok) throw new Error("Error obteniendo dominios");
      const domainData = await domainRes.json();
      
      if (!domainData['hydra:member']?.length) throw new Error("No hay dominios disponibles");
      const domain = domainData['hydra:member'][0].domain;
      
      // 2. Crear cuenta
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

      // 3. Obtener Token
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
      
      // Activar cooldown de creación solo si NO es la primera carga (es decir, si el usuario ya tenía cuenta y la cambió)
      if (account) {
        setCreationCooldown(ACCOUNT_CREATION_COOLDOWN);
      }

    } catch (err) {
      console.error("❌ Error:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualRefresh = () => {
    if (!canManualRefresh || isRefreshing) return;
    
    fetchMessages();
    
    // Activar bloqueo temporal del botón
    setCanManualRefresh(false);
    setTimeout(() => setCanManualRefresh(true), MANUAL_REFRESH_COOLDOWN);
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

  const processMessageContent = async (msg) => {
    let html = msg.html || `<pre>${msg.text}</pre>`;

    if (msg.attachments && msg.attachments.length > 0) {
      const promises = msg.attachments.map(async (att) => {
        if (!att.contentId) return;
        const cleanId = att.contentId.replace(/[<>]/g, '');

        if (att.contentType.startsWith('image/') && html.includes(`cid:${cleanId}`)) {
          try {
            const res = await fetch(`${API_BASE}${att.downloadUrl}`, {
              headers: { 'Authorization': `Bearer ${account.token}` }
            });
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            html = html.replace(new RegExp(`cid:${cleanId}`, 'g'), objectUrl);
          } catch (e) {
            console.error("Error img:", e);
          }
        }
      });
      await Promise.all(promises);
    }
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
    if (creationCooldown > 0) return; // Bloqueo extra por seguridad
    localStorage.removeItem('tm_account');
    setAccount(null);
    setMessages([]);
    setSelectedMessage(null);
    createNewAccount();
  };

  const copyToClipboard = () => {
    if (!account?.address) return;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(account.address)
            .then(() => alert("¡Dirección copiada!"))
            .catch(() => fallbackCopy(account.address));
    } else {
        fallbackCopy(account.address);
    }
  };

  const fallbackCopy = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      alert("¡Dirección copiada!");
    } catch (err) {
      alert("Error al copiar manual.");
    }
    document.body.removeChild(textArea);
  };

  // --- Renderizado UI ---

  // VISTA DETALLE MENSAJE (Sin cambios mayores, solo mantenimiento)
  if (selectedMessage) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-slate-900 text-gray-800 dark:text-gray-100 flex flex-col font-sans transition-colors duration-200">
        <header className="bg-white dark:bg-slate-800 shadow-sm p-4 sticky top-0 z-10 flex items-center gap-4">
          <button 
            onClick={() => setSelectedMessage(null)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <h2 className="font-bold text-lg truncate flex-1">
            {selectedMessage.subject || '(Sin Asunto)'}
          </h2>
        </header>

        <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedMessage.attachments.map((att) => (
                    <a 
                      key={att.id}
                      href={`${API_BASE}${att.downloadUrl}?token=${account.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center p-3 bg-white dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-700 hover:border-blue-500 transition-colors group"
                    >
                      <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded mr-3 text-blue-600 dark:text-blue-300">
                        {att.contentType.includes('image') ? <div className="text-xs font-bold">IMG</div> : <div className="text-xs font-bold">FILE</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {att.filename || 'Archivo sin nombre'}
                        </p>
                        <p className="text-xs text-gray-500">{(att.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <Download size={16} className="text-gray-400 group-hover:text-blue-500" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // VISTA PRINCIPAL
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900 text-gray-800 dark:text-gray-100 flex flex-col font-sans transition-colors duration-200">
      
      {/* HEADER */}
      <nav className="bg-white dark:bg-slate-800 shadow-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2 select-none cursor-default">
            <Mail className="text-blue-600 dark:text-blue-400" size={28} />
            <h1 className="text-xl font-bold tracking-tight">TempMail<span className="text-blue-600 dark:text-blue-400">Pro</span></h1>
          </div>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Cambiar tema"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center w-full max-w-4xl mx-auto px-4 py-8 gap-8">
        
        {/* HERO SECTION */}
        <section className="w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 sm:p-10 text-center relative overflow-hidden transition-colors duration-200">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-600"></div>
          
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

          {/* Botones de Acción */}
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
              disabled={!account || isRefreshing || !canManualRefresh}
              className={`flex items-center gap-2 px-6 py-3 text-white rounded-lg font-medium shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${
                 !canManualRefresh ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} /> 
              {isRefreshing ? 'Actualizando...' : !canManualRefresh ? 'Espera 5s' : 'Actualizar'}
            </button>

            <button 
              onClick={logoutAndReset}
              disabled={isLoading || creationCooldown > 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                creationCooldown > 0 
                  ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-600 border border-gray-200 dark:border-slate-700' 
                  : 'bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200'
              }`}
            >
              <Trash2 size={18} /> 
              {creationCooldown > 0 ? `Espera ${creationCooldown}s` : 'Cambiar Mail'}
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

        {/* INBOX SECTION */}
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
                <p className="text-lg font-medium">Esperando correos...</p>
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
                            {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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

      </main>

      {/* FOOTER */}
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