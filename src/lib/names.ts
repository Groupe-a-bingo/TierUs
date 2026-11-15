import { z } from "zod";
import { NAME_MAX, NAME_MIN } from "@/lib/limits";

/** The member name rule (sign-up, profile): 2–32 visible characters. */
export const nameSchema = z
  .string()
  .trim()
  .min(NAME_MIN, `Le pseudo doit faire entre ${NAME_MIN} et ${NAME_MAX} caractères`)
  .max(NAME_MAX, `Le pseudo doit faire entre ${NAME_MIN} et ${NAME_MAX} caractères`);
