import { createSync } from 'nango';
import * as z from 'zod';
import { pages, text } from '../helpers.js';

const Variant = z.object({
    id: z.string(),
    title: z.string().nullable(),
    sku: z.string().nullable(),
    barcode: z.string().nullable(),
    price: z.string().nullable(),
    compare_at_price: z.string().nullable(),
    inventory_item_id: z.string().nullable(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable()
});

const Product = z.object({
    id: z.string(),
    title: z.string(),
    status: z.string().nullable(),
    product_type: z.string().nullable(),
    vendor: z.string().nullable(),
    tags: z.string().nullable(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
    variants: z.array(Variant)
});

const sync = createSync({
    description: 'Shopify products with their variants. Read-only.',
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/shopify/products', group: 'Shopify' }],
    frequency: 'every hour',
    autoStart: true,
    syncType: 'full',
    metadata: z.void(),
    models: { Product },
    exec: async (nango) => {
        for await (const batch of nango.paginate<any>(pages('products.json', 'products'))) {
            await nango.batchSave(
                batch.map((p) => ({
                    id: String(p.id),
                    title: p.title,
                    status: text(p.status),
                    product_type: text(p.product_type),
                    vendor: text(p.vendor),
                    tags: text(p.tags),
                    created_at: text(p.created_at),
                    updated_at: text(p.updated_at),
                    variants: (p.variants ?? []).map((v: any) => ({
                        id: String(v.id),
                        title: text(v.title),
                        sku: text(v.sku),
                        barcode: text(v.barcode),
                        price: text(v.price),
                        compare_at_price: text(v.compare_at_price),
                        inventory_item_id: text(v.inventory_item_id),
                        created_at: text(v.created_at),
                        updated_at: text(v.updated_at)
                    }))
                })),
                'Product'
            );
        }
    }
});

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;
