import { DM_Serif_Display, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = DM_Serif_Display({ variable: "--font-display-serif", weight: "400", subsets: ["latin"] });

export const metadata = {
  title: "Repayment Risk Scorer",
  description: "Explainable credit-risk scoring from repayment history.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full bg-paper text-ink">{children}</body>
    </html>
  );
}
