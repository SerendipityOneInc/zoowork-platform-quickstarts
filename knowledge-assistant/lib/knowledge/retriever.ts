// The two contracts between this app and a knowledge service. The chat and the
// Agent only use `Retriever`; `npm run setup` and `npm run cleanup` use
// `KnowledgeIndex`. To use your own RAG, implement them in one file in place of
// cloudflare.ts (see "Use your own RAG" in the README).

/** One piece of a document that a search returned. */
export type Passage = {
  /** Stable document ID. The Agent cites it, and citations are checked against it. */
  key: string;
  title: string;
  text: string;
  score: number;
};

export interface Retriever {
  /** The best passages for a query, or an empty list. Failures throw; they are not an empty result. */
  search(query: string): Promise<Passage[]>;
}

export type IndexStats = { completed: number; queued: number; running: number; error: number };

/** A corpus this app uploads and later removes. Not needed for a service that is already populated. */
export interface KnowledgeIndex {
  /** Create the index if it does not exist. Safe to repeat. */
  ensure(): Promise<void>;
  /** Add a document, or replace the one with the same key. */
  upload(key: string, text: string): Promise<void>;
  removeDocument(key: string): Promise<void>;
  stats(): Promise<IndexStats>;
  destroy(): Promise<void>;
}
