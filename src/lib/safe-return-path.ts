export function safeReturnPath(
  value: string | null | undefined,
  fallback = "/dashboard",
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(value)
  )
    return fallback;
  try {
    const url = new URL(value, "https://autolocal.invalid");
    return url.origin === "https://autolocal.invalid"
      ? url.pathname + url.search + url.hash
      : fallback;
  } catch {
    return fallback;
  }
}
