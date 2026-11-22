import type { CalendarEvent } from "@calcom/types/Calendar";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";

import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import { metadata } from "../_metadata";
import { mintMeetJwt, newMeetingRoomId } from "./mintMeetJwt";

function requireJwtConfig(): { appId: string; secret: string } {
  const appId = process.env.JITSI_JWT_APP_ID || process.env.JWT_APP_ID;
  const secret = process.env.JITSI_JWT_SECRET || process.env.JWT_APP_SECRET;
  if (!appId || !secret) {
    throw new Error(
      "JITSI_JWT_APP_ID and JITSI_JWT_SECRET (or JWT_APP_ID / JWT_APP_SECRET) are required to create meetings"
    );
  }
  return { appId, secret };
}

function resolveHostUrl(appKeys: Record<string, unknown>): string {
  const fromKeys = typeof appKeys.jitsiHost === "string" ? appKeys.jitsiHost.trim() : "";
  const fromEnv = (process.env.MEET_PUBLIC_URL || "").trim();
  const host = (fromKeys || fromEnv).replace(/\/$/, "");
  if (!host) {
    throw new Error("jitsiHost app key or MEET_PUBLIC_URL is required (must be our meeting domain)");
  }
  if (/meet\.jit\.si/i.test(host)) {
    throw new Error("jitsiHost must not be meet.jit.si — use MEET_PUBLIC_URL / our meeting host");
  }
  return host;
}

function joinUrl(hostUrl: string, room: string, jwt: string): string {
  return `${hostUrl}/${encodeURIComponent(room)}?jwt=${encodeURIComponent(jwt)}`;
}

const JitsiVideoApiAdapter = (): VideoApiAdapter => {
  return {
    getAvailability: () => {
      return Promise.resolve([]);
    },
    createMeeting: async (eventData: CalendarEvent): Promise<VideoCallData> => {
      const appKeys = (await getAppKeysFromSlug(metadata.slug)) as Record<string, unknown>;
      const hostUrl = resolveHostUrl(appKeys);
      const { appId, secret } = requireJwtConfig();

      const meetingPattern = (appKeys.jitsiPathPattern as string) || "{uuid}";
      const room = meetingPattern
        .replaceAll("{uuid}", newMeetingRoomId())
        .replaceAll("{Title}", eventData.title)
        .replaceAll("{Event Type Title}", eventData.type)
        .replaceAll("{Scheduler}", eventData.attendees.map((a) => a.name).join("-"))
        .replaceAll("{Organizer}", eventData.organizer.name)
        .replaceAll("{Location}", eventData.location || "")
        .replaceAll("{Team}", eventData.team?.name || "")
        .replaceAll(" ", "-");

      const hostJwt = mintMeetJwt({
        room,
        role: "host",
        appId,
        secret,
        name: eventData.organizer.name || "Host",
      });
      const guestJwt = mintMeetJwt({
        room,
        role: "guest",
        appId,
        secret,
        name: eventData.attendees[0]?.name || "Guest",
      });

      const hostMeetingUrl = joinUrl(hostUrl, room, hostJwt);
      const guestMeetingUrl = joinUrl(hostUrl, room, guestJwt);

      // meetingUrl = host (moderator). meetingPassword holds the guest join URL for our API (phase 2).
      return {
        type: metadata.type,
        id: room,
        password: guestMeetingUrl,
        url: hostMeetingUrl,
      };
    },
    deleteMeeting: async (): Promise<void> => {
      // Tokens expire; Prosody rooms are ephemeral. No remote revoke.
      return Promise.resolve();
    },
    updateMeeting: (bookingRef: PartialReference): Promise<VideoCallData> => {
      // Keep stored URLs; refreshing JWTs is a later phase.
      return Promise.resolve({
        type: "jitsi_video",
        id: bookingRef.meetingId as string,
        password: bookingRef.meetingPassword as string,
        url: bookingRef.meetingUrl as string,
      });
    },
  };
};

export default JitsiVideoApiAdapter;
