export function withImageQuality(
  rawUrl?: string | null,
  quality: number = 70
): string {
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl); // URL absoluta (https://)
    url.searchParams.set("quality", String(quality));
    return url.toString();
  } catch {
    // URL relativa ou formato estranho
    const hasQuery = rawUrl.includes("?");
    const separator = hasQuery ? "&" : "?";
    return `${rawUrl}${separator}quality=${quality}`;
  }
}
