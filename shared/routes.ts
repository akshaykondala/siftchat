import { z } from 'zod';
import { insertGroupSchema, insertParticipantSchema, insertMessageSchema, groups, participants, messages, plans, tripPlans, tripAlternatives } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  groups: {
    create: {
      method: 'POST' as const,
      path: '/api/groups',
      input: z.object({ name: z.string().min(1) }),
      responses: {
        201: z.custom<typeof groups.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/groups/:slug',
      responses: {
        200: z.custom<typeof groups.$inferSelect & { participants: typeof participants.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
    join: {
      method: 'POST' as const,
      path: '/api/groups/:slug/join',
      input: z.object({ name: z.string().min(1) }),
      responses: {
        201: z.custom<typeof participants.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  messages: {
    list: {
      method: 'GET' as const,
      path: '/api/groups/:groupId/messages',
      responses: {
        // Returns user messages interleaved with Pip messages, sorted by createdAt
        200: z.array(z.object({
          id: z.number(),
          groupId: z.number(),
          participantId: z.number().nullable(),
          content: z.string(),
          createdAt: z.string().nullable(),
          participantName: z.string(),
          isPip: z.boolean(),
        })),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/groups/:groupId/messages',
      input: z.object({ content: z.string().min(1), participantId: z.number() }),
      responses: {
        201: z.custom<typeof messages.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  plans: {
    get: {
      method: 'GET' as const,
      path: '/api/groups/:groupId/plan',
      responses: {
        200: z.custom<typeof plans.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    generate: {
      method: 'POST' as const,
      path: '/api/groups/:groupId/plan/generate',
      responses: {
        200: z.custom<typeof plans.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    }
  },
  tripPlan: {
    get: {
      method: 'GET' as const,
      path: '/api/groups/:groupId/trip',
      responses: {
        200: z.custom<typeof tripPlans.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  tripAlternatives: {
    list: {
      method: 'GET' as const,
      path: '/api/groups/:groupId/trip/alternatives',
      responses: {
        200: z.array(z.custom<typeof tripAlternatives.$inferSelect>()),
      },
    },
    vote: {
      method: 'POST' as const,
      path: '/api/groups/:groupId/trip/alternatives/:alternativeId/vote',
      input: z.object({ participantId: z.number() }),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  tripAttendance: {
    update: {
      method: 'POST' as const,
      path: '/api/groups/:groupId/trip/attendance',
      input: z.object({
        participantId: z.number(),
        alternativeId: z.number().nullable(),
        commitmentLevel: z.enum(['interested', 'likely', 'committed', 'unavailable']),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
        403: errorSchemas.validation,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
