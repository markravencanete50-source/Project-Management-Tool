import "server-only";
import { Timestamp, type DocumentSnapshot, type QuerySnapshot } from "firebase-admin/firestore";
import { DEFAULT_DAYS_PER_MONTH, DEFAULT_HOURS_PER_DAY, normalizeProspectEngagement } from "@/lib/engagement";
import { normalizeStage, type Project, type Prospect } from "@/lib/types";

function plain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

/** Snapshot to a typed plain object with id, Timestamps converted to Date. */
export function fromDoc<T extends { id: string }>(snap: DocumentSnapshot): T {
  return { ...(plain(snap.data() ?? {}) as object), id: snap.id } as T;
}

export function fromDocs<T extends { id: string }>(snap: QuerySnapshot): T[] {
  return snap.docs.map((d) => fromDoc<T>(d));
}

/**
 * A project document with the engagement fields normalised. Documents written
 * before engagement kinds existed have no kind, rate or rateUnit: they are
 * fixed-price projects, exactly as they always were.
 */
export function projectFromDoc(snap: DocumentSnapshot): Project {
  const doc = fromDoc<Project>(snap);
  return { ...doc, kind: doc.kind ?? "fixed", rate: doc.rate ?? 0, rateUnit: doc.rateUnit ?? null, hoursPerDay: doc.hoursPerDay ?? DEFAULT_HOURS_PER_DAY, daysPerMonth: doc.daysPerMonth ?? DEFAULT_DAYS_PER_MONTH, endDate: doc.endDate ?? null, endDateAuto: doc.endDateAuto ?? false, contractValue: doc.contractValue ?? 0 };
}

export function projectsFromDocs(snap: QuerySnapshot): Project[] {
  return snap.docs.map((d) => projectFromDoc(d));
}

/** A prospect document with the engagement fields normalised (missing kind means fixed). */
export function prospectFromDoc(snap: DocumentSnapshot): Prospect {
  const doc = fromDoc<Prospect>(snap);
  return { ...doc, stage: normalizeStage(doc.stage), ...normalizeProspectEngagement(doc) };
}

export function prospectsFromDocs(snap: QuerySnapshot): Prospect[] {
  return snap.docs.map((d) => prospectFromDoc(d));
}
