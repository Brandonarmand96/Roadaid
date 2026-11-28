import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RoadAid Operations",
  description: "Secure RoadAid administration and dispatch console.",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
