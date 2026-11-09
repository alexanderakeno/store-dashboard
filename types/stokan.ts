/** Stokan Aksesoris: a stock count session of the accessories in the SOH. */
export type StokanMode = "rolling" | "full";
export type StokanStatus = "count" | "recount" | "closed" | "cancelled";
export type StokanPhase = "count" | "recount";

export interface StokanStaff {
  nik: string;
  name: string;
}

export interface StokanSession {
  /** "2026-11-10T09:12:00.000Z" based id, also the sort key. */
  id: string;
  label: string;
  mode: StokanMode;
  status: StokanStatus;
  startedAt: string;
  startedBy: string;
  /** SOH date used as the expected stock. */
  sohDate: string | null;
  sohUpdatedAt: string;
  staff: StokanStaff[];
  recountAt?: string;
  closedAt?: string;
  /** Totals written on close (history list). */
  summary?: { items: number; matched: number; diff: number; diffValue: number; units: number; counted: number };
}

/** Why an article is in a rolling count. */
export type StokanReason = "value" | "sold" | "diff" | "random" | "full";

export interface StokanItem {
  article: string;
  description: string;
  brand: string;
  category: string;
  /** SOH qty when the session started (hidden from the counting staff). */
  expected: number;
  /** Selling price (accessories list, else SOH price) — for the value of a difference. */
  price: number;
  /** NIK of the staff who counts it / who recounts it. */
  assignee: string;
  recount?: string;
  barcodes?: string[];
  reason: StokanReason;
  /** Final count, written on close. */
  final?: number;
}

/**
 * One counting action, appended (never edited) so several phones can count at once.
 * add = +value · set = value (typed qty / correction) · done = the staff finished its part · extra = a code that is not in the session.
 */
export interface StokanEvent {
  /** Client-generated id: a retried upload is not counted twice. */
  id: string;
  ts: string;
  nik: string;
  name: string;
  article: string;
  code?: string;
  kind: "add" | "set" | "done" | "extra";
  value: number;
  phase: StokanPhase;
}
