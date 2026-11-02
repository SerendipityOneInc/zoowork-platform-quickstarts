// What the chat page says and looks like. Change these values to rebrand the
// app; no component code needs to change. This file is sent to the browser,
// so never put keys or private data here. The Agent itself is defined in
// agent/agent.md.

import type { AppConfig } from "@/lib/app-config";

export const appConfig: AppConfig = {
  name: "Knowledge Assistant",
  description: "Ask questions about Fernwick, a fictional project tracker. Answers come from its help documents, with sources.",
  greeting: "What do you want to know about Fernwick?",
  placeholder: "Ask about Fernwick…",
  suggestions: [
    { title: "Export links", label: "how long they last", prompt: "How long do export links last?" },
    { title: "Getting money back", label: "on a yearly plan", prompt: "Can I get my money back on a yearly plan?" },
    { title: "Offline use", label: "without internet", prompt: "Can I keep working in Fernwick without an internet connection?" },
  ],
  accentColor: "#0f766e",
  accentForeground: "#ffffff",
  // Optional logo from public/, e.g. "/logo.svg". Without it: the first letter of name.
  // icon: "/logo.svg",
  footnote: "Fernwick and its documents are fictional sample data. Replies can be wrong; open the sources to check.",
};
