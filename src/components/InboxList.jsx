import { Inbox, Loader2, Mail } from 'lucide-react';
import { formatTime, initialFrom } from '../lib/format';

function EmptyInbox({ isLoading }) {
  return (
    <div className="flex flex-col items-center justify-center h-72 text-center px-6">
      {isLoading ? (
        <Loader2 className="animate-spin text-zinc-300 dark:text-zinc-700 mb-4" size={28} />
      ) : (
        <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
          <Mail size={20} className="text-zinc-400 dark:text-zinc-500" />
        </div>
      )}
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Esperando correos</p>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
        La bandeja se actualiza automaticamente cada 10 segundos.
      </p>
    </div>
  );
}

export default function InboxList({ messages, isLoading, onOpenMessage }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          <Inbox size={16} className="text-zinc-400" />
          Bandeja de entrada
        </h2>
        <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
          {messages.length} {messages.length === 1 ? 'mensaje' : 'mensajes'}
        </span>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        {messages.length === 0 ? (
          <EmptyInbox isLoading={isLoading} />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {messages.map((msg) => (
              <li key={msg.id}>
                <button
                  onClick={() => onOpenMessage(msg.id)}
                  className="w-full text-left px-5 py-4 flex gap-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors group"
                >
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center text-sm font-semibold">
                    {initialFrom(msg.from?.name, msg.from?.address)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline gap-2 mb-0.5">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {msg.from?.name || msg.from?.address}
                      </p>
                      <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate mb-0.5">
                      {msg.subject || '(Sin asunto)'}
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                      {msg.intro || 'Abrir para leer el contenido del mensaje.'}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
