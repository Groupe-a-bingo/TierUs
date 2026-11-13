import { TIERS, type Tier } from "@/lib/tiers";
import { AvatarTile } from "./avatar-tile";
import { TierBoardFrame, TierRow } from "./tier-row";
import type { Member } from "@/lib/types";

/** Read-only tier list: `rows` maps each tier to ordered member ids. */
export function TierResult({
  rows,
  members,
  captions,
  reveal = true,
}: {
  rows: Record<Tier, string[]>;
  members: Map<string, Member>;
  captions?: Map<string, string>;
  reveal?: boolean;
}) {
  return (
    <TierBoardFrame>
      {TIERS.map((tier) => (
        <TierRow key={tier} tier={tier} reveal={reveal}>
          {rows[tier].map((id) => {
            const m = members.get(id);
            if (!m) return null;
            const caption = captions?.get(id);
            return <AvatarTile key={id} name={m.name} fileId={m.avatarFileId} title={caption ? `${m.name} · ${caption}` : m.name} />;
          })}
        </TierRow>
      ))}
    </TierBoardFrame>
  );
}
