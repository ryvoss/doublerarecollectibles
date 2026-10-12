export function logServerError(context: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error(context, error);
    return;
  }

  const safeDetails: Record<string, string> = {};
  if (error instanceof Error) safeDetails.name = error.name;
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = Reflect.get(error, "code");
    if (typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code)) safeDetails.code = code;
  }
  console.error(context, safeDetails);
}

export function developmentErrorDetails(error: unknown): { details: string } | Record<string, never> {
  if (process.env.NODE_ENV === "production") return {};
  return { details: error instanceof Error ? error.message : String(error) };
}
