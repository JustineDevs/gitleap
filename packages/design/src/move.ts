export function wrapStep(currentIndex: number, stepDirection: number, totalLength: number): number {
  if (!Number.isInteger(totalLength) || totalLength <= 0) return 0;
  const nextIndex = currentIndex + stepDirection;
  return ((nextIndex % totalLength) + totalLength) % totalLength;
}

export function windowStart(
  currentIndex: number,
  currentWindowStart: number,
  viewportHeight: number,
  totalLength: number,
): number {
  if (!Number.isInteger(totalLength) || totalLength <= 0 || viewportHeight <= 0) return 0;
  const viewport = Math.min(Math.floor(viewportHeight), totalLength);
  const selected = Math.max(0, Math.min(totalLength - 1, Math.floor(currentIndex)));
  const previous = Math.max(
    0,
    Math.min(totalLength - viewport, Number.isFinite(currentWindowStart) ? currentWindowStart : 0),
  );
  const centered = selected - Math.floor((viewport - 1) / 2);
  const target = totalLength <= viewport ? previous : centered;
  return Math.max(0, Math.min(totalLength - viewport, target));
}
