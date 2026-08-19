// src/utils/notify.ts

import { toast } from 'sonner-native';

export const notify = {
  error: (message: string, opts?: { title?: string }) => toast.error(opts?.title ?? 'Error', { description: message }),
  success: (message: string) => toast.success(message),
  info: (message: string) => toast(message),
};
