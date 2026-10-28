export function threadTitle(text: string): string {
  const single = text.replace(/\s+/g, " ").trim();
  if (single.length <= 42) return single;
  return `${single.slice(0, 42)}…`;
}
