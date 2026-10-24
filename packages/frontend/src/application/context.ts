import { type DomainContext, todayIn as dayInZone } from '@repo/domain';

export const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function todayIn(zone: string, now = new Date().toISOString()) {
  return dayInZone(zone, now);
}

export function createDomainContext(): DomainContext {
  return {
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  };
}
