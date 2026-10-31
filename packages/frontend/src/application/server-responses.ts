import { z } from 'zod';

export const serverResponse = z.object({
  product: z.literal('Rillday'),
  protocol: z.literal(1),
  serverId: z.uuid(),
  setupRequired: z.boolean(),
  registration: z.literal('administrator'),
  maxAccounts: z.int().positive(),
});

const accountUser = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(['user', 'admin']),
});

export const accountResponse = z.object({ user: accountUser });
export const usersResponse = z.object({
  users: z.array(
    accountUser.extend({
      banned: z
        .union([z.boolean(), z.literal(0), z.literal(1)])
        .nullable()
        .transform((value) => (value === null ? null : Boolean(value))),
    }),
  ),
});
export const loginResponse = z.object({ token: z.string() });
export const passwordResponse = z.object({ token: z.string().nullable().optional() });
export const sessionResponse = z
  .object({
    user: z.object({ id: z.string() }),
    session: z.object({ token: z.string() }),
  })
  .nullable();

export const connectionResponse = z.object({ documentId: z.string().nullable() });
