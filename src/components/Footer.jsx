import { Github, Linkedin } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-auto">
      <div className="max-w-3xl mx-auto px-5 py-6 flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
          <span>&copy; {new Date().getFullYear()} Marcos Constantino</span>
          <span className="w-px h-3 bg-zinc-200 dark:bg-zinc-800" />
          <a
            href="https://github.com/MarcosConstantino2003"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-900 dark:hover:text-white transition-colors"
            aria-label="GitHub"
          >
            <Github size={15} />
          </a>
          <a
            href="https://www.linkedin.com/in/marquitosconstantino"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-900 dark:hover:text-white transition-colors"
            aria-label="LinkedIn"
          >
            <Linkedin size={15} />
          </a>
        </div>
        <p className="text-[11px] text-zinc-300 dark:text-zinc-600">Impulsado por la API de mail.tm</p>
      </div>
    </footer>
  );
}
