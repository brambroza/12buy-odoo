export type OdooPartnerSearchResult = {
  id: number;
  name: string;
  ref: string | false;
  vat: string | false;
  phone: string | false;
  email: string | false;
  street: string | false;
};

export type OdooProductSearchResult = {
  id: number;
  name: string;
  default_code: string | false;
  list_price: number;
  barcode: string | false;
  qty_available: number;
};

export type OdooSaleOrderSearchResult = {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  state: string;
  amount_total: number;
  date_order: string | false;
  client_order_ref: string | false;
};
