import { CheckCircle2, XCircle } from 'lucide-react';

export default function Toast({ toast }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-200 ${
        toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
      }`}
    >
      <div className="flex items-center gap-2.5 pl-3.5 pr-4 py-2.5 rounded-lg shadow-card border bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-sm font-medium text-zinc-800 dark:text-zinc-100">
        {toast?.type === 'error' ? (
          <XCircle size={16} className="text-red-500 flex-shrink-0" />
        ) : (
          <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
        )}
        {toast?.message}
      </div>
    </div>
  );
}
