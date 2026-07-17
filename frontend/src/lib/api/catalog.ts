/**
 * Catalog API client — WIRED to the FastAPI backend (`/catalog-items`).
 *
 * Responses are deep-mapped snake→camel by the `http` wrapper, so the domain
 * `CatalogItem` shape is returned directly. Query params are sent verbatim, so
 * keys are snake_case to match the backend contract.
 */

import { http } from "./http";
import type {
  CatalogItem,
  CatalogItemInput,
  CatalogListParams,
  Page,
} from "./catalog-types";

export const catalogApi = {
  async list(params: CatalogListParams = {}): Promise<Page<CatalogItem>> {
    return http.get<Page<CatalogItem>>("/catalog-items", {
      query: {
        q: params.q,
        category: params.category,
        billing_type: params.billingType,
        include_archived: params.includeArchived,
        sort: params.sort,
        page: params.page,
        page_size: params.pageSize,
      },
    });
  },

  async get(id: string): Promise<CatalogItem> {
    return http.get<CatalogItem>(`/catalog-items/${id}`);
  },

  async create(input: CatalogItemInput): Promise<CatalogItem> {
    return http.post<CatalogItem>("/catalog-items", input);
  },

  async update(id: string, input: Partial<CatalogItemInput>): Promise<CatalogItem> {
    return http.patch<CatalogItem>(`/catalog-items/${id}`, input);
  },

  async archive(id: string): Promise<CatalogItem> {
    return http.post<CatalogItem>(`/catalog-items/${id}/archive`, {});
  },

  async restore(id: string): Promise<CatalogItem> {
    return http.post<CatalogItem>(`/catalog-items/${id}/restore`, {});
  },
};
