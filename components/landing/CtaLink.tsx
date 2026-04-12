"use client";

import Link from "next/link";
import { trackLandingCTA } from "@/lib/analytics";

type Location = "hero" | "how_it_works" | "pricing" | "final";

export function CtaLink({
  href,
  location,
  className,
  children,
}: {
  href: string;
  location: Location;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} onClick={() => trackLandingCTA(location)} className={className}>
      {children}
    </Link>
  );
}
