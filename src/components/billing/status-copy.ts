export function humanStatus(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace("Void", "Cancelled")
    .replace("Processed", "Completed")
    .replace("Rejected", "Cancelled");
}
