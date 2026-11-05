export function errorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Something went wrong. Please try again.";
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return "The network request failed. Check your connection and try again.";
  }
  if (/duplicate key|unique constraint/i.test(message)) {
    return "That choice was just taken. Pick a different option.";
  }
  return message.replace(/^P0001:\s*/, "");
}
