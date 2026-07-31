import { ChevronLeft, Loader2 } from 'lucide-react';
import { formatDateTime } from '../lib/format';
import AttachmentGrid from './AttachmentGrid';

export default function MessageDetail({ message, bodyHtml, isLoading, previews, onBack, onDownload }) {
  return (
    <section>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-4 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
      >
        <ChevronLeft size={16} />
        Volver a la bandeja
      </button>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex justify-between items-start gap-4">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">
              {message.subject || '(Sin asunto)'}
            </h1>
            <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500 whitespace-nowrap pt-0.5">
              {formatDateTime(message.createdAt)}
            </span>
          </div>
          <div className="mt-2.5 space-y-1 text-sm text-zinc-500 dark:text-zinc-400">
            <p>
              <span className="text-zinc-400 dark:text-zinc-500">De: </span>
              <span className="text-zinc-700 dark:text-zinc-300">{message.from?.name}</span>
              <span className="ml-1.5 text-xs opacity-70">&lt;{message.from?.address}&gt;</span>
            </p>
            <p>
              <span className="text-zinc-400 dark:text-zinc-500">Para: </span>
              <span className="text-zinc-700 dark:text-zinc-300">{message.to?.[0]?.address}</span>
            </p>
          </div>
        </div>

        <div className="px-6 py-6 min-h-[220px]">
          {bodyHtml ? (
            <div className="message-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          ) : isLoading ? (
            <div className="flex items-center justify-center py-10 text-zinc-400 gap-2 text-sm">
              <Loader2 className="animate-spin" size={16} />
              Cargando contenido...
            </div>
          ) : null}
        </div>

        <AttachmentGrid attachments={message.attachments} previews={previews} onDownload={onDownload} />
      </div>
    </section>
  );
}
