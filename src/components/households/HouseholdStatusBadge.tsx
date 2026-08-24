import React from 'react';
import { Clock, CheckCircle2, AlertCircle, X, FileText } from 'lucide-react';
import { HouseholdVerificationStatus } from '../../types';

export interface HouseholdStatusBadgeProps {
  status?: HouseholdVerificationStatus;
  isVerified?: boolean;
  pendingChangeRequest?: { status: string } | null;
  householdNumber?: string;
  className?: string;
}

export interface HouseholdStatusMeta {
  key: string;
  label: string;
  badgeClass: string;
  iconClass: string;
  Icon: React.ElementType;
  spinIcon?: boolean;
}

export function getHouseholdStatusMeta(
  status?: HouseholdVerificationStatus,
  isVerified?: boolean,
  pendingChangeRequest?: { status: string } | null,
  householdNumber?: string
): HouseholdStatusMeta {
  if (pendingChangeRequest && pendingChangeRequest.status === 'pending') {
    return {
      key: 'pending_change_request',
      label: 'Pending Change Request',
      badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      iconClass: 'text-indigo-600',
      Icon: Clock,
      spinIcon: true,
    };
  }

  const hasAssignedNumber = Boolean(
    householdNumber && householdNumber.trim() && householdNumber !== 'HH-PENDING'
  );

  if (
    isVerified ||
    status === 'approved' ||
    (hasAssignedNumber &&
      status !== 'draft' &&
      status !== 'changes_requested' &&
      status !== 'rejected')
  ) {
    return {
      key: 'approved',
      label: 'Verified / Registered',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconClass: 'text-emerald-600',
      Icon: CheckCircle2,
    };
  }

  if (status === 'pending_verification') {
    return {
      key: 'pending_verification',
      label: 'Pending Verification',
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
      iconClass: 'text-blue-600',
      Icon: Clock,
    };
  }

  if (status === 'changes_requested') {
    return {
      key: 'changes_requested',
      label: 'Changes Requested',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
      iconClass: 'text-amber-600',
      Icon: AlertCircle,
    };
  }

  if (status === 'rejected') {
    return {
      key: 'rejected',
      label: 'Rejected',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
      iconClass: 'text-rose-600',
      Icon: X,
    };
  }

  return {
    key: 'draft',
    label: 'Draft',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    iconClass: 'text-slate-500',
    Icon: FileText,
  };
}

export const HouseholdStatusBadge: React.FC<HouseholdStatusBadgeProps> = ({
  status,
  isVerified,
  pendingChangeRequest,
  householdNumber,
  className = '',
}) => {
  const meta = getHouseholdStatusMeta(status, isVerified, pendingChangeRequest, householdNumber);
  const { label, badgeClass, iconClass, Icon, spinIcon } = meta;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${badgeClass} ${className}`}
    >
      <Icon className={`w-3.5 h-3.5 mr-1 ${iconClass} ${spinIcon ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
};
