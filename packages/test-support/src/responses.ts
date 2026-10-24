import { z } from 'zod';

export const serverSetup = z.object({ setupRequired: z.boolean() });
export const authentication = z.object({ token: z.string().min(1) });
export const accountIdentity = z.object({ user: z.object({ id: z.string() }) });
