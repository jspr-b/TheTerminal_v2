import { createSync } from 'nango';
import * as z from 'zod';
import { API, pages, text } from '../helpers.js';

const InventoryLevel = z.object({
    id: z.string(),
    inventory_item_id: z.string(),
    location_id: z.string(),
    available: z.number().nullable(),
    updated_at: z.string().nullable()
});

const sync = createSync({
    description: 'Shopify stock per item and location. Read-only.',
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/shopify/inventory-levels', group: 'Shopify' }],
    frequency: 'every hour',
    autoStart: true,
    syncType: 'full',
    metadata: z.void(),
    models: { InventoryLevel },
    exec: async (nango) => {
        const res = await nango.get<{ locations: { id: number }[] }>({ endpoint: `${API}/locations.json`, retries: 5 });
        for (const location of res.data.locations) {
            const config = pages('inventory_levels.json', 'inventory_levels', { location_ids: String(location.id) });
            for await (const batch of nango.paginate<any>(config)) {
                await nango.batchSave(
                    batch.map((l) => ({
                        id: `${l.inventory_item_id}:${l.location_id}`,
                        inventory_item_id: String(l.inventory_item_id),
                        location_id: String(l.location_id),
                        available: l.available ?? null,
                        updated_at: text(l.updated_at)
                    })),
                    'InventoryLevel'
                );
            }
        }
    }
});

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;
