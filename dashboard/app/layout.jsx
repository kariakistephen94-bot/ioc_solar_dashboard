import { Geist } from "next/font/google";
import { IconDefaults } from "../components/icons";
import "./globals.css";
import "./imole.css";

// Self-hosted at build time: no request to Google from the browser, and no flash of a fallback font.
const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata = { title: "OIC Solar · Lead engine", description: "Find, message and follow up solar leads on WhatsApp." };
export default function RootLayout({ children }) {
  return (<html lang="en" className={sans.variable}><body><IconDefaults>{children}</IconDefaults></body></html>);
}
