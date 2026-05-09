"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const interval = window.setInterval(() => {
      router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(interval);
  }, [router, seconds]);

  return null;
}
