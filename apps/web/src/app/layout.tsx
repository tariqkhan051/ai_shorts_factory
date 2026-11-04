import type { Metadata } from 'next';
import { JetBrains_Mono, Sora } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import './globals.css';

const sora = Sora({
  variable: '--font-sora',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI Shorts Factory',
  description: 'Cloud-based short video production platform — idea to approved MP4.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${jetbrains.variable} font-sans antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
