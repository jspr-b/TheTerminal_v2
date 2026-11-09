import { createSync } from 'nango';
import * as z from 'zod';
import { pages, text } from '../helpers.js';

const Line = z.object({
    id: z.string(),
    product_id: z.string().nullable(),
    variant_id: z.string().nullable(),
    quantity: z.number(),
    price: z.string().nullable(),
    total_discount: z.string().nullable()
});

const Fulfillment = z.object({
    id: z.string(),
    status: z.string().nullable(),
    shipment_status: z.string().nullable(),
    tracking_company: z.string().nullable(),
    location_id: z.string().nullable(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable()
});

// City level only. The customer is an id; no names, emails, phone numbers or street addresses are copied.
const Order = z.object({
    id: z.string(),
    processed_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string().nullable(),
    cancelled_at: z.string().nullable(),
    financial_status: z.string().nullable(),
    fulfillment_status: z.string().nullable(),
    total_price: z.string().nullable(),
    total_discounts: z.string().nullable(),
    currency: z.string().nullable(),
    source_name: z.string().nullable(),
    customer: z.object({ id: z.string().nullable() }),
    shipping_address: z.object({
        city: z.string().nullable(),
        province: z.string().nullable(),
        country: z.string().nullable()
    }),
    line_items: z.array(Line),
    fulfillments: z.array(Fulfillment)
});

const sync = createSync({
    description: 'Shopify orders at city level, with no personal details. Read-only.',
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/shopify/orders', group: 'Shopify' }],
    frequency: 'every hour',
    autoStart: true,
    syncType: 'full',
    metadata: z.void(),
    models: { Order },
    exec: async (nango) => {
        for await (const batch of nango.paginate<any>(pages('orders.json', 'orders', { status: 'any' }))) {
            await nango.batchSave(
                batch.map((o) => ({
                    id: String(o.id),
                    processed_at: text(o.processed_at),
                    created_at: o.created_at,
                    updated_at: text(o.updated_at),
                    cancelled_at: text(o.cancelled_at),
                    financial_status: text(o.financial_status),
                    fulfillment_status: text(o.fulfillment_status),
                    total_price: text(o.total_price),
                    total_discounts: text(o.total_discounts),
                    currency: text(o.currency),
                    source_name: text(o.source_name),
                    customer: { id: text(o.customer?.id) },
                    shipping_address: {
                        city: text(o.shipping_address?.city),
                        province: text(o.shipping_address?.province),
                        country: text(o.shipping_address?.country)
                    },
                    line_items: (o.line_items ?? []).map((li: any) => ({
                        id: String(li.id),
                        product_id: text(li.product_id),
                        variant_id: text(li.variant_id),
                        quantity: li.quantity,
                        price: text(li.price),
                        total_discount: text(li.total_discount)
                    })),
                    fulfillments: (o.fulfillments ?? []).map((f: any) => ({
                        id: String(f.id),
                        status: text(f.status),
                        shipment_status: text(f.shipment_status),
                        tracking_company: text(f.tracking_company),
                        location_id: text(f.location_id),
                        created_at: text(f.created_at),
                        updated_at: text(f.updated_at)
                    }))
                })),
                'Order'
            );
        }
    }
});

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;
