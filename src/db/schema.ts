import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  date,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["member", "moderator", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["pending", "active", "rejected"]);
export const tierEnum = pgEnum("tier", ["S", "A", "B", "C", "D", "F"]);
/** daily = the automatic 08:00 draw (one per day) · extra = created by a moderator */
export const roundKindEnum = pgEnum("round_kind", ["daily", "extra"]);
/** pending = waiting for a moderator (idea validation on) · approved = in the bank · rejected = refused, back to its author */
export const ideaStatusEnum = pgEnum("idea_status", ["pending", "approved", "rejected"]);

/* ---------- Better Auth core tables (+ app fields on user) ---------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  role: roleEnum("role").notNull().default("member"),
  status: userStatusEnum("status").notNull().default("pending"),
  avatarFileId: text("avatar_file_id").references((): AnyPgColumn => files.id, { onDelete: "set null" }),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Better Auth's own rate-limit store (auth endpoints). */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/** App rate-limit store, used by rate-limiter-flexible (RateLimiterPostgres). */
export const appRateLimits = pgTable("app_rate_limits", {
  key: text("key").primaryKey(),
  points: integer("points").notNull().default(0),
  expire: bigint("expire", { mode: "number" }),
});

/* ---------- App tables ---------- */

export const files = pgTable("files", {
  id: id(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  mime: text("mime").notNull(),
  createdAt: createdAt(),
});

export const ideas = pgTable(
  "ideas",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    /** only approved ideas can be drawn */
    status: ideaStatusEnum("status").notNull().default("approved"),
    createdAt: createdAt(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    index("ideas_author_idx").on(t.authorId),
    index("ideas_available_idx").on(t.status, t.usedAt),
    check("ideas_title_len", sql`char_length(${t.title}) between 3 and 120`),
  ],
);

export const rounds = pgTable(
  "rounds",
  {
    id: id(),
    ideaId: text("idea_id")
      .notNull()
      .references(() => ideas.id),
    kind: roundKindEnum("kind").notNull().default("daily"),
    /** Paris day the tier list belongs to (daily: the day of its 08:00 slot) */
    date: date("date").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    /** starts_at + TTL. Active while starts_at <= now < expires_at, archived after. Never closes voting. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // one automatic draw per day; extra tier lists are unlimited
    uniqueIndex("rounds_daily_date_uq").on(t.date).where(sql`${t.kind} = 'daily'`),
    // "which tier lists are still active" without scanning the table
    index("rounds_expires_idx").on(t.expiresAt),
    check("rounds_ttl_positive", sql`${t.expiresAt} > ${t.startsAt}`),
  ],
);

export const roundTargets = pgTable(
  "round_targets",
  {
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.userId] })],
);

export const submissions = pgTable(
  "submissions",
  {
    id: id(),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    voterId: text("voter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** first answer only (completing it for a newcomer keeps this date) */
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    /** answered after the tier list was archived (doesn't count for the personal counter) */
    isLate: boolean("is_late").notNull().default(false),
  },
  (t) => [
    uniqueIndex("submissions_round_voter_uq").on(t.roundId, t.voterId),
    // personal counter: every answer of one member
    index("submissions_voter_idx").on(t.voterId),
  ],
);

export const placements = pgTable(
  "placements",
  {
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tier: tierEnum("tier").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.submissionId, t.targetId] })],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    replyToId: text("reply_to_id").references((): AnyPgColumn => comments.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("comments_round_idx").on(t.roundId, t.createdAt),
    check("comments_body_len", sql`char_length(${t.body}) between 1 and 1000`),
  ],
);

export const reactions = pgTable(
  "reactions",
  {
    id: id(),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    commentId: text("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reactions_uq").on(t.roundId, sql`coalesce(${t.commentId}, '')`, t.userId, t.emoji),
    index("reactions_comment_idx").on(t.commentId),
  ],
);

/** Global app settings, one row per key (e.g. idea_validation → true). A missing key means its default. */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    meta: jsonb("meta"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export const TIERS = tierEnum.enumValues;
export type Tier = (typeof TIERS)[number];
export type IdeaStatus = (typeof ideaStatusEnum.enumValues)[number];
