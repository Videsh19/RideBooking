export function isUnresolvedCashPayment(payment) {
  return payment?.payment_method === 'Cash' &&
    (payment.cash_collection_status === null ||
      payment.cash_collection_status === undefined ||
      payment.cash_collection_status === 'OUTSTANDING');
}

export function selectPreferredBookingPayment(paymentRows) {
  return paymentRows.find(isUnresolvedCashPayment) ||
    paymentRows.find((payment) => payment.payment_status === 'SUCCESS') ||
    paymentRows[0] ||
    null;
}
