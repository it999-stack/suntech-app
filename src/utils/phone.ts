// src/utils/phone.ts
// Shared tel: dialing helper — strips everything except digits and a
// leading '+' before handing off to the OS dialer.

import { Linking } from 'react-native';

export function callPhone(phone: string | null | undefined): void {
  if (!phone) return;
  const sanitized = phone.replace(/(?!^\+)[^\d]/g, '');
  if (sanitized) Linking.openURL(`tel:${sanitized}`);
}
