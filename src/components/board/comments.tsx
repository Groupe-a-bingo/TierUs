"use client";

import { useEffect, useLayoutEffect, useOptimistic, useRef, useState } from "react";
import { CornerDownRight, Reply, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarTile } from "@/components/tier-board/avatar-tile";
import { addComment, deleteComment } from "@/app/actions/social";
import { ReactionChips, ReactionPicker, useReactions } from "./reaction-bar";
import type { CommentView, Member } from "@/lib/types";
import { APP_TZ } from "@/lib/dates";
import { COMMENT_MAX } from "@/lib/limits";
import { useServerAction } from "@/hooks/use-server-action";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/board/empty-state";
import { useChatGestures } from "./chat-gestures";
import { MessageSheet } from "./message-sheet";

const LIKE = "❤️" as const;


// fixed app timezone so the server render and the browser always agree
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: APP_TZ });
const hourFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: APP_TZ });

/** "5 nov 22:58" — no abbreviation dot, no comma */
const time = (iso: string) => {
  const d = new Date(iso);
  return `${dateFmt.format(d).replace(".", "")} ${hourFmt.format(d)}`;
};

const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** Messages rendered at first, and added by each "older messages" click. */
const PAGE = 50;
/** `b` continues `a`'s group: same author, within 5 min, not a reply. */
const continues = (a: CommentView, b: CommentView) =>
  a.author.id === b.author.id && !b.replyTo && new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() < GROUP_WINDOW_MS;

const messageRow = cva("group flex gap-3", {
  variants: { grouped: { true: "mt-1", false: "mt-4 first:mt-0" } },
});

const bubble = cva("w-fit max-w-full min-w-0 rounded-2xl bg-secondary px-3 py-2 text-base break-words whitespace-pre-wrap", {
  variants: { grouped: { true: "rounded-l-md", false: "rounded-tl-sm" } },
});


// mouse: quick icons on hover, floating over the message's top-right corner (they take no room
// from the bubble, which only had ~50px left in the side panel) · touch screens use gestures instead (see useChatGestures)
const actions =
  "hidden items-center gap-0.5 can-hover:pointer-events-none can-hover:absolute can-hover:-top-9 can-hover:right-0 can-hover:z-10 can-hover:flex can-hover:rounded-xl can-hover:border-2 can-hover:border-board-edge can-hover:bg-card can-hover:p-0.5 can-hover:opacity-0 can-hover:shadow-pop-sm can-hover:group-hover:pointer-events-auto can-hover:group-hover:opacity-100 can-hover:focus-within:pointer-events-auto can-hover:focus-within:opacity-100";
const iconBtn = "flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-90";

