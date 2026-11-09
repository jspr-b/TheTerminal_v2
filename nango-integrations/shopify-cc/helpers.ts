export const API = '/admin/api/2026-10';
export const PAGE_SIZE = 250;

/** Shopify's REST paging: follow the rel="next" link until there is none. */
export function pages(endpoint: string, key: string, params: Record<string, string> = {}) {
    return {
        endpoint: `${API}/${endpoint}`,
        params,
        retries: 5,
        paginate: {
            type: 'link' as const,
            link_rel_in_response_header: 'next',
            limit_name_in_request: 'limit',
            limit: PAGE_SIZE,
            response_path: key
        }
    };
}

export const text = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
