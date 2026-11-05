export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "Non connecté");
export const forbidden = (msg = "Accès refusé") => new HttpError(403, msg);
export const notFound = (msg = "Introuvable") => new HttpError(404, msg);
export const badRequest = (msg = "Requête invalide") => new HttpError(400, msg);
export const tooManyRequests = (retryAfterSec: number) =>
  Object.assign(new HttpError(429, "Trop de requêtes, réessaie plus tard"), { retryAfterSec });

/**
 * CSRF guard for cookie-authenticated route handlers (server actions already
 * check Origin): the Origin header must match this app's host.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw forbidden("Origine manquante");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Origine invalide");
  }
  if (originHost !== host) throw forbidden("Origine non autorisée");
}

/** Turns a thrown error into a JSON Response for route handlers. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    const headers: Record<string, string> = {};
    const retry = (err as HttpError & { retryAfterSec?: number }).retryAfterSec;
    if (retry) headers["Retry-After"] = String(retry);
    return Response.json({ error: err.message }, { status: err.status, headers });
  }
  console.error(err);
  return Response.json({ error: "Erreur serveur" }, { status: 500 });
}

/** Result type for server actions: never leak stack traces to the client. */
export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    if (err instanceof HttpError) return { ok: false, error: err.message };
    // Next.js redirect()/notFound() must propagate
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error(err);
    return { ok: false, error: "Erreur serveur" };
  }
}
