import "dotenv/config";
import { PgBoss } from "pg-boss";
import { APP_TZ, dayKey } from "@/lib/dates";
import { drawRound } from "@/server/rounds/draw";
import { revealTimedOut } from "@/server/rounds/reveal";
import { pool } from "@/db";

const DRAW = "draw-daily-round";
const REVEAL = "reveal-timed-out";

async function main() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss" });
  boss.on("error", (err) => console.error("[pg-boss]", err));
  await boss.start();

  await boss.createQueue(DRAW);
  await boss.createQueue(REVEAL);

  // 00:00 in the app timezone; also runs at 00:05 as a safety net (idempotent)
  await boss.schedule(DRAW, "0,5 0 * * *", null, { tz: APP_TZ });
  await boss.schedule(REVEAL, "* * * * *", null, { tz: APP_TZ });

  await boss.work(DRAW, async () => {
    const res = await drawRound(dayKey());
    console.log(`[draw] ${dayKey()} →`, res.status);
    if (res.status === "empty_bank") console.warn("[draw] La banque d'idées est vide !");
  });

  await boss.work(REVEAL, async () => {
    const done = await revealTimedOut();
    if (done.length) console.log("[reveal] timeout:", done);
  });

  // Catch up on start (e.g. worker was down at midnight)
  const res = await drawRound(dayKey());
  console.log(`[worker] started (tz=${APP_TZ}); today's round: ${res.status}`);

  const stop = async () => {
    await boss.stop({ graceful: true });
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
