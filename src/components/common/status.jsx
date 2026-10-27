// src/components/common/status.jsx
// Status badge mappers driven by the domain constants (single source of truth).

import { Badge } from './ui';
import { STOCK_STATUS_META, EXPIRY_STATUS_META, TRANSFER_STATUS_META } from '../../utils/constants';
import { CheckCircle2, AlertTriangle, XCircle, TrendingUp, CalendarClock, CalendarX2, Truck, Ban, PackageCheck, Clock, Tag } from 'lucide-react';

export function StockBadge({ status }) {
  const meta = STOCK_STATUS_META[status] || { label: status, color: 'gray' };
  const Icon = status === 'in_stock' ? CheckCircle2 : status === 'overstocked' ? TrendingUp : status === 'low' ? AlertTriangle : XCircle;
  return <Badge color={meta.color} icon={Icon}>{meta.label}</Badge>;
}

export function ExpiryBadge({ status }) {
  const meta = EXPIRY_STATUS_META[status] || { label: status, color: 'gray' };
  const Icon = status === 'expired' ? CalendarX2 : status.startsWith('expiring') ? CalendarClock : status === 'healthy' ? CheckCircle2 : Tag;
  return <Badge color={meta.color} icon={Icon}>{meta.label}</Badge>;
}

export function TransferBadge({ status }) {
  const meta = TRANSFER_STATUS_META[status] || { label: status, color: 'gray' };
  const Icon = status === 'pending' ? Clock : status === 'in_transit' ? Truck : status === 'received' ? PackageCheck : Ban;
  return <Badge color={meta.color} icon={Icon}>{meta.label}</Badge>;
}
