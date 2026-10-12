const SESSION_TTL_MILLISECONDS = 12 * 60 * 60 * 1000;

export function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return value;
}

export function sessionCookieName(production: boolean) {
  // The __Host- prefix requires Secure, which local HTTP development cannot
  // provide. Production always uses the required host-bound cookie name.
  return production ? "__Host-drc_session" : "drc_session";
}

export function sessionCookieOptions(production: boolean) {
  return {
    httpOnly: true,
    maxAge: SESSION_TTL_MILLISECONDS,
    path: "/" as const,
    sameSite: "strict" as const,
    secure: production,
  };
}

export function sessionCookieClearOptions(production: boolean) {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions(production);
  void _maxAge;
  return options;
}

export const SESSION_TTL_SECONDS = SESSION_TTL_MILLISECONDS / 1000;
