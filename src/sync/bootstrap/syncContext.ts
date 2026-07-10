// src/sync/bootstrap/syncContext.ts
// Dependency carrier passed into every sync step.
// Steps depend on this abstraction — not on globals or concrete stores.

export type SyncContext = {
  /** The site the logged-in user is assigned to. */
  siteId: string;
};
