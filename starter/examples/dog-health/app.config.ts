// Example branding for the dog care assistant. Copy to app.config.ts at the
// project root (together with agent.md) to use it.

import type { AppConfig } from "@/lib/app-config";

export const appConfig: AppConfig = {
  name: "Dog Care Assistant",
  description: "Everyday care questions for your dog. Not a substitute for a veterinarian.",
  greeting: "What would you like to know about your dog?",
  placeholder: "Ask about feeding, exercise, grooming, training…",
  suggestions: [
    { title: "How much should my puppy eat?", label: "a 4-month-old labrador", prompt: "How much and how often should I feed a 4-month-old labrador puppy?" },
    { title: "Is chocolate dangerous?", label: "my dog ate some", prompt: "My dog just ate some chocolate. What should I do?" },
    { title: "Brushing teeth", label: "how often, and how", prompt: "How often should I brush my dog's teeth, and how do I start?" },
  ],
  accentColor: "#0f766e",
  accentForeground: "#ffffff",
  footnote: "General information only. For a sick or injured dog, contact a veterinarian.",
};
