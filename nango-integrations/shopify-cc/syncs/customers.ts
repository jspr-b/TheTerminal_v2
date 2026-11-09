import { createSync } from 'nango';
import * as z from 'zod';
import { pages, text } from '../helpers.js';

// City level only. Names, emails, phone numbers and street addresses are never copied.
const Customer = z.object({
    id: z.string(),
    default_address: z.object({
        city: z.string().nullable(),
        province: z.string().nullable(),
        country: z.string().nullable()
    }),
    orders_count: z.number().nullable(),
    total_spent: z.string().nullable(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable()
});

const sync = createSync({
    description: 'Shopify customers at city level, with no personal details. Read-only.',
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/shopify/customers', group: 'Shopify' }],
    frequency: 'every hour',
    autoStart: true,
    syncType: 'full',
    metadata: z.void(),
    models: { Customer },
    exec: async (nango) => {
        for await (const batch of nango.paginate<any>(pages('customers.json', 'customers'))) {
            await nango.batchSave(
                batch.map((c) => ({
                    id: String(c.id),
                    default_address: {
                        city: text(c.default_address?.city),
                        province: text(c.default_address?.province),
                        country: text(c.default_address?.country)
                    },
                    orders_count: c.orders_count ?? null,
                    total_spent: text(c.total_spent),
                    created_at: text(c.created_at),
                    updated_at: text(c.updated_at)
                })),
                'Customer'
            );
        }
    }
});

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;
