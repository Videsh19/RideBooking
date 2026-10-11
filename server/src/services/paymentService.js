import crypto from 'crypto';
import { getDbPool } from '../config/db.js';

// Approved payment methods defined in UML Class Diagram: PaymentMethod
export const ALLOWED_PAYMENT_METHODS = ['Cash', 'Card', 'UPI', 'Wallet', 'NetBanking'];

/**
 * Process simulated payment for a COMPLETED booking
 * Derived from UML Sequence Diagram: completeRide -> makePayment -> paymentSuccess
 * And UML Class: Payment
 */
export async function processPayment({
  userId,
  bookingId,
  paymentMethod = 'UPI',
  simulateFailure = false,
}) {
  const numericBookingId = parseInt(bookingId, 10);
  if (isNaN(numericBookingId)) {
    throw { statusCode: 400, code: 'INVALID_ID', message: 'Booking ID must be a numeric integer.' };
  }

  if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
    throw {
      statusCode: 400,
      code: 'INVALID_PAYMENT_METHOD',
      message: `Invalid payment method '${paymentMethod}'. Allowed methods: ${ALLOWED_PAYMENT_METHODS.join(', ')}.`,
    };
  }

  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock and retrieve booking record for update
    const [bookingRows] = await connection.query(
      `SELECT booking_id, user_id, driver_id, status, payment_status, total_fare
       FROM bookings
       WHERE booking_id = ?
       FOR UPDATE`,
      [numericBookingId]
    );

    if (bookingRows.length === 0) {
      throw {
        statusCode: 404,
        code: 'BOOKING_NOT_FOUND',
        message: `Booking ID ${numericBookingId} was not found.`,
      };
    }

    const booking = bookingRows[0];

    // 2. Cross-user authorization: Only the rider who owns the booking can initiate payment
    if (booking.user_id !== userId) {
      throw {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You are not authorized to make a payment for another passenger’s booking.',
      };
    }

    // 3. Status eligibility: Ride must be in COMPLETED status (SRS REQ & UML Sequence Diagram)
    if (booking.status !== 'COMPLETED') {
      throw {
        statusCode: 400,
        code: 'INVALID_BOOKING_STATUS',
        message: `Payment is only allowed for COMPLETED rides. Current ride status: ${booking.status}.`,
      };
    }

    // 4. Duplicate payment check: Ensure booking is not already marked PAID
    if (booking.payment_status === 'PAID') {
      throw {
        statusCode: 409,
        code: 'ALREADY_PAID',
        message: `Booking GR-BK-${numericBookingId} has already been paid successfully. Duplicate payments are rejected.`,
      };
    }

    // Double-check existing successful payments table records under row lock
    const [existingSuccess] = await connection.query(
      `SELECT payment_id, transaction_id, payment_date
       FROM payments
       WHERE booking_id = ? AND payment_status = 'SUCCESS'
       FOR UPDATE`,
      [numericBookingId]
    );

    if (existingSuccess.length > 0) {
      // Re-synchronize booking payment_status if needed
      await connection.query(
        `UPDATE bookings SET payment_status = 'PAID' WHERE booking_id = ?`,
        [numericBookingId]
      );
      throw {
        statusCode: 409,
        code: 'ALREADY_PAID',
        message: `A successful payment record already exists for booking GR-BK-${numericBookingId} (Txn: ${existingSuccess[0].transaction_id}).`,
      };
    }

    // 5. Source of truth for fare amount: strictly stored total_fare from MySQL
    const amount = Number(booking.total_fare);

    // 6. Generate demo transaction reference
    const timestampStr = Date.now().toString().slice(-8);
    const randomHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    const transactionId = `TXN-GORIDE-${timestampStr}-${randomHex}`;

    // 7. Handle simulated failure scenario explicitly for testing and retry flow
    if (simulateFailure === true) {
      const [failResult] = await connection.query(
        `INSERT INTO payments (
           booking_id, user_id, amount, payment_method, payment_status, transaction_id
         ) VALUES (?, ?, ?, ?, 'FAILED', ?)`,
        [numericBookingId, userId, amount, paymentMethod, transactionId]
      );

      await connection.commit();

      throw {
        statusCode: 402,
        code: 'PAYMENT_SIMULATION_FAILED',
        message: 'Simulated payment processing was declined by the simulated gateway. You may retry payment.',
        data: {
          paymentId: failResult.insertId,
          bookingId: numericBookingId,
          amount,
          paymentMethod,
          paymentStatus: 'FAILED',
          transactionId,
          simulated: true,
        },
      };
    }

    // 8. Simulated successful payment processing
    const [payResult] = await connection.query(
      `INSERT INTO payments (
         booking_id, user_id, amount, payment_method, payment_status, transaction_id
       ) VALUES (?, ?, ?, ?, 'SUCCESS', ?)`,
      [numericBookingId, userId, amount, paymentMethod, transactionId]
    );

    // 9. Atomically mark booking as PAID
    await connection.query(
      `UPDATE bookings SET payment_status = 'PAID' WHERE booking_id = ?`,
      [numericBookingId]
    );

    await connection.commit();

    return {
      paymentId: payResult.insertId,
      payment_id: payResult.insertId,
      bookingId: numericBookingId,
      booking_id: numericBookingId,
      userId,
      amount,
      paymentMethod,
      payment_method: paymentMethod,
      paymentStatus: 'SUCCESS',
      payment_status: 'SUCCESS',
      transactionId,
      transaction_id: transactionId,
      paymentDate: new Date().toISOString(),
      simulated: true,
      message: 'Simulated payment completed successfully.',
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Retrieve payment details for a specific booking
 * RIDER: only their own bookings
 * ADMIN: any booking
 * DRIVER: rejected (403)
 */
export async function getPaymentByBookingId(bookingId, reqUser) {
  const numericBookingId = parseInt(bookingId, 10);
  if (isNaN(numericBookingId)) {
    throw { statusCode: 400, code: 'INVALID_ID', message: 'Booking ID must be a numeric integer.' };
  }

  if (!reqUser) {
    throw { statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required.' };
  }

  // Drivers must never access passenger payment records
  if (reqUser.role === 'DRIVER') {
    throw {
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Driver partners are not authorized to view passenger payment records.',
    };
  }

  const pool = getDbPool();

  // Retrieve booking to check ownership
  const [bookingRows] = await pool.query(
    `SELECT booking_id, user_id, status, payment_status, total_fare FROM bookings WHERE booking_id = ?`,
    [numericBookingId]
  );

  if (bookingRows.length === 0) {
    throw { statusCode: 404, code: 'BOOKING_NOT_FOUND', message: `Booking ID ${numericBookingId} was not found.` };
  }

  const booking = bookingRows[0];

  // If RIDER, enforce ownership
  if (reqUser.role === 'RIDER' && booking.user_id !== reqUser.user_id) {
    throw {
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'You are not authorized to view payment records for another passenger’s booking.',
    };
  }

  const [paymentRows] = await pool.query(
    `SELECT p.payment_id, p.booking_id, p.user_id, p.amount, p.payment_method,
            p.payment_status, p.transaction_id, p.payment_date, p.created_at
     FROM payments p
     WHERE p.booking_id = ?
     ORDER BY p.payment_date DESC`,
    [numericBookingId]
  );

  const successfulPayment = paymentRows.find((p) => p.payment_status === 'SUCCESS');

  return {
    bookingId: numericBookingId,
    fare: Number(booking.total_fare),
    bookingPaymentStatus: booking.payment_status,
    payment: successfulPayment || paymentRows[0] || null,
    paymentAttempts: paymentRows,
  };
}

/**
 * List payment records for authenticated rider
 */
export async function listRiderPayments(userId) {
  const pool = getDbPool();
  const [rows] = await pool.query(
    `SELECT p.payment_id, p.booking_id, p.amount, p.payment_method,
            p.payment_status, p.transaction_id, p.payment_date,
            b.pickup_address, b.dest_address, b.vehicle_tier, b.total_fare
     FROM payments p
     JOIN bookings b ON p.booking_id = b.booking_id
     WHERE p.user_id = ?
     ORDER BY p.payment_date DESC`,
    [userId]
  );
  return rows;
}

/**
 * Administrator: View all payments across the network for oversight
 */
export async function listAdminPayments() {
  const pool = getDbPool();
  const [rows] = await pool.query(
    `SELECT p.payment_id, p.booking_id, p.user_id, u.name AS passenger_name, u.email AS passenger_email,
            p.amount, p.payment_method, p.payment_status, p.transaction_id,
            p.refund_reason, p.refunded_at, p.refund_transaction_id,
            p.payment_date, b.status AS booking_status, b.vehicle_tier AS booking_tier, b.vehicle_tier AS vehicle_category
     FROM payments p
     JOIN users u ON p.user_id = u.user_id
     JOIN bookings b ON p.booking_id = b.booking_id
     ORDER BY p.payment_date DESC`
  );

  const [summary] = await pool.query(
    `SELECT 
       COUNT(*) AS totalTransactions,
       SUM(CASE WHEN payment_status = 'SUCCESS' THEN 1 ELSE 0 END) AS successfulTransactions,
       SUM(CASE WHEN payment_status = 'FAILED' THEN 1 ELSE 0 END) AS failedTransactions,
       SUM(CASE WHEN payment_status = 'REFUND' THEN 1 ELSE 0 END) AS refundedTransactions,
       COALESCE(SUM(CASE WHEN payment_status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS totalSettledRevenue,
       COALESCE(SUM(CASE WHEN payment_status = 'REFUND' THEN amount ELSE 0 END), 0) AS totalRefundedAmount
     FROM payments`
  );

  return {
    payments: rows,
    summary: summary[0] || {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      refundedTransactions: 0,
      totalSettledRevenue: 0,
      totalRefundedAmount: 0,
    },
  };
}

/**
 * Administrative Payment Refund (UML: Payment.refundPayment())
 * Transition payment status to REFUND under atomic row lock and update booking.
 */
export async function refundPayment({ paymentId, adminUserId, reason = 'Administrative refund' } = {}) {
  const numericPaymentId = parseInt(paymentId, 10);
  if (isNaN(numericPaymentId)) {
    throw { statusCode: 400, code: 'INVALID_ID', message: 'Payment ID must be a numeric integer.' };
  }

  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock payment record by primary key
    const [rows] = await connection.query(
      `SELECT payment_id, booking_id, user_id, amount, payment_method, payment_status, transaction_id
       FROM payments
       WHERE payment_id = ?
       FOR UPDATE`,
      [numericPaymentId]
    );

    if (rows.length === 0) {
      throw { statusCode: 404, code: 'PAYMENT_NOT_FOUND', message: `Payment ID ${numericPaymentId} was not found.` };
    }

    const payment = rows[0];

    // 2. State eligibility checks
    if (payment.payment_status === 'REFUND') {
      throw { statusCode: 400, code: 'ALREADY_REFUNDED', message: 'This payment transaction has already been refunded.' };
    }

    if (payment.payment_status !== 'SUCCESS') {
      throw {
        statusCode: 400,
        code: 'CANNOT_REFUND_NON_SUCCESSFUL_PAYMENT',
        message: `Only successfully settled payments can be refunded. Current payment status is ${payment.payment_status}.`,
      };
    }

    // 3. Generate unique refund transaction reference
    const refundTxnId = `RFND-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // 4. Update payment record to REFUND
    await connection.query(
      `UPDATE payments
       SET payment_status = 'REFUND',
           refund_reason = ?,
           refunded_at = NOW(),
           refund_transaction_id = ?,
           updated_at = NOW()
       WHERE payment_id = ?`,
      [reason, refundTxnId, numericPaymentId]
    );

    // 5. Update booking payment_status to UNPAID
    await connection.query(
      `UPDATE bookings
       SET payment_status = 'UNPAID',
           updated_at = NOW()
       WHERE booking_id = ?`,
      [payment.booking_id]
    );

    await connection.commit();

    return {
      payment_id: numericPaymentId,
      booking_id: payment.booking_id,
      refund_transaction_id: refundTxnId,
      refunded_amount: Number(payment.amount),
      payment_status: 'REFUND',
      reason,
      refund_reason: reason,
      message: `Payment ID ${numericPaymentId} refunded successfully (Txn: ${refundTxnId}).`,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
