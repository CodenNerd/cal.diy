import { createHmac, randomUUID } from "node:crypto";

export type MeetRole = "host" | "guest";

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64url");
}

/**
 * HS256 JWT matching calll.space Prosody token auth (room-bound, moderator claim).
 */
export function mintMeetJwt(opts: {
  room: string;
  role: MeetRole;
  appId: string;
  secret: string;
  name?: string;
  ttlSec?: number;
}): string {
  const isHost = opts.role === "host";
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSec ?? 2 * 60 * 60;
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      room: opts.room,
      sub: "meet.jitsi",
      context: {
        user: {
          name: opts.name || (isHost ? "Host" : "Guest"),
          moderator: isHost,
        },
      },
      iss: opts.appId,
      aud: opts.appId,
      iat: now,
      exp: now + ttl,
    })
  );
  const sig = createHmac("sha256", opts.secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function newMeetingRoomId(): string {
  return randomUUID();
}
