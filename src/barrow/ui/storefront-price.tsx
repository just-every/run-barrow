import { priceLabels, type PriceDisplay } from '../price-display'
import type { CatalogueItem } from './types'

export function StorefrontPrice({item,currency,display}:{item:CatalogueItem;currency:string;display:PriceDisplay}) {
 return <span className="br-variant-price" data-storefront-price={item.sku}>{priceLabels(item,currency,display).split(' | ').map(label=><span style={{display:'block'}} key={label}>{label}</span>)}</span>
}
