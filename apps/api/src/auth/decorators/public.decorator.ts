import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

// Marks a route as reachable without a valid access token. Every other route
// is denied by default — this is an explicit opt-out, never the default.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
