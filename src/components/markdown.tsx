"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders markdown text with GFM (tables, task lists, strikethrough, links). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-base [&_h2]:text-sm [&_li]:my-0.5 [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
