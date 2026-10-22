import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { appConfig } from "@/app.config";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: appConfig.name,
  description: appConfig.description,
};

// The brand color from app.config.ts replaces the theme's primary color.
const brand = {
  "--primary": appConfig.accentColor,
  "--primary-foreground": appConfig.accentForeground,
  "--sidebar-primary": appConfig.accentColor,
  "--sidebar-primary-foreground": appConfig.accentForeground,
  "--ring": appConfig.accentColor,
} as CSSProperties;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" style={brand}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
