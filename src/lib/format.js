export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) return 'N/D';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(dateString) {
  return new Date(dateString).toLocaleString();
}

export function initialFrom(name, address) {
  const source = name || address || '?';
  return source.trim()[0]?.toUpperCase() || '?';
}
