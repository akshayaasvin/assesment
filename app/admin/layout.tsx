import type { Metadata } from "next";
import type { ReactNode } from "react";

// The admin panel keeps its branded browser-tab title; candidate pages use a neutral one.
export const metadata: Metadata = {
  title: "Assistlana Assessment Platform",
  description: "Online assessment management and candidate monitoring platform.",
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return children;
}
