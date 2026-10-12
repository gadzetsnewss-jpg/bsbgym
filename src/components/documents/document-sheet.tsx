"use client";

import * as React from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import {
  documentFooterText,
  documentPageStyle,
  effectivePrintTemplate,
  pageCssSize,
  productFooterLabel,
  productFooterVisible,
  type DocumentModel,
  type DocumentRenderConfig,
} from "@/lib/documents/engine";
import { isThermalPaper } from "@/lib/org/settings-catalog";
import { StatusBadge } from "@/components/ui/badge";
import { humanStatus } from "@/components/billing/status-copy";
import { INVOICE_STATUS_LABELS } from "@/lib/billing/types";
import { cn } from "@/lib/utils";

export function DocumentSheet({
  document,
  config,
  currency = "INR",
  preview = false,
}: {
  document: DocumentModel;
  config: DocumentRenderConfig;
  currency?: string;
  preview?: boolean;
}) {
  const { print, invoice } = config;
  const template = effectivePrintTemplate(print);
  const thermal = isThermalPaper(print.paperSize) || template === "thermal";
  const compact = template === "compact" || thermal;
  const detailed = template === "detailed";
  const fields = print.fields;
  const footer = documentFooterText(print, invoice);
  const showGstin = fields.gstin && invoice.includeGstin;
  const pageStyle = documentPageStyle(print);

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: ${pageCssSize(print)};
            margin: 0;
          }
        }
      `}</style>
      <article
        className={cn(
          "bg-white text-ink print:shadow-none",
          preview ? "rounded-card border border-border shadow-card" : "rounded-card border border-border print:border-0",
          thermal ? "font-mono" : "",
        )}
        style={pageStyle}
      >
        <header
          className={cn("flex flex-wrap items-start justify-between gap-4", thermal && "flex-col gap-2")}
          style={{ marginBottom: `${print.headerSpacing}px` }}
        >
          <div className="flex items-start gap-3">
            {fields.logo && document.seller.logoUrl ? (
              <img
                src={document.seller.logoUrl}
                alt=""
                style={{ height: print.logoSize, width: print.logoSize }}
                className="rounded-lg object-contain"
              />
            ) : null}
            <div>
              <p className={cn("font-semibold", thermal ? "text-base" : "text-lg")}>{document.seller.name}</p>
              {document.seller.legalName ? (
                <p className="text-neutral-500">{document.seller.legalName}</p>
              ) : null}
              {fields.address && document.seller.address ? (
                <p className="text-neutral-500">{document.seller.address}</p>
              ) : null}
              {showGstin && document.seller.gstin ? (
                <p className="text-neutral-500">GSTIN {document.seller.gstin}</p>
              ) : null}
              {fields.phoneEmail && document.seller.phone ? (
                <p className="text-neutral-500">{document.seller.phone}</p>
              ) : null}
              {fields.phoneEmail && document.seller.email ? (
                <p className="text-neutral-500">{document.seller.email}</p>
              ) : null}
              {fields.phoneEmail && document.seller.website ? (
                <p className="text-neutral-500">{document.seller.website}</p>
              ) : null}
            </div>
          </div>
          <div className={cn(thermal ? "text-left" : "text-right")}>
            <p className={cn("font-semibold", thermal ? "text-base" : "text-2xl")}>{document.title}</p>
            <p className="text-neutral-500">{document.number}</p>
            {document.status ? (
              <div className="mt-1 print:hidden">
                <StatusBadge status={INVOICE_STATUS_LABELS[document.status] ?? humanStatus(document.status)} />
              </div>
            ) : null}
          </div>
        </header>

        <div className={cn("mb-6 grid gap-6", thermal ? "grid-cols-1" : "grid-cols-2")}>
          {document.buyer ? (
            <div>
              <p className="text-xs tracking-wide text-neutral-500 uppercase">
                {document.kind === "payment_receipt" ? "Received from" : "Bill to"}
              </p>
              <p className="font-medium">{document.buyer.name}</p>
              {document.buyer.legalName ? <p>{document.buyer.legalName}</p> : null}
              {document.buyer.phone ? <p>{document.buyer.phone}</p> : null}
              {document.buyer.email ? <p>{document.buyer.email}</p> : null}
              {fields.memberAddress && document.buyer.address ? <p>{document.buyer.address}</p> : null}
            </div>
          ) : (
            <div />
          )}
          <dl className={cn("grid grid-cols-2 gap-2", thermal && "text-xs")}>
            {document.issueDate ? (
              <>
                <dt className="text-neutral-500">Date</dt>
                <dd className="text-right">{formatDate(document.issueDate)}</dd>
              </>
            ) : null}
            {document.dueDate ? (
              <>
                <dt className="text-neutral-500">Due date</dt>
                <dd className="text-right">{formatDate(document.dueDate)}</dd>
              </>
            ) : null}
            {document.placeOfSupply ? (
              <>
                <dt className="text-neutral-500">Place of supply</dt>
                <dd className="text-right">{document.placeOfSupply}</dd>
              </>
            ) : null}
            {document.branchName ? (
              <>
                <dt className="text-neutral-500">Branch</dt>
                <dd className="text-right">{document.branchName}</dd>
              </>
            ) : null}
          </dl>
        </div>

        {document.highlightAmount != null && (
          <div className="mb-6 rounded-lg border border-border px-4 py-6 text-center">
            <p className="text-xs tracking-wide text-neutral-500 uppercase">
              {document.highlightLabel ?? "Amount"}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {formatCurrency(document.highlightAmount, currency)}
            </p>
          </div>
        )}

        {document.lines.length > 0 && (
          <table className="mb-6 w-full">
            <thead className="border-y border-border text-left text-xs tracking-wide text-neutral-500 uppercase">
              <tr>
                <th className="py-2">Description</th>
                {!compact && <th className="py-2">HSN / SAC</th>}
                {!thermal && <th className="py-2">Qty</th>}
                {!compact && <th className="py-2 text-right">Rate</th>}
                {fields.discount && !compact && <th className="py-2 text-right">Discount</th>}
                {fields.taxBreakup && !compact && <th className="py-2 text-right">GST %</th>}
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {document.lines.map((item, index) => (
                <tr key={`${item.description}-${index}`} className="border-b border-border">
                  <td className="py-2">
                    <div>{item.description}</div>
                    {detailed && item.detail ? <div className="text-xs text-neutral-500">{item.detail}</div> : null}
                  </td>
                  {!compact && <td className="py-2">{item.hsnSac ?? "—"}</td>}
                  {!thermal && <td className="py-2">{item.quantity ?? "—"}</td>}
                  {!compact && (
                    <td className="py-2 text-right tabular-nums">{formatCurrency(item.rate ?? 0, currency)}</td>
                  )}
                  {fields.discount && !compact && (
                    <td className="py-2 text-right tabular-nums">{formatCurrency(item.discount ?? 0, currency)}</td>
                  )}
                  {fields.taxBreakup && !compact && (
                    <td className="py-2 text-right tabular-nums">{item.taxRate ?? 0}%</td>
                  )}
                  <td className="py-2 text-right tabular-nums">{formatCurrency(item.total, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {document.totals ? (
          <div className={cn("ml-auto w-full space-y-1", thermal ? "max-w-none" : "max-w-xs")}>
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(document.totals.subTotal, currency)}</span>
            </div>
            {fields.discount ? (
              <div className="flex justify-between">
                <span>Discount</span>
                <span className="tabular-nums">{formatCurrency(document.totals.discount, currency)}</span>
              </div>
            ) : null}
            {fields.taxBreakup ? (
              <>
                <div className="flex justify-between">
                  <span>CGST</span>
                  <span className="tabular-nums">{formatCurrency(document.totals.cgst, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST</span>
                  <span className="tabular-nums">{formatCurrency(document.totals.sgst, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IGST</span>
                  <span className="tabular-nums">{formatCurrency(document.totals.igst, currency)}</span>
                </div>
              </>
            ) : null}
            <div className="flex justify-between">
              <span>Round off</span>
              <span className="tabular-nums">{formatCurrency(document.totals.roundOff, currency)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(document.totals.total, currency)}</span>
            </div>
            {document.totals.paid != null ? (
              <div className="flex justify-between">
                <span>Paid</span>
                <span className="tabular-nums">{formatCurrency(document.totals.paid, currency)}</span>
              </div>
            ) : null}
            {document.totals.balance != null ? (
              <div className="flex justify-between font-semibold">
                <span>Balance</span>
                <span className="tabular-nums">{formatCurrency(document.totals.balance, currency)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {fields.payments && document.payments.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs tracking-wide text-neutral-500 uppercase">Payments</p>
            <ul className="space-y-1">
              {document.payments.map((row, index) => (
                <li key={`${row.method}-${index}`} className="flex justify-between gap-3">
                  <span>
                    {PAYMENT_METHOD_LABELS[row.method] ?? row.method}
                    {row.reference ? ` · ${row.reference}` : ""}
                  </span>
                  <span className="tabular-nums">{formatCurrency(row.amount, currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {document.notes ? <p className="mt-6 text-neutral-500">{document.notes}</p> : null}
        {fields.terms && document.terms ? <p className="mt-4 text-neutral-500">{document.terms}</p> : null}
        {fields.signature ? (
          <p className="mt-10 text-right text-neutral-500">Authorized signatory</p>
        ) : null}

        <footer style={{ marginTop: `${print.footerSpacing}px` }}>
          {footer ? <p className="text-neutral-500">{footer}</p> : null}
          {productFooterVisible(print) ? (
            <p className="mt-2 text-xs text-neutral-400">{productFooterLabel()}</p>
          ) : null}
        </footer>
      </article>
    </>
  );
}
