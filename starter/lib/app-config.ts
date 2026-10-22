// The shape of app.config.ts. Kept here so app.config.ts (and the examples
// you copy over it) import the same type from the same place.

export type Suggestion = {
  /** The chip's main text. */
  title: string;
  /** Optional second line on the chip. */
  label?: string;
  /** The message sent when the chip is clicked. */
  prompt: string;
};

export type AppConfig = {
  /** Product name: page title, sidebar and welcome heading. */
  name: string;
  /** One sentence under the name. */
  description: string;
  /** Heading on an empty conversation. */
  greeting: string;
  /** Composer placeholder. */
  placeholder: string;
  /** Starter prompts on an empty conversation. Three or four work best. */
  suggestions: Suggestion[];
  /** Brand color for buttons and highlights, any CSS color. */
  accentColor: string;
  /** Text color on top of accentColor. */
  accentForeground: string;
  /** Small print under the conversation list. */
  footnote: string;
};
