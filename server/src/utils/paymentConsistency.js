export function paymentMatchesBooking(payment, booking) {
  const paymentUserId = Number(payment?.user_id);
  const bookingUserId = Number(booking?.user_id);
  const paymentAmount = Number(payment?.amount);
  const bookingFare = Number(booking?.total_fare);

  return Number.isSafeInteger(paymentUserId) &&
    paymentUserId > 0 &&
    Number.isSafeInteger(bookingUserId) &&
    bookingUserId > 0 &&
    paymentUserId === bookingUserId &&
    payment?.amount !== null &&
    payment?.amount !== undefined &&
    Number.isFinite(paymentAmount) &&
    Number.isFinite(bookingFare) &&
    paymentAmount === bookingFare;
}
