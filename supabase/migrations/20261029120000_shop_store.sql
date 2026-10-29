-- Moves the prototype file stores (.proto-data/store.json, admin.json, uploads/) into Supabase.
-- Additive only: new tables, one sequence, two functions, one private storage bucket. No existing table is touched.

-- Cart per scope (`dealer:<id>` or `staff:<userId>:<partner>`). Lines and the typed coupon live with the cart.
CREATE TABLE "ShopCart" (
    "scope" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "couponCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopCart_pkey" PRIMARY KEY ("scope")
);

-- Web order. Columns used for filtering/reporting are real columns; nested parts (lines, payment, events, Odoo sync) are JSONB.
CREATE TABLE "ShopOrder" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "dealerName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT NOT NULL,
    "subtotal" NUMERIC(14,2) NOT NULL,
    "cashDiscount" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "couponDiscount" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "total" NUMERIC(14,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "coupon" JSONB,
    "odooPricelistId" INTEGER,
    "address" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "poRef" TEXT,
    "trackingRef" TEXT,
    "payment" JSONB NOT NULL DEFAULT '{"slipFile": null, "slipUploadedAt": null, "verifiedAt": null}'::jsonb,
    "events" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "odoo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShopOrder_status_check" CHECK ("status" IN ('PENDING', 'PREPARING', 'SHIPPED', 'INVOICED', 'PAID', 'CANCELLED')),
    CONSTRAINT "ShopOrder_paymentMethod_check" CHECK ("paymentMethod" IN ('CASH', 'CREDIT'))
);
CREATE UNIQUE INDEX "ShopOrder_ref_key" ON "ShopOrder"("ref");
CREATE INDEX "ShopOrder_scope_createdAt_idx" ON "ShopOrder"("scope", "createdAt" DESC);
CREATE INDEX "ShopOrder_status_idx" ON "ShopOrder"("status");

-- Running number in the order ref (WEB-YYYYMMDD-NNN). Imported orders bump it past their highest number.
CREATE SEQUENCE "ShopOrder_seq";

-- Admin settings (zones, price books, cash pairs, customer groups) as one versioned document.
-- Small, edited by a few admins; writes use optimistic locking on "version".
CREATE TABLE "AdminState" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminState_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ShopCart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShopOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminState" ENABLE ROW LEVEL SECURITY;

-- Places an order atomically: locks the cart, refuses an empty one (so a double submit cannot create two orders),
-- numbers the order, inserts it and empties the cart in one transaction. Returns the new row.
CREATE FUNCTION place_shop_order(p_order JSONB) RETURNS "ShopOrder"
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
                           "lines", "coupon", "odooPricelistId", "address", "carrier", "note", "poRef", "events", "createdAt", "updatedAt")
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

-- Moves the order sequence past imported refs (WEB-YYYYMMDD-NNN) so new numbers never collide.
CREATE FUNCTION bump_shop_order_seq(p_min BIGINT) RETURNS BIGINT
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT setval('"ShopOrder_seq"', GREATEST(p_min, (SELECT last_value FROM "ShopOrder_seq")));
$$;

REVOKE ALL ON FUNCTION place_shop_order(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bump_shop_order_seq(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION place_shop_order(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION bump_shop_order_seq(BIGINT) TO service_role;

-- Private bucket for transfer slips (served only through the app's authorised route).
INSERT INTO storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES ('slips', 'slips', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT ("id") DO NOTHING;
