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

/** Where one document stands in the index. `pending` includes a document the index does not list yet. */
export type IndexedDocument = {
  key: string;
  state: "pending" | "ready" | "failed";
  /** Why a document failed, as a short code that is safe to print. */
  reason?: string;
};

/** A corpus this app uploads and later removes. Not needed for a service that is already populated. */
export interface KnowledgeIndex {
  exists(): Promise<boolean>;
  /** Create the index. Safe to repeat if an earlier response was lost. */
  create(): Promise<void>;
  /** Add a document, or replace the one with the same key. */
  upload(key: string, text: string): Promise<void>;
  removeDocument(key: string): Promise<void>;
  documents(): Promise<IndexedDocument[]>;
  /** Delete the index. Returns false if it was not there. */
  destroy(): Promise<boolean>;
}
