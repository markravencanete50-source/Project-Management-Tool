"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/types";

/**
 * Run a server action from a client component: shows a toast on error (and
 * optionally on success), refreshes the route on success, exposes pending.
 */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function execute<T>(
    action: () => Promise<ActionResult<T>>,
    opts: { success?: string; onSuccess?: (data: T) => void; refresh?: boolean } = {},
  ) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(res.data);
      if (opts.refresh !== false) router.refresh();
    });
  }

  return { pending, execute };
}
