export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isRoomCode(value: string): boolean {
  return /^[A-Z0-9]{6,8}$/.test(normalizeRoomCode(value));
}
