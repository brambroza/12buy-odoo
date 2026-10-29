-- Delivery method of a web order as the Odoo delivery.carrier id, so the SO gets carrier_id.
-- Older orders keep only the carrier name (NULL id); the Odoo push then looks the method up by name.
ALTER TABLE "ShopOrder" ADD COLUMN IF NOT EXISTS "carrierId" INTEGER;

-- Places an order atomically: locks the cart, refuses an empty one (so a double submit cannot create two orders),
-- numbers the order, inserts it and empties the cart in one transaction. Returns the new row.
CREATE OR REPLACE FUNCTION place_shop_order(p_order JSONB) RETURNS "ShopOrder"
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_scope TEXT := p_order->>'scope';
  v_cart "ShopCart";
  v_seq BIGINT;
  v_now TIMESTAMP(3) := (now() AT TIME ZONE 'utc');
  v_row "ShopOrder";
BEGIN
  SELECT * INTO v_cart FROM "ShopCart" WHERE "scope" = v_scope FOR UPDATE;
  IF NOT FOUND OR jsonb_array_length(v_cart."items") = 0 THEN
    RAISE EXCEPTION 'CART_EMPTY' USING ERRCODE = 'P0001';
  END IF;
  v_seq := nextval('"ShopOrder_seq"');
  INSERT INTO "ShopOrder" ("id", "ref", "scope", "dealerName", "status", "paymentMethod", "subtotal", "cashDiscount", "couponDiscount", "total",
                           "lines", "coupon", "odooPricelistId", "address", "carrier", "carrierId", "note", "poRef", "events", "createdAt", "updatedAt")
  VALUES (
    p_order->>'id',
    'WEB-' || to_char(v_now, 'YYYYMMDD') || '-' || lpad(v_seq::TEXT, 3, '0'),
    v_scope,
    p_order->>'dealerName',
    'PENDING',
    p_order->>'paymentMethod',
    (p_order->>'subtotal')::NUMERIC,
    COALESCE((p_order->>'cashDiscount')::NUMERIC, 0),
    COALESCE((p_order->>'couponDiscount')::NUMERIC, 0),
    (p_order->>'total')::NUMERIC,
    p_order->'lines',
    NULLIF(p_order->'coupon', 'null'::jsonb),
    (p_order->>'odooPricelistId')::INTEGER,
    p_order->>'address',
    p_order->>'carrier',
    (p_order->>'carrierId')::INTEGER,
    COALESCE(p_order->>'note', ''),
    NULLIF(p_order->>'poRef', ''),
    jsonb_build_array(jsonb_build_object('status', 'PENDING', 'at', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
    v_now,
    v_now
  ) RETURNING * INTO v_row;
  UPDATE "ShopCart" SET "items" = '[]'::jsonb, "couponCode" = NULL, "updatedAt" = v_now WHERE "scope" = v_scope;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION place_shop_order(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION place_shop_order(JSONB) TO service_role;
