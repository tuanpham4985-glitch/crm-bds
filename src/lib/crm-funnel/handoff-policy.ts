import type { QualificationStatus } from '../types';

export type HandoffAction = 'handoff' | 'accept' | 'reject';

const HANDOFF_ELIGIBLE_STATUSES: readonly QualificationStatus[] = ['INTERESTED', 'QUALIFIED', 'HOT'];

/**
 * Khách xác nhận QUAN TÂM (INTERESTED) đã đủ điều kiện bàn giao ngay cho Sale.
 * QUALIFIED/HOT là kết quả chấm điểm bổ sung cho Data chất lượng, không phải gate chặn handoff.
 */
export function isHandoffEligible(status?: QualificationStatus | string | null): boolean {
  return HANDOFF_ELIGIBLE_STATUSES.includes(status as QualificationStatus);
}

export function isOwnershipLocked(status?: string | null): boolean {
  return status === 'Đã nhận';
}

export function canActOnHandoff(input: {
  action: HandoffAction;
  isManager: boolean;
  isReceiver: boolean;
}): boolean {
  return input.action === 'handoff' ? input.isManager : input.isReceiver;
}

export function validRejectionReason(reason?: string | null): boolean {
  return String(reason || '').trim().length >= 3;
}
