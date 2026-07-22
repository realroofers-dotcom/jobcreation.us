// Replaces the earlier version of this file.
// Adds a fourth category: service_revenue - money paid for actual work performed
// (roofing repairs). This is ordinary business income to the payer, NOT a
// charitable contribution, so it gets its own receipt template with no
// tax-deductibility language at all.

const ORG_NAME = "JobCreation.us";
const ORG_EIN = "26-4542276";
const ORG_ADDRESS = "PO Box 589, Clifton, NJ 07012";

export function computeDeductible(category, amount, fairMarketValue) {
  if (category === "service_revenue") return 0;
  if (category === "donation") return amount;
  const fmv = fairMarketValue || 0;
  return Math.max(0, amount - fmv);
}

export function makeReceiptNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `JC-${ts}-${rand}`;
}

export function buildReceipt({ receiptNumber, date, donorName, amount, category, fairMarketValue, deductibleAmount, method, serviceDescription }) {
  // Ordinary receipt for paid work performed - no charitable language, no EIN
  // framed as a deduction basis.
  if (category === "service_revenue") {
    const subject = `Your receipt from ${ORG_NAME} — #${receiptNumber}`;
    const text =
`${ORG_NAME}
${ORG_ADDRESS}

Receipt #${receiptNumber}
Date: ${date}
Received from: ${donorName}
Amount: $${amount.toFixed(2)}
Payment method: ${method}
Service: ${serviceDescription || "Roofing repair work"}

This is a receipt for services rendered. It is not a charitable contribution and is not tax-deductible.

Thank you for your business.`;
    return { subject, text };
  }

  let quidProQuoLine;
  if (category === "donation") {
    quidProQuoLine = "No goods or services were provided in exchange for this contribution.";
  } else {
    const label = category === "event_fee" ? "attending this event" : "this membership";
    quidProQuoLine =
      `In exchange for ${label}, goods or services with an estimated fair market value of ` +
      `$${fairMarketValue.toFixed(2)} were provided. The tax-deductible portion of your payment ` +
      `is $${deductibleAmount.toFixed(2)}.`;
  }

  const subject = `Your receipt from ${ORG_NAME} — #${receiptNumber}`;
  const text =
`${ORG_NAME}
${ORG_ADDRESS}
EIN: ${ORG_EIN}

Receipt #${receiptNumber}
Date: ${date}
Received from: ${donorName}
Amount: $${amount.toFixed(2)}
Payment method: ${method}

${quidProQuoLine}

This receipt is being provided for your tax records. ${ORG_NAME} is a 501(c)(3) nonprofit organization.
Thank you for supporting the mission.`;

  return { subject, text };
}

export async function sendReceiptEmail(env, toEmail, subject, text) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RECEIPT_FROM_EMAIL || "JobCreation.us <receipts@jobcreation.us>",
      to: [toEmail],
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error("Resend error: " + body);
  }
}
