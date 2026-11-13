/**
 * Frame-loop safety: one exception inside a system's update must never stop
 * the XR render loop. Errors are logged once per distinct message.
 * Callers use an inline try/catch (no per-frame closure allocation).
 */
const seen = new Set<string>();

export function reportFrameError(name: string, e: unknown): void {
  const msg = `${name}: ${e instanceof Error ? e.message : String(e)}`;
  if (seen.has(msg)) return;
  seen.add(msg);
  console.error('[thump]', msg, e);
}
