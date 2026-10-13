import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daksina ERP",
  description: "Daksina Techno Fab & Engineering Contractor",
};

// Apply the saved theme before first paint (no flash)
const themeScript = `(function(){try{if(localStorage.getItem("theme")==="dark"){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
