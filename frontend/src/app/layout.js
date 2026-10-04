import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata = {
  title: 'Konvert AI - Multi-Tenant AI Customer Support',
  description: 'AI Support Chatbot for modern businesses with ground-truth RAG knowledge base & human handoff.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-background text-foreground font-sans">
        <Sidebar />
        <main className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-10 py-8 w-full max-w-[1440px] mx-auto min-w-0 box-border">
          {children}
        </main>
      </body>
    </html>
  );
}
