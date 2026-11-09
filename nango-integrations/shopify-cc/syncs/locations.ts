import { createSync } from 'nango';
import * as z from 'zod';
import { pages, text } from '../helpers.js';

const Location = z.object({
    id: z.string(),
    name: z.string(),
    city: z.string().nullable(),
    province: z.string().nullable(),
    country: z.string().nullable(),
    active: z.boolean(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable()
});

const sync = createSync({
    description: 'Shopify locations. Read-only.',
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/shopify/locations', group: 'Shopify' }],
    frequency: 'every hour',
    autoStart: true,
    syncType: 'full',
    metadata: z.void(),
    models: { Location },
    exec: async (nango) => {
        for await (const batch of nango.paginate<any>(pages('locations.json', 'locations'))) {
            await nango.batchSave(
                batch.map((l) => ({
                    id: String(l.id),
                    name: l.name,
                    city: text(l.city),
                    province: text(l.province),
                    country: text(l.country_name ?? l.country),
                    active: Boolean(l.active),
                    created_at: text(l.created_at),
                    updated_at: text(l.updated_at)
                })),
                'Location'
            );
        }
    }
});

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;
