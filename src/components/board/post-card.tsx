import Link from "next/link";
import { MessageCircle, ArrowRight, Pin, Sparkles } from "lucide-react";
import { cva } from "class-variance-authority";
import { AvatarTile } from "@/components/tier-board/avatar-tile";
import { formatDayFr, formatTimeFr } from "@/lib/dates";
import { Countdown } from "./countdown";
import type { BoardPost } from "@/server/board";
import type { Member } from "@/lib/types";

const MEDALS = ["🥇", "🥈", "🥉"];

const statusChip = cva("inline-flex shrink-0 items-center rounded-full border-2 border-ink px-2.5 py-0.5 font-display text-xs font-bold whitespace-nowrap", {
  variants: {
    tone: {
      play: "bg-tier-s text-tier-foreground",
      done: "bg-tier-d text-tier-foreground",
      muted: "border-board-edge bg-secondary text-muted-foreground",
    },
  },
});

/** Results are visible as soon as you answered; nothing is ever "revealed" by itself. */
function status(post: BoardPost) {
  if (post.active) return post.mine ? { label: "Joué ✓", tone: "done" as const } : { label: "À toi de jouer", tone: "play" as const };
  return post.mine ? { label: "Joué", tone: "muted" as const } : { label: "Pas joué", tone: "muted" as const };
}

const postHref = (post: { id: string }) => `/r/${post.id}`;
/** A short accessible name: the whole card (podium, counters) would be read otherwise. */
const postLabel = (post: BoardPost) => `${post.title} · ${status(post).label}`;

function Podium({ post, members }: { post: BoardPost; members: Map<string, Member> }) {
  if (!post.top3.length) return null;
  return (
    <div className="flex items-center gap-3">
      {post.top3.map((id, i) => {
        const m = members.get(id);
        return m ? (
          <span key={id} className="flex items-center gap-1 text-sm">
            {MEDALS[i]}
            <AvatarTile name={m.name} fileId={m.avatarFileId} size="sm" />
          </span>
        ) : null;
      })}
    </div>
  );
}

function Meta({ post }: { post: BoardPost }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span>
        <strong className="text-foreground">{post.played}</strong>/{post.total} ont joué
      </span>
      <span className="flex items-center gap-1">
        <MessageCircle className="size-4" /> {post.comments}
      </span>
      {post.reactions.slice(0, 4).map((r) => (
        <span key={r.emoji}>
          {r.emoji} {r.count}
        </span>
      ))}
    </div>
  );
}

/** An active tier list: the big pinned hero (several can be active at once). */
export function PinnedPost({ post, members }: { post: BoardPost; members: Map<string, Member> }) {
  const s = status(post);
  const cta = post.mine ? "Voir les résultats" : "Jouer";
  return (
    <Link href={postHref(post)} aria-label={postLabel(post)} className="group block animate-rise">
      <article className="flex flex-col gap-4 rounded-3xl border-2 border-ink bg-primary p-5 text-primary-foreground shadow-pop-lg transition-transform duration-100 group-hover:-translate-y-1 group-active:translate-y-1 group-active:shadow-pop lg:gap-6 lg:p-10">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 font-display text-xs font-bold tracking-widest uppercase">
            {post.kind === "daily" ? (
              <>
                <Pin className="size-3.5" /> Tier list du jour
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" /> Tier list bonus
              </>
            )}
          </span>
          <span className={statusChip({ tone: s.tone })}>{s.label}</span>
        </div>
        <div className="flex items-start justify-between gap-8">
          <h2 className="font-display text-3xl leading-none font-extrabold lg:max-w-3xl lg:text-6xl">{post.title}</h2>
          {/* desktop decoration: the six tier keys */}
          <div className="hidden shrink-0 rotate-3 grid-cols-2 gap-2 lg:grid" aria-hidden>
            <span className="flex size-14 items-center justify-center rounded-xl border-2 border-ink bg-tier-s font-display text-2xl font-extrabold shadow-pop-sm">S</span>
            <span className="flex size-14 items-center justify-center rounded-xl border-2 border-ink bg-tier-a font-display text-2xl font-extrabold shadow-pop-sm">A</span>
            <span className="flex size-14 items-center justify-center rounded-xl border-2 border-ink bg-tier-b font-display text-2xl font-extrabold shadow-pop-sm">B</span>
            <span className="flex size-14 items-center justify-center rounded-xl border-2 border-ink bg-tier-c font-display text-2xl font-extrabold shadow-pop-sm">C</span>
            <span className="flex size-14 items-center justify-center rounded-xl border-2 border-ink bg-tier-d font-display text-2xl font-extrabold shadow-pop-sm">D</span>
            <span className="flex size-14 items-center justify-center rounded-xl border-2 border-ink bg-tier-f font-display text-2xl font-extrabold shadow-pop-sm">F</span>
          </div>
        </div>
        <Podium post={post} members={members} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-1 text-sm">
            <strong>{post.played}</strong>/{post.total} ont joué · <MessageCircle className="size-4" /> {post.comments} · <Countdown expiresAt={post.expiresAt.toISOString()} />
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-xl border-2 border-ink bg-card px-4 py-2 font-display font-bold text-foreground lg:px-6 lg:py-3 lg:text-lg">
            {cta} <ArrowRight className="size-4" />
          </span>
        </div>
      </article>
    </Link>
  );
}

/** Archive entry, forum-thread style. */
export function PostCard({ post, members }: { post: BoardPost; members: Map<string, Member> }) {
  const s = status(post);
  return (
    <Link href={postHref(post)} aria-label={postLabel(post)} className="group block">
      <article className="flex h-full flex-col gap-3 rounded-2xl border-2 border-board-edge bg-card p-4 transition-transform duration-100 group-hover:-translate-y-1 group-hover:border-primary group-active:scale-99 lg:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground capitalize">
            {formatDayFr(post.date)}
            {post.kind === "extra" && ` · bonus ${formatTimeFr(post.startsAt)}`}
          </span>
          <span className={statusChip({ tone: s.tone })}>{s.label}</span>
        </div>
        <h3 className="line-clamp-3 font-display text-xl leading-tight font-extrabold break-words">{post.title}</h3>
        <Podium post={post} members={members} />
        <Meta post={post} />
      </article>
    </Link>
  );
}
