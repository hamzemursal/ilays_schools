"use client";

import { MyAccountPage } from "@/features/account/MyAccountPage";

// Reachable from the header avatar menu (Topbar), not the sidebar — every
// authenticated user gets exactly this one page for password + 2FA, no
// per-role duplicates.
export default function AccountPage() {
  return <MyAccountPage />;
}
