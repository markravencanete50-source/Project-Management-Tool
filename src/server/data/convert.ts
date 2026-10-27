import "server-only";
import { Timestamp, type DocumentSnapshot, type QuerySnapshot } from "firebase-admin/firestore";

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
