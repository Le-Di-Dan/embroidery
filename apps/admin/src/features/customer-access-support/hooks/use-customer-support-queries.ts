'use client';

/**
 * The three server reads behind the support screen.
 *
 * All three are keyed by the resolved Customer id and all three are disabled
 * until there is one — a support screen with no Customer selected has nothing to
 * ask for, and firing the reads with an empty id would produce three refusals
 * the operator did not cause.
 *
 * They are three separate `useQuery` calls rather than one composite because
 * they fail and refresh independently: a revoke invalidates the grants alone, a
 * replay invalidates the notifications alone, and neither should re-fetch the
 * Customer record that did not change. That separation is what makes §24's
 * "invalidate only the affected query" expressible at all — and writing them out
 * individually keeps each one's response type exact, with no cast between the
 * query and the panel that renders it.
 *
 * No polling. `APP4-W01` owns delivery, and a screen that re-asked every few
 * seconds would be watching a worker it does not control while giving the
 * operator the impression that a queued replay is a delivered one.
 */
import { useQuery } from '@tanstack/react-query';
import type {
  AdminCustomerDetailResponse,
  AdminCustomerGrantsResponse,
  AdminNotificationIntentListResponse,
} from '@embroidery/api-client';

import { customerAccessKeys } from '../model/customer-access-keys';
import {
  fetchCustomerDetail,
  fetchCustomerGrants,
  fetchCustomerNotifications,
} from '../services/customer-access.service';

export interface CustomerSupportData {
  readonly customer: AdminCustomerDetailResponse | undefined;
  readonly grants: AdminCustomerGrantsResponse | undefined;
  readonly notifications: AdminNotificationIntentListResponse | undefined;
  /** True while the first load of any region is still outstanding. */
  readonly loading: boolean;
  /** True when any of the three reads failed. The screen shows one load error. */
  readonly failed: boolean;
  readonly refetch: () => void;
}

export function useCustomerSupportQueries(customerId: string | null): CustomerSupportData {
  const enabled = customerId !== null;
  const id = customerId ?? '';

  const customer = useQuery({
    queryKey: customerAccessKeys.customer(id),
    queryFn: ({ signal }) => fetchCustomerDetail(id, signal),
    enabled,
  });

  const grants = useQuery({
    queryKey: customerAccessKeys.grants(id),
    queryFn: ({ signal }) => fetchCustomerGrants(id, signal),
    enabled,
  });

  const notifications = useQuery({
    queryKey: customerAccessKeys.notifications(id),
    queryFn: ({ signal }) => fetchCustomerNotifications(id, signal),
    enabled,
  });

  return {
    customer: customer.data,
    grants: grants.data,
    notifications: notifications.data,
    loading: enabled && (customer.isPending || grants.isPending || notifications.isPending),
    failed: customer.isError || grants.isError || notifications.isError,
    refetch: () => {
      void customer.refetch();
      void grants.refetch();
      void notifications.refetch();
    },
  };
}
