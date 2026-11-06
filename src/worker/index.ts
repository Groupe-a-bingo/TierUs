import "dotenv/config";
import { PgBoss } from "pg-boss";
import { APP_TZ, DAILY_DRAW_HOUR, dueDailyKey, localHour } from "@/lib/dates";
import { drawDaily } from "@/server/rounds/draw";
import { pool } from "@/db";

const DRAW = "draw-daily-round";
/** Queue of a removed job, still scheduled on deployed databases: dropped on start. */
const LEGACY_REVEAL = "reveal-timed-out";

async function main() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss" });
  boss.on("error", (err) => console.error("[pg-boss]", err));
  await boss.start();

  await boss.createQueue(DRAW);
  await boss.unschedule(LEGACY_REVEAL).catch(() => {});

  // 08:00 Europe/Paris (wall clock, DST handled by the cron timezone), then a
  // catch-up tick every 15 minutes. drawDaily is idempotent: at most one daily per day.
  await boss.schedule(DRAW, "*/15 * * * *", null, { tz: APP_TZ });

  await boss.work(DRAW, async () => {
    const now = new Date();
    const res = await drawDaily(now);
    if (res.status === "created") console.log(`[draw] ${dueDailyKey(now)} → created`);
    // warn once per morning, not on every catch-up tick
    if (res.status === "empty_bank" && localHour(now) === DAILY_DRAW_HOUR && now.getMinutes() < 15) {
      console.warn("[draw] La banque d'idées est vide ! La prochaine idée proposée lancera le tirage.");
    }
  });

  // Catch up on start (e.g. the worker was down at 08:00)
  const res = await drawDaily();
  console.log(`[worker] started (tz=${APP_TZ}); daily ${dueDailyKey() ?? "(before 08:00)"}: ${res.status}`);

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
