export default function Logo() {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <img src="/logo.png" alt="PlutoMail" className="h-8 w-8 object-contain flex-shrink-0" />
      <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white">
        Pluto<span className="text-zinc-400 dark:text-zinc-500 font-medium">Mail</span>
      </span>
    </div>
  );
}
