/**
 * Sales rep behind a web order, for the admin order list. An order's scope says who placed it:
 * `dealer:<dealerId>` for a dealer login, `staff:<userId>:<odooPartnerId>` for staff ordering on a
 * dealer's behalf. Both lead to an Odoo customer, whose first "Sale …" tag is the rep commission
 * pays; without a tag the Odoo salesperson is shown instead and flagged as such.
 */
export type OrderSalesRep = { name: string; fromTag: boolean };

type DealerLink = { id: string; odooPartnerId: number | null };
type CustomerRep = { id: number; salesTags: string[]; salesperson: string | null };

/** Odoo partner id an order scope points at, or null (guest, demo profile, unknown dealer). */
export function orderPartnerId(scope: string, partnerByDealer: ReadonlyMap<string, number>): number | null {
  if (scope.startsWith('dealer:')) return partnerByDealer.get(scope.slice('dealer:'.length)) ?? null;
  if (scope.startsWith('staff:')) {
    const id = Number(scope.split(':')[2]);
    return Number.isInteger(id) && id > 0 ? id : null;
  }
  return null;
}

/** Builds `scope → rep` from web dealers and Odoo customers; null when the order has no known rep. */
export function orderSalesRepLookup(dealers: readonly DealerLink[], customers: readonly CustomerRep[]): (scope: string) => OrderSalesRep | null {
  const partnerByDealer = new Map(dealers.flatMap((d) => (d.odooPartnerId ? [[d.id, d.odooPartnerId] as [string, number]] : [])));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  return (scope) => {
    const partnerId = orderPartnerId(scope, partnerByDealer);
    const customer = partnerId ? customerById.get(partnerId) : undefined;
    if (!customer) return null;
    if (customer.salesTags.length) return { name: customer.salesTags[0], fromTag: true };
    return customer.salesperson ? { name: customer.salesperson, fromTag: false } : null;
  };
}
