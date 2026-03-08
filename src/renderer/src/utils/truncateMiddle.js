export function truncateMiddle(value, maxLength = 24, headLength = 10, tailLength = 9) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;

  const safeHead = Math.max(1, Math.min(headLength, maxLength - 4));
  const safeTail = Math.max(1, Math.min(tailLength, maxLength - safeHead - 3));
  return `${text.slice(0, safeHead)}...${text.slice(text.length - safeTail)}`;
}
