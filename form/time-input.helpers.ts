// TimeInput stores a time of day as minutes after midnight (8:30 → 510).

export const formatMinutesOfDay = (minutesOfDay: number): string => {
  const hours = Math.floor(minutesOfDay / 60)
  const minutes = minutesOfDay % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** Reads "HH:MM" (or "H") into minutes after midnight; undefined when it is not a valid time. */
export const parseTimeText = (timeText: string): number | undefined => {
  const match = timeText.trim().match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!match) { return undefined }
  const hours = Number(match[1])
  const minutes = Number(match[2] || 0)
  if (hours > 23 || minutes > 59) { return undefined }
  return hours * 60 + minutes
}
