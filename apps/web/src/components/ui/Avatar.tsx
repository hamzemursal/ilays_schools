const PALETTE = ["#2456e5", "#1c8754", "#b4740e", "#c22e2e", "#7c3aed", "#0891b2"];

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({
  name,
  photoUrl,
  size = "md",
}: {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" }[size];
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" className={`${sizeClasses} shrink-0 rounded-full object-cover`} />;
  }

  return (
    <div
      className={`flex ${sizeClasses} shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ backgroundColor: colorFor(name || "?") }}
    >
      {initials || "?"}
    </div>
  );
}
