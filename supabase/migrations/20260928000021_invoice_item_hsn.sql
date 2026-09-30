-- =============================================================================
-- BSB FitForge - Invoice line HSN / SAC
-- =============================================================================
-- Additive. Stores HSN/SAC on invoice_items and persists it from create_invoice
-- JSON payload. Function signature is unchanged.
-- =============================================================================

alter table public.invoice_items add column if not exists hsn_sac text;

create or replace function public.create_invoice(
  p_org_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_membership_id uuid,
  p_issue_date date,
  p_due_date date,
  p_notes text,
  p_place_of_supply text,
  p_tax_mode text,
  p_round_off numeric,
  p_items jsonb,
  p_issue boolean
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
  v_idx integer := 0;
  v_qty numeric;
  v_price numeric;
  v_discount numeric;
  v_rate numeric;
  v_gross numeric;
  v_after numeric;
  v_taxable numeric;
  v_gst numeric;
  v_cgst numeric;
  v_sgst numeric;
  v_igst numeric;
  v_line numeric;
  v_sub numeric := 0;
  v_disc numeric := 0;
  v_taxable_sum numeric := 0;
  v_cgst_sum numeric := 0;
  v_sgst_sum numeric := 0;
  v_igst_sum numeric := 0;
  v_tax_sum numeric := 0;
  v_total numeric := 0;
  v_round numeric;
  v_mode text;
  v_supply text;
  v_inter boolean;
  v_org_state text;
  v_type text;
  v_hsn text;
begin
  perform public.require_org_permission(p_org_id, 'billing.create');
  perform public.require_branch_in_org(p_org_id, p_branch_id);

  if p_member_id is null or not exists (
    select 1 from public.gym_members m
    where m.id = p_member_id and m.organization_id = p_org_id
  ) then
    raise exception 'member not found';
  end if;

  if p_membership_id is not null and not exists (
    select 1 from public.memberships ms
    where ms.id = p_membership_id and ms.organization_id = p_org_id and ms.member_id = p_member_id
  ) then
    raise exception 'membership not found';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one invoice item is required';
  end if;

  v_mode := coalesce(nullif(p_tax_mode, ''), 'exclusive');
  if v_mode not in ('exclusive', 'inclusive') then
    raise exception 'tax mode is invalid';
  end if;

  select state into v_org_state from public.organizations where id = p_org_id;
  v_supply := coalesce(nullif(trim(p_place_of_supply), ''), v_org_state, '');
  v_inter := v_org_state is not null and v_supply <> '' and lower(v_org_state) is distinct from lower(v_supply);
  v_round := public.round_money(coalesce(p_round_off, 0));

  v_number := public.next_document_number(p_org_id, 'invoice', 'INV');

  insert into public.invoices (
    organization_id, branch_id, member_id, membership_id, invoice_number, status,
    issue_date, due_date, notes, place_of_supply, tax_mode, round_off, created_by
  )
  values (
    p_org_id, p_branch_id, p_member_id, p_membership_id, v_number,
    case when coalesce(p_issue, false) then 'issued' else 'draft' end,
    coalesce(p_issue_date, (timezone('utc', now()))::date),
    p_due_date,
    nullif(trim(p_notes), ''),
    nullif(trim(v_supply), ''),
    v_mode,
    v_round,
    auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 1);
    v_price := coalesce((v_item ->> 'unit_price')::numeric, 0);
    v_discount := coalesce((v_item ->> 'discount')::numeric, 0);
    v_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    v_type := coalesce(nullif(v_item ->> 'item_type', ''), 'other');
    v_hsn := nullif(trim(v_item ->> 'hsn_sac'), '');
    if v_qty <= 0 then
      raise exception 'quantity must be greater than zero';
    end if;
    if v_price < 0 or v_discount < 0 or v_rate < 0 then
      raise exception 'amounts cannot be negative';
    end if;
    if v_type not in ('membership', 'renewal', 'upgrade', 'personal_training', 'class', 'product', 'other') then
      raise exception 'item type is invalid';
    end if;
    if coalesce(nullif(trim(v_item ->> 'description'), ''), '') = '' then
      raise exception 'item description is required';
    end if;

    v_gross := public.round_money(v_qty * v_price);
    v_after := greatest(public.round_money(v_gross - v_discount), 0);
    if v_mode = 'inclusive' and v_rate > 0 then
      v_taxable := public.round_money(v_after / (1 + v_rate / 100));
      v_gst := public.round_money(v_after - v_taxable);
    else
      v_taxable := v_after;
      v_gst := public.round_money(v_taxable * (v_rate / 100));
    end if;

    if v_inter then
      v_igst := v_gst;
      v_cgst := 0;
      v_sgst := 0;
    else
      v_cgst := public.round_money(v_gst / 2);
      v_sgst := public.round_money(v_gst - v_cgst);
      v_igst := 0;
    end if;

    v_line := case when v_mode = 'inclusive' then v_after else public.round_money(v_taxable + v_gst) end;

    insert into public.invoice_items (
      organization_id, invoice_id, description, item_type, quantity, unit_price, discount,
      tax_rate, taxable_amount, gst_amount, cgst, sgst, igst, line_total, sort_order, hsn_sac
    )
    values (
      p_org_id, v_id, trim(v_item ->> 'description'), v_type, v_qty, v_price, v_discount,
      v_rate, v_taxable, v_gst, v_cgst, v_sgst, v_igst, v_line, v_idx, v_hsn
    );

    v_sub := v_sub + v_gross;
    v_disc := v_disc + v_discount;
    v_taxable_sum := v_taxable_sum + v_taxable;
    v_cgst_sum := v_cgst_sum + v_cgst;
    v_sgst_sum := v_sgst_sum + v_sgst;
    v_igst_sum := v_igst_sum + v_igst;
    v_tax_sum := v_tax_sum + v_gst;
    v_total := v_total + v_line;
    v_idx := v_idx + 1;
  end loop;

  v_total := greatest(public.round_money(v_total + v_round), 0);

  update public.invoices set
    sub_total = public.round_money(v_sub),
    discount = public.round_money(v_disc),
    tax_total = public.round_money(v_tax_sum),
    cgst = public.round_money(v_cgst_sum),
    sgst = public.round_money(v_sgst_sum),
    igst = public.round_money(v_igst_sum),
    total = v_total
  where id = v_id;

  return v_id;
end;
$$;

grant execute on function public.create_invoice(
  uuid, uuid, uuid, uuid, date, date, text, text, text, numeric, jsonb, boolean
) to authenticated;
