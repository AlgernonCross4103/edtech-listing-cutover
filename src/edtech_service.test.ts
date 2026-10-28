import assert from "node:assert/strict";
import { keepBeforeDeadline } from "./edtech_service.ts";

const kept = keepBeforeDeadline([
  { title: "Past cohort", url: "https://school.test/past", deadline: "2024-12-31" },
  { title: "Next cohort", url: "https://school.test/next", deadline: "2026-02-01" },
  { title: "Self paced", url: "https://school.test/self", deadline: null }
], "2025-01-01");

assert.deepEqual(kept.map((listing) => listing.title), ["Next cohort", "Self paced"]);
console.log("deadline decision: passed");
