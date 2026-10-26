-- =============================================================================
-- BSB FitForge - Phase 7: POS, inventory and purchases write path
-- =============================================================================
-- Additive SECURITY DEFINER RPCs for existing commerce tables:
--   products, pos_sales, pos_sale_items, purchases, purchase_items,
--   stock_movements, suppliers
--
-- Tables stay select-only RLS. organization_id is derived server-side.
-- Soft status only. No hard deletes of sales, purchases or movements.
-- Stock changes only through stock_movements (except product opening qty).
-- =============================================================================

-- Composite branch FKs already exist. Add simple branch_id FKs so PostgREST
-- can embed branches on POS, purchase and stock-movement reads.
alter table public.pos_sales drop constraint if exists pos_sales_branch_id_fkey;
alter table public.pos_sales add constraint pos_sales_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

alter table public.purchases drop constraint if exists purchases_branch_id_fkey;
alter table public.purchases add constraint purchases_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

alter table public.stock_movements drop constraint if exists stock_movements_branch_id_fkey;
alter table public.stock_movements add constraint stock_movements_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

-- ---------------------------------------------------------------------------
-- Product update no longer overwrites on-hand stock. Opening qty stays on
-- create_product. Later qty changes go through purchases / POS / void.
-- Signature is unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.update_product(
  p_product_id uuid,
  p_name text,
  p_sku text,
  p_description text,
  p_category text,
  p_unit text,
  p_cost_price numeric,
  p_sale_price numeric,
  p_tax_rate numeric,
  p_track_stock boolean,
  p_stock_quantity numeric,
  p_reorder_level numeric,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_name text;
  v_sku text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org_id
  from public.products where id = p_product_id;
  if v_org_id is null then
    raise exception 'product not found';
  end if;
  if not public.user_has_permission(v_org_id, 'inventory.manage') then
    raise exception 'insufficient privileges';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'product name is required';
  end if;
  v_sku := nullif(upper(trim(p_sku)), '');
  if v_sku is not null and exists (
    select 1 from public.products p
    where p.organization_id = v_org_id and p.sku = v_sku and p.id <> p_product_id
  ) then
    raise exception 'product sku already exists';
  end if;
  if coalesce(p_cost_price, 0) < 0 or coalesce(p_sale_price, 0) < 0
     or coalesce(p_tax_rate, 0) < 0 then
    raise exception 'amounts cannot be negative';
  end if;
  if coalesce(p_reorder_level, 0) < 0 then
    raise exception 'stock values cannot be negative';
  end if;

  update public.products set
    name = v_name,
    sku = v_sku,
    description = nullif(trim(p_description), ''),
    category = nullif(trim(p_category), ''),
    unit = coalesce(nullif(trim(p_unit), ''), 'pcs'),
    cost_price = coalesce(p_cost_price, 0),
    sale_price = coalesce(p_sale_price, 0),
    tax_rate = coalesce(p_tax_rate, 0),
    track_stock = coalesce(p_track_stock, true),
    reorder_level = coalesce(p_reorder_level, 0),
    is_active = coalesce(p_is_active, true)
  where id = p_product_id;
end;
$$;

grant execute on function public.update_product(
  uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, numeric, numeric, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- Internal stock helper. Not granted to clients.
-- p_quantity is signed: positive increases on-hand, negative decreases.
-- ---------------------------------------------------------------------------

create or replace function public.apply_stock_movement(
  p_org_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_movement_type text,
  p_reference_type text,
  p_reference_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_next numeric;
begin
  if p_movement_type not in ('purchase', 'sale', 'adjustment', 'return', 'consumption', 'transfer') then
    raise exception 'movement type is invalid';
  end if;
  if p_quantity = 0 then
    raise exception 'quantity must not be zero';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;
  if v_product.id is null or v_product.organization_id is distinct from p_org_id then
    raise exception 'product not found';
  end if;
  if not v_product.track_stock then
    return;
  end if;

  v_next := public.round_money(coalesce(v_product.stock_quantity, 0) + p_quantity);
  if v_next < 0 then
    raise exception 'insufficient stock';
  end if;

  update public.products
  set stock_quantity = v_next
  where id = p_product_id;

  insert into public.stock_movements (
    organization_id, branch_id, product_id, movement_type, quantity,
    reference_type, reference_id, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_product_id, p_movement_type, p_quantity,
    nullif(trim(p_reference_type), ''), p_reference_id, nullif(trim(p_notes), ''),
    auth.uid()
  );
end;
$$;

revoke all on function public.apply_stock_movement(
  uuid, uuid, uuid, numeric, text, text, uuid, text
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Purchases
-- ---------------------------------------------------------------------------

create or replace function public.create_purchase(
  p_org_id uuid,
  p_branch_id uuid,
  p_supplier_id uuid,
  p_order_date date,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_number text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_line numeric;
  v_rate numeric;
  v_tax numeric;
  v_sub numeric := 0;
  v_tax_sum numeric := 0;
  v_desc text;
begin
  perform public.require_org_permission(p_org_id, 'inventory.manage');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if p_supplier_id is null or not exists (
    select 1 from public.suppliers s
    where s.id = p_supplier_id and s.organization_id = p_org_id
  ) then
    raise exception 'supplier not found';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one purchase item is required';
  end if;

  v_number := public.next_document_number(p_org_id, 'purchase', 'PO');

  insert into public.purchases (
    organization_id, branch_id, supplier_id, purchase_number, status,
    order_date, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_supplier_id, v_number, 'draft',
    coalesce(p_order_date, (timezone('utc', now()))::date),
    nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(trim(v_item ->> 'product_id'), '')::uuid;
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 0);
    v_cost := coalesce((v_item ->> 'unit_cost')::numeric, 0);
    if v_product_id is null then
      raise exception 'product is required';
    end if;
    if v_qty <= 0 then
      raise exception 'quantity must be greater than zero';
    end if;
    if v_cost < 0 then
      raise exception 'amounts cannot be negative';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and organization_id = p_org_id;
    if v_product.id is null then
      raise exception 'product not found';
    end if;

    v_desc := coalesce(nullif(trim(v_item ->> 'description'), ''), v_product.name);
    v_line := public.round_money(v_qty * v_cost);
    v_rate := coalesce(v_product.tax_rate, 0);
    v_tax := public.round_money(v_line * (v_rate / 100));

    insert into public.purchase_items (
      organization_id, purchase_id, product_id, description, quantity, unit_cost, line_total
    )
    values (
      p_org_id, v_id, v_product_id, v_desc, v_qty, v_cost, v_line
    );

    v_sub := v_sub + v_line;
    v_tax_sum := v_tax_sum + v_tax;
  end loop;

  update public.purchases set
    sub_total = public.round_money(v_sub),
    tax_total = public.round_money(v_tax_sum),
    total = public.round_money(v_sub + v_tax_sum)
  where id = v_id;

  return v_id;
end;
$$;

grant execute on function public.create_purchase(
  uuid, uuid, uuid, date, text, jsonb
) to authenticated;

create or replace function public.update_purchase(
  p_purchase_id uuid,
  p_supplier_id uuid,
  p_order_date date,
  p_notes text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_line numeric;
  v_rate numeric;
  v_tax numeric;
  v_sub numeric := 0;
  v_tax_sum numeric := 0;
  v_desc text;
begin
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;
  if v_purchase.id is null then
    raise exception 'purchase not found';
  end if;
  perform public.require_org_permission(v_purchase.organization_id, 'inventory.manage');
  perform public.require_branch_in_org(v_purchase.organization_id, v_purchase.branch_id);

  if v_purchase.status is distinct from 'draft' then
    raise exception 'only draft purchases can be updated';
  end if;

  if p_supplier_id is null or not exists (
    select 1 from public.suppliers s
    where s.id = p_supplier_id and s.organization_id = v_purchase.organization_id
  ) then
    raise exception 'supplier not found';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one purchase item is required';
  end if;

  delete from public.purchase_items where purchase_id = p_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(trim(v_item ->> 'product_id'), '')::uuid;
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 0);
    v_cost := coalesce((v_item ->> 'unit_cost')::numeric, 0);
    if v_product_id is null then
      raise exception 'product is required';
    end if;
    if v_qty <= 0 then
      raise exception 'quantity must be greater than zero';
    end if;
    if v_cost < 0 then
      raise exception 'amounts cannot be negative';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and organization_id = v_purchase.organization_id;
    if v_product.id is null then
      raise exception 'product not found';
    end if;

    v_desc := coalesce(nullif(trim(v_item ->> 'description'), ''), v_product.name);
    v_line := public.round_money(v_qty * v_cost);
    v_rate := coalesce(v_product.tax_rate, 0);
    v_tax := public.round_money(v_line * (v_rate / 100));

    insert into public.purchase_items (
      organization_id, purchase_id, product_id, description, quantity, unit_cost, line_total
    )
    values (
      v_purchase.organization_id, p_purchase_id, v_product_id, v_desc, v_qty, v_cost, v_line
    );

    v_sub := v_sub + v_line;
    v_tax_sum := v_tax_sum + v_tax;
  end loop;

  update public.purchases set
    supplier_id = p_supplier_id,
    order_date = coalesce(p_order_date, v_purchase.order_date),
    notes = nullif(trim(p_notes), ''),
    sub_total = public.round_money(v_sub),
    tax_total = public.round_money(v_tax_sum),
    total = public.round_money(v_sub + v_tax_sum)
  where id = p_purchase_id;
end;
$$;

grant execute on function public.update_purchase(
  uuid, uuid, date, text, jsonb
) to authenticated;

create or replace function public.receive_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases%rowtype;
  v_item public.purchase_items%rowtype;
begin
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;
  if v_purchase.id is null then
    raise exception 'purchase not found';
  end if;
  perform public.require_org_permission(v_purchase.organization_id, 'inventory.manage');
  perform public.require_branch_in_org(v_purchase.organization_id, v_purchase.branch_id);

  if v_purchase.status = 'received' then
    raise exception 'purchase is already received';
  end if;
  if v_purchase.status = 'cancelled' then
    raise exception 'cancelled purchases cannot be received';
  end if;
  if v_purchase.status not in ('draft', 'ordered') then
    raise exception 'status is invalid';
  end if;
  if exists (
    select 1 from public.stock_movements m
    where m.organization_id = v_purchase.organization_id
      and m.reference_type = 'purchase'
      and m.reference_id = p_purchase_id
  ) then
    raise exception 'purchase is already received';
  end if;

  for v_item in
    select * from public.purchase_items where purchase_id = p_purchase_id
  loop
    if v_item.product_id is null then
      continue;
    end if;
    perform public.apply_stock_movement(
      v_purchase.organization_id,
      v_purchase.branch_id,
      v_item.product_id,
      v_item.quantity,
      'purchase',
      'purchase',
      p_purchase_id,
      v_purchase.purchase_number
    );
  end loop;

  update public.purchases set
    status = 'received',
    received_date = (timezone('utc', now()))::date
  where id = p_purchase_id;
end;
$$;

grant execute on function public.receive_purchase(uuid) to authenticated;

create or replace function public.cancel_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases%rowtype;
begin
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;
  if v_purchase.id is null then
    raise exception 'purchase not found';
  end if;
  perform public.require_org_permission(v_purchase.organization_id, 'inventory.manage');
  perform public.require_branch_in_org(v_purchase.organization_id, v_purchase.branch_id);

  if v_purchase.status = 'received' then
    raise exception 'received purchases cannot be cancelled';
  end if;
  if v_purchase.status = 'cancelled' then
    raise exception 'purchase is already cancelled';
  end if;

  update public.purchases
  set status = 'cancelled'
  where id = p_purchase_id;
end;
$$;

grant execute on function public.cancel_purchase(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- POS sales
-- ---------------------------------------------------------------------------

create or replace function public.create_pos_sale(
  p_org_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_payment_method text,
  p_discount numeric,
  p_tax_mode text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_number text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_qty numeric;
  v_price numeric;
  v_rate numeric;
  v_gross numeric;
  v_taxable numeric;
  v_gst numeric;
  v_line numeric;
  v_sub numeric := 0;
  v_tax_sum numeric := 0;
  v_total numeric := 0;
  v_discount numeric;
  v_mode text;
  v_method text;
  v_desc text;
begin
  perform public.require_org_permission(p_org_id, 'pos.create');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if p_member_id is not null and not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one sale item is required';
  end if;

  v_method := coalesce(nullif(trim(p_payment_method), ''), 'cash');
  if v_method not in ('cash', 'card', 'upi', 'netbanking', 'wallet', 'other') then
    raise exception 'payment method is invalid';
  end if;

  v_mode := coalesce(nullif(p_tax_mode, ''), 'exclusive');
  if v_mode not in ('exclusive', 'inclusive') then
    raise exception 'tax mode is invalid';
  end if;

  v_discount := public.round_money(coalesce(p_discount, 0));
  if v_discount < 0 then
    raise exception 'amounts cannot be negative';
  end if;

  v_number := public.next_document_number(p_org_id, 'pos_sale', 'POS');

  insert into public.pos_sales (
    organization_id, branch_id, member_id, sale_number, status,
    payment_method, notes, created_by
  )
  values (
    p_org_id, p_branch_id, p_member_id, v_number, 'completed',
    v_method, nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(trim(v_item ->> 'product_id'), '')::uuid;
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 0);
    if v_product_id is null then
      raise exception 'product is required';
    end if;
    if v_qty <= 0 then
      raise exception 'quantity must be greater than zero';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and organization_id = p_org_id
    for update;
    if v_product.id is null then
      raise exception 'product not found';
    end if;
    if not v_product.is_active then
      raise exception 'product is not active';
    end if;

    v_price := coalesce(v_product.sale_price, 0);
    v_rate := coalesce(v_product.tax_rate, 0);
    v_desc := v_product.name;
    if v_price < 0 or v_rate < 0 then
      raise exception 'amounts cannot be negative';
    end if;

    v_gross := public.round_money(v_qty * v_price);
    if v_mode = 'inclusive' and v_rate > 0 then
      v_taxable := public.round_money(v_gross / (1 + v_rate / 100));
      v_gst := public.round_money(v_gross - v_taxable);
      v_line := v_gross;
    else
      v_taxable := v_gross;
      v_gst := public.round_money(v_taxable * (v_rate / 100));
      v_line := public.round_money(v_taxable + v_gst);
    end if;

    insert into public.pos_sale_items (
      organization_id, sale_id, product_id, description, quantity, unit_price, tax_rate, line_total
    )
    values (
      p_org_id, v_id, v_product_id, v_desc, v_qty, v_price, v_rate, v_line
    );

    perform public.apply_stock_movement(
      p_org_id,
      p_branch_id,
      v_product_id,
      -v_qty,
      'sale',
      'pos_sale',
      v_id,
      v_number
    );

    v_sub := v_sub + v_gross;
    v_tax_sum := v_tax_sum + v_gst;
    v_total := v_total + v_line;
  end loop;

  if v_discount > v_total then
    raise exception 'discount exceeds the sale total';
  end if;
  v_total := greatest(public.round_money(v_total - v_discount), 0);

  update public.pos_sales set
    sub_total = public.round_money(v_sub),
    discount = v_discount,
    tax_total = public.round_money(v_tax_sum),
    total = v_total
  where id = v_id;

  return v_id;
end;
$$;

grant execute on function public.create_pos_sale(
  uuid, uuid, uuid, text, numeric, text, text, jsonb
) to authenticated;

create or replace function public.void_pos_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.pos_sales%rowtype;
  v_item public.pos_sale_items%rowtype;
begin
  select * into v_sale
  from public.pos_sales
  where id = p_sale_id
  for update;
  if v_sale.id is null then
    raise exception 'sale not found';
  end if;
  perform public.require_org_permission(v_sale.organization_id, 'pos.create');
  perform public.require_branch_in_org(v_sale.organization_id, v_sale.branch_id);

  if v_sale.status = 'void' then
    raise exception 'sale is already void';
  end if;
  if v_sale.status is distinct from 'completed' then
    raise exception 'status is invalid';
  end if;
  if exists (
    select 1 from public.stock_movements m
    where m.organization_id = v_sale.organization_id
      and m.reference_type = 'pos_sale_void'
      and m.reference_id = p_sale_id
  ) then
    raise exception 'sale is already void';
  end if;

  for v_item in
    select * from public.pos_sale_items where sale_id = p_sale_id
  loop
    if v_item.product_id is null then
      continue;
    end if;
    perform public.apply_stock_movement(
      v_sale.organization_id,
      v_sale.branch_id,
      v_item.product_id,
      v_item.quantity,
      'return',
      'pos_sale_void',
      p_sale_id,
      v_sale.sale_number
    );
  end loop;

  update public.pos_sales
  set status = 'void'
  where id = p_sale_id;
end;
$$;

grant execute on function public.void_pos_sale(uuid) to authenticated;
