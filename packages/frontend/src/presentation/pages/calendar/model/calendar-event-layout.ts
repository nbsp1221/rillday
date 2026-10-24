export function calendarEventLayout(duration: number, minutesLeft = 1440, pixelsPerHour = 64) {
  const height = Math.min(
    (minutesLeft / 60) * pixelsPerHour,
    Math.max(14, (Math.max(15, duration) / 60) * pixelsPerHour - 2),
  );
  const compact = duration < 30;
  const lineHeight = compact ? 14 : 15;
  const verticalPadding = compact ? 0 : 8;
  return {
    height,
    compact,
    lineHeight,
    lines: Math.max(1, Math.floor((height - verticalPadding) / lineHeight)),
  };
}
