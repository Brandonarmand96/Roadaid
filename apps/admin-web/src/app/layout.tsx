import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RoadAid Operations Dashboard',
  description: 'RoadAid roadside assistance administrative and dispatch console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