function Message({ c, roundId, grouped, onReply, onDelete }: { c: CommentView; roundId: string; grouped: boolean; onReply: () => void; onDelete: () => void }) {
  const r = useReactions(roundId, c.id, c.reactions);
  const live = !c.deleted && !c.pending;
  const [sheet, setSheet] = useState(false);
  const [burst, setBurst] = useState(0);

  // phone gestures: swipe right → reply · double tap → ❤️ · long press → menu
  const like = () => {
    if (!r.list.some((x) => x.emoji === LIKE && x.mine)) r.toggle(LIKE);
    setBurst((n) => n + 1);
  };
  const g = useChatGestures({ enabled: live, onReply, onDoubleTap: like, onLongPress: () => setSheet(true) });

  return (
    // data-gesture: on touch screens the whole message is a gesture surface (no text selection,
    // "Copier le texte" lives in the long-press menu); a mouse can still select text
    <li data-gesture className={cn(messageRow({ grouped }), c.pending && "animate-rise opacity-60")}>
      {grouped ? <span className="w-8 shrink-0" aria-hidden /> : <AvatarTile name={c.author.name} fileId={c.author.avatarFileId} size="sm" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {c.replyTo && (
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <CornerDownRight className="size-3 shrink-0" />
            <span className="font-semibold">{c.replyTo.author}</span>
            <span className="truncate">{c.replyTo.body}</span>
          </p>
        )}
        {!grouped && (
          <p className="text-sm">
            <span className="font-display font-bold">{c.author.name}</span>{" "}
            <span className="text-xs text-muted-foreground">{time(c.createdAt)}</span>
          </p>
        )}
        <div ref={g.target} className="relative flex min-w-0 touch-pan-y items-center gap-1 select-none no-callout can-hover:select-auto">
          {/* reply arrow revealed behind the bubble while swiping */}
          <span ref={g.hint} className="pointer-events-none absolute left-0 flex size-8 items-center justify-center text-primary opacity-0" aria-hidden>
            <Reply className="size-5" />
          </span>
          <div ref={g.slide} className="relative flex min-w-0 items-center gap-1">
            {/* Plain text only: React escapes it, no HTML/markdown rendering */}
            <p className={bubble({ grouped })} title={grouped ? time(c.createdAt) : undefined}>
              {c.deleted ? <em className="text-muted-foreground">Message supprimé</em> : c.body}
            </p>
            {burst > 0 && (
              <span key={burst} className="pointer-events-none absolute -top-2 left-2 animate-pop-in text-2xl" aria-hidden>
                ❤️
              </span>
            )}
          </div>
          {live && (
            <div className={actions}>
              <ReactionPicker available={r.available} toggle={r.toggle} size="icon" placement="auto" align="end" />
              <button type="button" aria-label="Répondre" title="Répondre" className={iconBtn} onClick={onReply}>
                <Reply className="size-4" />
              </button>
              {c.canDelete && (
                <button type="button" aria-label="Supprimer" title="Supprimer" className={iconBtn} onClick={onDelete}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          )}
        </div>
        {live && <ReactionChips list={r.list} toggle={r.toggle} />}
      </div>
      {live && (
        <MessageSheet
          open={sheet}
          onClose={() => setSheet(false)}
          body={c.body}
          reactions={r.list}
          onReact={r.toggle}
          onReply={onReply}
          onDelete={c.canDelete ? onDelete : undefined}
        />
      )}
    </li>
  );
}

type Op = { kind: "add"; comment: CommentView } | { kind: "delete"; id: string };

export function Comments({
  roundId,
  comments,
  me,
}: {
  roundId: string;
  comments: CommentView[];
  me: Member;
}) {
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const { run } = useServerAction();
  const input = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [list, apply] = useOptimistic(comments, (state, op: Op) =>
    op.kind === "add" ? [...state, op.comment] : state.map((c) => (c.id === op.id ? { ...c, deleted: true, body: "" } : c)),
  );

  // long threads: only the latest messages are rendered, older ones on demand
  const [shown, setShown] = useState(PAGE);
  const start = Math.max(0, list.length - shown);
  const fromBottom = useRef<number | null>(null);
  const showOlder = () => {
    const el = scroller.current;
    // desktop scroll box: keep the messages on screen where they are once older ones are added above
    if (el && el.scrollHeight > el.clientHeight) fromBottom.current = el.scrollHeight - el.scrollTop;
    setShown((n) => n + PAGE);
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && fromBottom.current !== null) el.scrollTop = el.scrollHeight - fromBottom.current;
    fromBottom.current = null;
  }, [shown]);

  // keep the chat pinned to the latest message (desktop scroll box)
  const count = list.length;
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
  }, [count]);

  const send = () => {
    const text = body.trim();
    if (!text) return;
    const reply = replyTo;
    setBody("");
    setReplyTo(null);
    run(
      () => {
        // shows up instantly; the action's revalidation swaps in the real one
        apply({
        kind: "add",
        comment: {
          id: `tmp-${Date.now()}`,
          body: text,
          createdAt: new Date().toISOString(),
          deleted: false,
          replyTo: reply ? { id: reply.id, author: reply.author.name, body: reply.body.slice(0, 80) } : null,
          author: me,
          reactions: [],
          canDelete: false,
          pending: true,
        },
      });
        return addComment({ roundId, body: text, replyToId: reply?.id });
      },
      {
        // not sent: give the text (and the reply) back
        onError: () => {
          setBody(text);
          setReplyTo(reply);
        },
      },
    );
  };

  const remove = (id: string) =>
    run(
      () => {
        apply({ kind: "delete", id });
        return deleteComment(id);
      },
      { confirm: "Supprimer ce message ? Impossible de revenir en arrière." },
    );

  return (
    <section className="flex flex-col gap-4 xl:min-h-0 xl:flex-1">
      <h2 className="text-2xl font-extrabold">
        Discussion <span className="text-muted-foreground">{list.filter((c) => !c.deleted).length}</span>
      </h2>

      {list.length === 0 && <EmptyState>Lance le débat 👇</EmptyState>}

      {/* desktop: the chat scrolls inside the panel, composer stays at the bottom */}
      <div ref={scroller} data-scroll-box className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:scrollbar-theme xl:scrollbar-track-visible xl:pr-2">
      {start > 0 && (
        <button type="button" onClick={showOlder} className="mx-auto mb-4 flex rounded-full border-2 border-board-edge px-4 py-1.5 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-foreground active:scale-95">
          Messages précédents ({start})
        </button>
      )}
      <ul className="flex flex-col">
        {list.slice(start).map((c, j) => {
          const i = start + j;
          const prev = list[i - 1];
          return (
            <Message
              key={c.id}
              c={c}
              roundId={roundId}
              // consecutive messages from the same person stick together (no header)
              grouped={!!prev && continues(prev, c)}
              onReply={() => {
                setReplyTo(c);
                input.current?.focus();
              }}
              onDelete={() => remove(c.id)}
            />
          );
        })}
      </ul>

      </div>

      <form
        className="sticky bottom-24 flex flex-col gap-2 rounded-2xl border-2 border-ink bg-card p-2 shadow-pop lg:bottom-0"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {replyTo && (
          <div className="flex items-center justify-between gap-2 px-2 text-xs text-muted-foreground">
            <span className="truncate">
              ↪ {replyTo.author.name} : {replyTo.body}
            </span>
            <button type="button" aria-label="Annuler la réponse" onClick={() => setReplyTo(null)}>
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends with a keyboard; on touch screens it's a new line (the button sends),
              // and never while an IME is composing (Japanese, Chinese, autocorrect)
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(any-pointer: fine)").matches) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={COMMENT_MAX}
            aria-label="Ton message"
            rows={1}
            placeholder="Ton avis…"
            className="field-sizing-content max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" disabled={!body.trim()} aria-label="Envoyer">
            <Send />
          </Button>
        </div>
      </form>
    </section>
  );
}
