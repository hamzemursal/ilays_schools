"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "./Button";
import { useToast } from "./Toast";
import { shareText } from "@/lib/share";

// One button, reused wherever a list can be shared — a plain-text summary
// via the OS share sheet where available, clipboard copy everywhere else.
// `text` is a thunk so the (possibly non-trivial) formatting only runs when
// the admin actually clicks Share, not on every render of the list.
export function ShareListButton({
  title,
  text,
  size = "sm",
}: {
  title: string;
  text: () => string;
  size?: "sm" | "md" | "lg";
}) {
  const { show } = useToast();
  const [sharing, setSharing] = useState(false);

  async function onShare() {
    setSharing(true);
    try {
      const result = await shareText(title, text());
      if (result === "copied") show("List copied to clipboard.");
      else if (result === "failed") show("Couldn't share or copy the list.", "danger");
    } finally {
      setSharing(false);
    }
  }

  return (
    <Button variant="outline" size={size} icon={<Share2 className="size-4" />} loading={sharing} onClick={onShare}>
      Share
    </Button>
  );
}
