import "server-only";
import { db } from "@/lib/firebase/admin";

// One place for collection paths so no feature hand-builds them.
export const col = {
  clients: () => db().collection("clients"),
  prospects: () => db().collection("prospects"),
  projects: () => db().collection("projects"),
  activity: () => db().collection("activity"),
  loginTokens: () => db().collection("loginTokens"),
  settings: () => db().collection("settings").doc("app"),
  milestones: (projectId: string) => db().collection("projects").doc(projectId).collection("milestones"),
  schedule: (projectId: string) => db().collection("projects").doc(projectId).collection("schedule"),
  payments: (projectId: string) => db().collection("projects").doc(projectId).collection("payments"),
  agreements: (projectId: string) => db().collection("projects").doc(projectId).collection("agreements"),
  revisions: (projectId: string) => db().collection("projects").doc(projectId).collection("revisions"),
};
