import { Phone, Smartphone } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import type { PaymentInfo } from "@/lib/services/tenant";

/** How to pay: the landlord's Paybill and instructions, with the usual M-Pesa steps. */
export function PaymentInstructions({
  info,
  unitNumber,
  landlordPhone,
  amountDue,
}: {
  info: PaymentInfo | null;
  unitNumber: string;
  landlordPhone: string | null;
  amountDue: string | null;
}) {
  const paybill = info?.mpesa_paybill ?? null;
  const text = info?.payment_instructions ?? null;

  return (
    <Card>
      <CardHeader icon={Smartphone} title="How to pay" description={amountDue ? `Amount due: ${amountDue}` : "Pay your rent with M-Pesa."} />
      {paybill || text ? (
        <div className="space-y-4">
          {paybill ? (
            <div className="rounded-xl bg-accent/60 p-4">
              <p className="text-xs text-muted-foreground">M-Pesa Paybill (business number)</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="font-mono text-2xl font-semibold tracking-wider text-accent-foreground">{paybill}</p>
                <CopyButton value={paybill} label="Copy Paybill number" />
              </div>
              {!text ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Account number: use your unit number ({unitNumber}) unless your landlord tells you otherwise.
                </p>
              ) : null}
            </div>
          ) : null}
          {text ? <p className="whitespace-pre-wrap text-sm">{text}</p> : null}
          {paybill ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Open M-Pesa, then Lipa na M-Pesa, then Pay Bill.</li>
              <li>Enter the business number above.</li>
              <li>Enter the account number as instructed.</li>
              <li>Enter the amount and your M-Pesa PIN.</li>
            </ol>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          <p>Your landlord has not added payment details yet.</p>
          {landlordPhone ? (
            <a href={`tel:${landlordPhone}`} className="mt-2 inline-flex items-center gap-2 font-medium text-foreground hover:underline">
              <Phone className="size-4" aria-hidden />
              Call {landlordPhone}
            </a>
          ) : null}
        </div>
      )}
      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Paying with an M-Pesa prompt (STK Push) is not available yet. After you pay, your landlord records the payment and this statement updates.
      </p>
    </Card>
  );
}
