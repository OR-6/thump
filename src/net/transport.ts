/** A message pipe between two devices (WebRTC data channel in play, an in-memory pipe in tests). */
export interface Transport {
  send(msg: unknown): void;
  onMessage(cb: (msg: unknown) => void): void;
}
