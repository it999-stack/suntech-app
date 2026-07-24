// Dev-only: opens a live Drizzle Studio connection to the local SQLite db.
// Rendered only when __DEV__ (see App.tsx) so this hook is never called in
// production/preview builds — useDrizzleStudio is known to break those.
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';
import { db } from '@db/client';

export function DrizzleStudioDevTools() {
  useDrizzleStudio(db.$client);
  return null;
}
