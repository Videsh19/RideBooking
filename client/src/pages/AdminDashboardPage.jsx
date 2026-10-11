import React, { useEffect, useState } from 'react';
import {
  Shield,
  Server,
  Database,
  Users,
  Car,
  Activity,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ListFilter,
  UserCheck,
  Clock,
  Check,
  X,
  FileCheck,
  BadgeAlert,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';

const API_BASE_URL = 'http://localhost:5000/api';

export default function AdminDashboardPage() {
  const { token } = useAuth();
  const [usersList, setUsersList] = useState([]);
  const [pendingApplications, setPendingApplications] = useState([]);
  const [paymentsList, setPaymentsList] = useState([]);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionDriverId, setActionDriverId] = useState(null);
  const [actionPaymentId, setActionPaymentId] = useState(null);

  const fetchAdminData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);

      const [usersRes, statsRes, appsRes, paymentsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/admin/system-stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/admin/driver-applications`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/payments/admin/all`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!usersRes.ok || !statsRes.ok || !appsRes.ok) {
        throw new Error('Failed to retrieve administrator governance data.');
      }

      const usersJson = await usersRes.json();
      const statsJson = await statsRes.json();
      const appsJson = await appsRes.json();
      const paymentsJson = paymentsRes.ok ? await paymentsRes.json() : { data: [], summary: null };

      setUsersList(usersJson.data || []);
      setStats(statsJson.data || null);
      setPendingApplications(appsJson.data || []);
      setPaymentsList(paymentsJson.data || []);
      setPaymentSummary(paymentsJson.summary || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefundPayment = async (paymentId) => {
    const reason = prompt('Please enter administrative reason for this refund:', 'Customer satisfaction dispute');
    if (!reason) return;

    try {
      setActionPaymentId(paymentId);
      const res = await fetch(`${API_BASE_URL}/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error?.message || 'Refund processing failed.');
      } else {
        alert(data.message || 'Payment refunded successfully.');
        await fetchAdminData();
      }
    } catch (err) {
      alert(`Refund error: ${err.message}`);
    } finally {
      setActionPaymentId(null);
    }
  };

  const handleViewDocument = async (driverId, docType) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/driver-documents/${driverId}/${docType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error?.message || 'Document file not found or inaccessible.');
        return;
      }
      const blob = await res.blob();
      const fileUrl = URL.createObjectURL(blob);
      window.open(fileUrl, '_blank');
    } catch (err) {
      alert(`Failed to load document: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [token]);

  const handleApproveDriver = async (driverId) => {
    try {
      setActionDriverId(driverId);
      const res = await fetch(`${API_BASE_URL}/admin/driver-applications/${driverId}/approve`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error?.message || 'Failed to approve driver partner.');
      } else {
        await fetchAdminData();
      }
    } catch (err) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setActionDriverId(null);
    }
  };

  const handleRejectDriver = async (driverId) => {
    const reason = prompt('Please specify a rejection reason:', 'Document verification criteria not met.');
    if (reason === null) return;

    try {
      setActionDriverId(driverId);
      const res = await fetch(`${API_BASE_URL}/admin/driver-applications/${driverId}/reject`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error?.message || 'Failed to reject driver partner.');
      } else {
        await fetchAdminData();
      }
    } catch (err) {
      alert(`Rejection failed: ${err.message}`);
    } finally {
      setActionDriverId(null);
    }
  };

  const getRoleBadgeVariant = (role) => {
    switch (role) {
      case 'ADMIN':
        return 'purple';
      case 'DRIVER':
        return 'warning';
      case 'RIDER':
        return 'info';
      default:
        return 'neutral';
    }
  };

  return (
    <DashboardLayout
      role="Admin"
      title="Fleet Administration & Governance Console"
      subtitle="Role-based access control registry, driver verification queue, and infrastructure oversight"
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchAdminData}
          disabled={loading}
          id="admin-refresh-probe-btn"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh Registry
        </Button>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="p-3.5 rounded-lg border border-red-800/40 bg-red-950/20 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Telemetry Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card padding="p-4">
            <div className="flex items-center justify-between text-theme-text-secondary text-xs">
              <span>Total Users</span>
              <Users className="w-4 h-4 text-theme-primary" />
            </div>
            <div className="mt-2 text-2xl font-bold text-theme-text">
              {usersList.length}
            </div>
            <p className="text-[10px] text-theme-text-secondary mt-1">
              Active accounts in MySQL
            </p>
          </Card>

          <Card padding="p-4">
            <div className="flex items-center justify-between text-theme-text-secondary text-xs">
              <span>Riders</span>
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-theme-text">
              {usersList.filter((u) => u.role === 'RIDER').length}
            </div>
            <p className="text-[10px] text-theme-text-secondary mt-1">
              Registered passenger accounts
            </p>
          </Card>

          <Card padding="p-4">
            <div className="flex items-center justify-between text-theme-text-secondary text-xs">
              <span>Driver Partners</span>
              <Car className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-theme-text">
              {usersList.filter((u) => u.role === 'DRIVER').length}
            </div>
            <p className="text-[10px] text-theme-text-secondary mt-1">
              {usersList.filter((u) => u.role === 'DRIVER' && u.approval_status === 'APPROVED').length} Approved • {pendingApplications.length} Pending
            </p>
          </Card>

          <Card padding="p-4">
            <div className="flex items-center justify-between text-theme-text-secondary text-xs">
              <span>Pending Reviews</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-400">
              {pendingApplications.length}
            </div>
            <p className="text-[10px] text-theme-text-secondary mt-1">
              Awaiting municipal verification
            </p>
          </Card>

          <Card padding="p-4">
            <div className="flex items-center justify-between text-theme-text-secondary text-xs">
              <span>Settled Revenue</span>
              <CreditCard className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
              ₹{Number(stats?.payments?.totalCollectedRevenue || 0).toLocaleString()}
            </div>
            <p className="text-[10px] text-theme-text-secondary mt-1">
              {stats?.payments?.totalPayments || 0} simulated payments
            </p>
          </Card>
        </div>

        {/* 1. Pending Driver Applications Queue */}
        <Card
          title="Driver Partner Onboarding & Verification Queue"
          subtitle="Municipal compliance and commercial license review for new applicants"
          badge={
            pendingApplications.length > 0 ? (
              <Badge variant="warning" size="sm">
                {pendingApplications.length} Action Required
              </Badge>
            ) : null
          }
        >
          {loading ? (
            <div className="py-6 flex justify-center">
              <LoadingSpinner label="Loading application queue..." />
            </div>
          ) : pendingApplications.length === 0 ? (
            <div className="py-6 text-center text-xs text-theme-text-secondary">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              <span>No pending driver partner applications. All applicant documents have been reviewed.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-theme-border text-theme-text-secondary">
                    <th className="pb-2.5 font-semibold">Applicant Name</th>
                    <th className="pb-2.5 font-semibold">Email & Phone</th>
                    <th className="pb-2.5 font-semibold">Driving License</th>
                    <th className="pb-2.5 font-semibold">Vehicle Details</th>
                    <th className="pb-2.5 font-semibold">Submission Date</th>
                    <th className="pb-2.5 font-semibold text-right">Verification Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border text-theme-text">
                  {pendingApplications.map((app) => (
                    <tr key={app.driver_id}>
                      <td className="py-3 font-medium">
                        {app.name}
                      </td>
                      <td className="py-3 text-theme-text-secondary">
                        <div>{app.email}</div>
                        <div className="text-[10px]">{app.phone_no}</div>
                      </td>
                      <td className="py-3 font-mono">
                        <span className="bg-theme-surface/70 px-2 py-0.5 rounded border border-theme-border">
                          {app.license_no}
                        </span>
                        {app.license_doc_path ? (
                          <button
                            type="button"
                            onClick={() => handleViewDocument(app.driver_id, 'license')}
                            className="text-[10px] text-theme-primary flex items-center gap-1 underline mt-1 font-sans hover:text-theme-primary-hover"
                          >
                            <FileCheck className="w-3 h-3" /> View License Doc
                          </button>
                        ) : (
                          <span className="text-[10px] text-theme-text-secondary block font-sans italic mt-0.5">
                            No doc file uploaded
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="font-semibold">{app.vehicle_model}</div>
                        <div className="font-mono text-[10px] text-theme-text-secondary">{app.vehicle_no}</div>
                        <div className="mt-1">
                          {app.vehicle_category ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              {app.vehicle_category}
                            </span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              UNCLASSIFIED
                            </span>
                          )}
                        </div>
                        {app.vehicle_doc_path ? (
                          <button
                            type="button"
                            onClick={() => handleViewDocument(app.driver_id, 'vehicle')}
                            className="text-[10px] text-theme-primary flex items-center gap-1 underline mt-1 hover:text-theme-primary-hover"
                          >
                            <FileCheck className="w-3 h-3" /> View Reg Doc
                          </button>
                        ) : (
                          <span className="text-[10px] text-theme-text-secondary block italic mt-0.5">
                            No doc file uploaded
                          </span>
                        )}
                      </td>
                      <td className="py-3 font-mono text-[10px] text-theme-text-secondary">
                        {app.created_at ? new Date(app.created_at).toLocaleDateString() : '--'}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRejectDriver(app.driver_id)}
                            disabled={actionDriverId === app.driver_id}
                          >
                            <X className="w-3.5 h-3.5 mr-1" />
                            Reject
                          </Button>
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => handleApproveDriver(app.driver_id)}
                            disabled={actionDriverId === app.driver_id}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            {actionDriverId === app.driver_id ? 'Approving...' : 'Approve Partner'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 2. Real User Registry Table from MySQL */}
        <Card
          title="User Role Registry & Authorization Ledger"
          subtitle="Real-time relational user records from goride_db.users"
        >
          {loading ? (
            <div className="py-8 flex justify-center">
              <LoadingSpinner label="Loading user registry from MySQL..." />
            </div>
          ) : usersList.length === 0 ? (
            <p className="text-xs text-theme-text-secondary py-4 text-center">
              No registered user accounts found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-theme-border text-theme-text-secondary">
                    <th className="pb-2.5 font-semibold">User ID</th>
                    <th className="pb-2.5 font-semibold">Full Name</th>
                    <th className="pb-2.5 font-semibold">Email & Phone</th>
                    <th className="pb-2.5 font-semibold">Assigned Role</th>
                    <th className="pb-2.5 font-semibold">Driver Verification</th>
                    <th className="pb-2.5 font-semibold">Created At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border text-theme-text">
                  {usersList.map((usr) => (
                    <tr key={usr.user_id}>
                      <td className="py-3 font-mono text-[11px] text-theme-text-secondary">
                        USR-{usr.user_id}
                      </td>
                      <td className="py-3 font-medium">
                        {usr.name}
                      </td>
                      <td className="py-3 text-theme-text-secondary">
                        <div>{usr.email}</div>
                        <div className="text-[10px] text-theme-text-secondary">{usr.phone_no}</div>
                      </td>
                      <td className="py-3">
                        <Badge variant={getRoleBadgeVariant(usr.role)} size="sm">
                          {usr.role}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {usr.role === 'DRIVER' ? (
                          <div className="space-y-0.5">
                            <Badge
                              variant={
                                usr.approval_status === 'APPROVED'
                                  ? 'success'
                                  : usr.approval_status === 'REJECTED'
                                  ? 'error'
                                  : 'warning'
                              }
                              size="sm"
                            >
                              {usr.approval_status || 'PENDING'}
                            </Badge>
                            <span className="text-[10px] text-theme-text-secondary block font-mono">
                              {usr.license_no || '--'}
                            </span>
                            {usr.vehicle_category && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                {usr.vehicle_category}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-theme-text-secondary italic">
                            N/A (Passenger)
                          </span>
                        )}
                      </td>
                      <td className="py-3 font-mono text-[11px] text-theme-text-secondary">
                        {usr.created_at ? new Date(usr.created_at).toLocaleDateString() : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 3. Payment Ledger & Financial Audit Table (UML: Payment.refundPayment()) */}
        <Card
          title="Payment Oversight & Administrative Refunds"
          subtitle="Real-time transaction settlement and academic simulated refunds ledger"
        >
          {loading ? (
            <div className="py-8 flex justify-center">
              <LoadingSpinner label="Loading payments ledger..." />
            </div>
          ) : paymentsList.length === 0 ? (
            <p className="text-xs text-theme-text-secondary py-4 text-center">
              No payment transactions recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="mb-3 flex items-center justify-between text-xs text-theme-text-secondary">
                <span>
                  Total Transactions: <strong className="text-theme-text">{paymentSummary?.totalTransactions || paymentsList.length}</strong>
                </span>
                <span>
                  Settled Revenue: <strong className="text-emerald-400">₹{Number(paymentSummary?.totalSettledRevenue || 0).toFixed(2)}</strong>
                </span>
                {paymentSummary?.totalRefundedAmount > 0 && (
                  <span>
                    Refunded: <strong className="text-rose-400">₹{Number(paymentSummary?.totalRefundedAmount || 0).toFixed(2)}</strong>
                  </span>
                )}
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-theme-border text-theme-text-secondary">
                    <th className="pb-2.5 font-semibold">Payment ID</th>
                    <th className="pb-2.5 font-semibold">Booking ID</th>
                    <th className="pb-2.5 font-semibold">Passenger</th>
                    <th className="pb-2.5 font-semibold">Amount & Method</th>
                    <th className="pb-2.5 font-semibold">Status</th>
                    <th className="pb-2.5 font-semibold">Transaction ID</th>
                    <th className="pb-2.5 font-semibold text-right">Administrative Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border text-theme-text">
                  {paymentsList.map((pay) => (
                    <tr key={pay.payment_id}>
                      <td className="py-3 font-mono text-[11px] text-theme-text-secondary">
                        PAY-{pay.payment_id}
                      </td>
                      <td className="py-3 font-mono text-[11px] text-theme-primary font-semibold">
                        <div>GR-BK-{pay.booking_id}</div>
                        {(pay.booking_tier || pay.vehicle_category) && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            {pay.booking_tier || pay.vehicle_category}
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="font-medium">{pay.passenger_name}</div>
                        <div className="text-[10px] text-theme-text-secondary">{pay.passenger_email}</div>
                      </td>
                      <td className="py-3">
                        <div className="font-bold text-theme-text">₹{Number(pay.amount).toFixed(2)}</div>
                        <div className="text-[10px] text-theme-text-secondary">{pay.payment_method}</div>
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={
                            pay.payment_status === 'SUCCESS'
                              ? 'success'
                              : pay.payment_status === 'REFUND'
                              ? 'error'
                              : 'warning'
                          }
                          size="sm"
                        >
                          {pay.payment_status}
                        </Badge>
                      </td>
                      <td className="py-3 font-mono text-[10px] text-theme-text-secondary">
                        <div>{pay.transaction_id}</div>
                        {pay.refund_transaction_id && (
                          <div className="text-rose-400 text-[9px]">Refund: {pay.refund_transaction_id}</div>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {pay.payment_status === 'SUCCESS' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRefundPayment(pay.payment_id)}
                            disabled={actionPaymentId === pay.payment_id}
                            className="text-rose-400 hover:text-rose-300 border-rose-800/40"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            {actionPaymentId === pay.payment_id ? 'Refunding...' : 'Refund'}
                          </Button>
                        ) : pay.payment_status === 'REFUND' ? (
                          <span className="text-[10px] text-rose-400 italic">Refunded</span>
                        ) : (
                          <span className="text-[10px] text-theme-text-secondary italic">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
