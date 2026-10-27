import type { Bindings } from '../auth.server'
import type { Actor } from './model'
import { fail } from './model'
import { boundedJson } from '@runeditrun/rer/modules/portability/http'
import { applyCatalogMaintenance, catalogMaintenanceExport, previewCatalogMaintenance, readCatalogMaintenance } from './catalog-maintenance'
import { applyBulkImages, previewBulkImages, readBulkImages } from './bulk-images'
import { requireCatalogOwner } from './catalog-maintenance-model'

/** Mount after the central current-actor, restore, staff and company gates. Errors use the central Problem handler. */
export async function catalogMaintenanceResponse(request: Request, env: Bindings, actor: Actor): Promise<Response | null> {
 const url = new URL(request.url), path = '/api/barrow/catalog-maintenance'
 if (url.pathname !== path && !url.pathname.startsWith(path + '/')) return null
 requireCatalogOwner(actor)
 const json = (value: unknown) => Response.json(value, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
 if (request.method === 'GET' && url.pathname === path) return json(await readCatalogMaintenance(env, actor))
 if (request.method === 'GET' && url.pathname === path + '/images') return json(await readBulkImages(env.DB, actor))
 if (request.method === 'POST' && [path + '/images/preview', path + '/images/apply'].includes(url.pathname)) {
  if (request.headers.get('origin') !== env.AUTH_ORIGIN) fail('ORIGIN', 'Use this installation’s own origin.', 403)
  const input = await boundedJson(request, 45000000)
  return json(url.pathname.endsWith('/preview') ? await previewBulkImages(env.DB, actor, input) : await applyBulkImages(env.DB, actor, input))
 }
 const download = /^\/api\/barrow\/catalog-maintenance\/export\.(json|csv|xlsx)$/.exec(url.pathname)
 if (request.method === 'GET' && download) return catalogMaintenanceExport(env, actor, download[1] as 'json' | 'csv' | 'xlsx')
 if (request.method === 'POST' && [path + '/preview', path + '/apply'].includes(url.pathname)) {
  if (request.headers.get('origin') !== env.AUTH_ORIGIN) fail('ORIGIN', 'Use this installation’s own origin.', 403)
  const input = await boundedJson(request, 1450000) as any
  return json(url.pathname.endsWith('/preview') ? await previewCatalogMaintenance(env, actor, input) : await applyCatalogMaintenance(env, actor, input))
 }
 fail('NOT_FOUND', 'Unknown catalog maintenance endpoint.', 404)
}
