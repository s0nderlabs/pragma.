import type { Metadata } from "next";
import { Raleway, IBM_Plex_Mono } from "next/font/google";
import "@/styles/globals.css";
import { LenisProvider } from "@/components/ui/LenisProvider";

const raleway = Raleway({
  subsets: ["latin"],
  weight: ["200", "300", "400"],
  variable: "--font-raleway",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pragma - Natural Language Interface for Crypto",
  description:
    "The future of DeFi is conversational. Swap, stake, and trade NFTs using natural language on Monad.",
  keywords: ["DeFi", "crypto", "Monad", "blockchain", "natural language", "AI"],
  authors: [{ name: "Pragma" }],
  openGraph: {
    title: "Pragma - Natural Language Interface for Crypto",
    description:
      "The future of DeFi is conversational. Swap, stake, and trade NFTs using natural language on Monad.",
    type: "website",
    url: "https://pr4gma.xyz",
    siteName: "Pragma",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pragma - Natural Language Interface for Crypto",
    description:
      "The future of DeFi is conversational. Swap, stake, and trade NFTs using natural language on Monad.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${raleway.variable} ${ibmPlexMono.variable}`}>
      <body className="antialiased">
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  );
}
