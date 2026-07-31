import { Download, Paperclip } from 'lucide-react';
import { formatBytes } from '../lib/format';

export default function AttachmentGrid({ attachments, previews, onDownload }) {
  if (!attachments?.length) return null;

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-5">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
        <Paperclip size={13} />
        Adjuntos ({attachments.length})
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {attachments.map((att) => {
          const preview = previews[att.id];

          if (preview) {
            return (
              <div
                key={att.id}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900"
              >
                <img src={preview.url} alt={att.filename} className="w-full h-32 object-cover bg-zinc-100 dark:bg-zinc-800" />
                <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate" title={att.filename}>
                    {att.filename}
                  </span>
                  <button
                    onClick={() => onDownload(att)}
                    className="flex-shrink-0 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    title="Descargar"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <button
              key={att.id}
              onClick={() => onDownload(att)}
              className="flex items-center gap-3 px-3.5 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-left transition-colors"
            >
              <div className="w-8 h-8 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                <Paperclip size={14} className="text-zinc-500 dark:text-zinc-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                  {att.filename || 'Archivo sin nombre'}
                </p>
                <p className="text-xs text-zinc-400">{formatBytes(att.size)}</p>
              </div>
              <Download size={14} className="text-zinc-400 flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
