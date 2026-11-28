import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RoadAid — Roadside help, without the uncertainty',
  description: 'Verified fuel delivery, towing and vehicle lockout assistance in Abuja.',
  icons: { icon: '/roadaid-mark.svg' },
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
