import { Moon, Sun } from 'lucide-react';
import Logo from './Logo';

export default function Header({ isDark, onToggleTheme }) {
  return (
    <header className="sticky top-0 z-20 bg-white/90 dark:bg-zinc-950/90 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
        <Logo />
        <button
          onClick={onToggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors"
          title="Cambiar tema"
          aria-label="Cambiar tema"
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
}
