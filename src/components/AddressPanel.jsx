import { AlertCircle, Check, ChevronDown, Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { PROVIDERS } from '../lib/mailApi';

export default function AddressPanel({
  account,
  selectedProvider = 'mail.tm',
  isBootstrapping,
  isRefreshing,
  refreshCooldown,
  accountCooldown,
  justCopied,
  error,
  onCopy,
  onRefresh,
  onRotate,
  onRetry,
  onSelectProvider,
}) {
  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Tu direccion temporal
        </p>

        <div className="relative inline-flex items-center">
          <select
            value={selectedProvider}
            onChange={(e) => onSelectProvider?.(e.target.value)}
            disabled={isBootstrapping}
            className="appearance-none text-[11px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 pl-2 pr-5 py-0.5 rounded outline-none cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
            title="Seleccionar proveedor de correo API"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-1.5 pointer-events-none text-zinc-400 dark:text-zinc-500" />
        </div>
      </div>

      {isBootstrapping && !account ? (
        <div className="flex items-center gap-2.5 py-3.5 text-zinc-500 dark:text-zinc-400 text-sm">
          <Loader2 className="animate-spin" size={16} />
          Generando direccion...
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-4 py-3.5 mb-5">
          <p className="font-mono text-sm sm:text-base text-zinc-900 dark:text-zinc-100 truncate select-all">
            {account?.address || '—'}
          </p>
          <button
            onClick={onCopy}
            disabled={!account}
            className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 w-[92px] justify-center ${
              justCopied
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900'
            }`}
          >
            {justCopied ? (
              <>
                <Check size={13} />
                Copiado
              </>
            ) : (
              <>
                <Copy size={13} />
                Copiar
              </>
            )}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2.5">
        <button
          onClick={onRefresh}
          disabled={!account || isRefreshing || refreshCooldown > 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          {refreshCooldown > 0 ? `Espera ${refreshCooldown}s` : 'Actualizar'}
        </button>

        <button
          onClick={onRotate}
          disabled={isBootstrapping || accountCooldown > 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 dark:hover:text-red-400 dark:hover:border-red-900 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 disabled:hover:text-zinc-500 disabled:hover:border-zinc-200 disabled:hover:bg-transparent"
        >
          <Trash2 size={14} />
          {accountCooldown > 0 ? `Espera ${accountCooldown}s` : 'Descartar'}
        </button>
      </div>

      {error && (
        <div className="mt-5 flex items-center gap-2 px-4 py-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={15} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={onRetry} className="font-medium underline underline-offset-2 hover:text-red-800 dark:hover:text-red-300">
            Reintentar
          </button>
        </div>
      )}
    </section>
  );
}
