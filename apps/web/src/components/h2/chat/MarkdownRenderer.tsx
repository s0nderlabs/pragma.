'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useThemeStore } from '@/stores/useThemeStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import type { Components } from 'react-markdown'

interface MarkdownRendererProps {
  content: string
}

/**
 * MarkdownRenderer Component
 *
 * Renders markdown with custom styled components:
 * - Code blocks with syntax highlighting
 * - Styled headings with gradients
 * - Custom lists and blockquotes
 * - Tables, links, and inline code
 */

/**
 * Preprocess content to filter out agent metadata and normalize formatting
 * - Removes [0x...] addresses that are meant for agent reference only
 * - Normalizes newlines (CRLF → LF) for consistent rendering
 */
function preprocessContent(content: string): string {
  // Normalize line breaks (Windows CRLF → Unix LF)
  let cleaned = content.replace(/\r\n/g, '\n');

  // Remove addresses in brackets (e.g., [0xABC123...])
  // Matches [0x followed by 40+ hex characters]
  cleaned = cleaned.replace(/\[0x[a-fA-F0-9]{40,}\]/g, '');

  return cleaned;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const { theme } = useThemeStore()

  // Preprocess content to remove agent metadata
  const cleanContent = preprocessContent(content);

  const components: Components = {
    // Code blocks with syntax highlighting
    code: ({ inline, className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || '')
      const language = match ? match[1] : ''

      return !inline && language ? (
        <LiquidGlassPanel
          theme={theme}
          className="my-4 rounded-xl overflow-hidden"
          blurAmount={8}
          displacementScale={0.4}
          stdDeviation={0.03}
        >
          {/* Dark overlay for better text contrast */}
          <div
            className="relative"
            style={{
              background: 'color-mix(in srgb, var(--liquid-glass-dark) 85%, transparent)',
            }}
          >
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={language}
              PreTag="div"
              customStyle={{
                margin: 0,
                padding: '1.25rem',
                background: 'transparent',
                fontSize: '0.875rem',
                lineHeight: '1.5',
              }}
              {...props}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          </div>
        </LiquidGlassPanel>
      ) : (
        <code
          className="px-1.5 py-0.5 rounded-md text-sm font-mono"
          style={{
            background: 'color-mix(in srgb, var(--liquid-glass-color) 20%, transparent)',
          }}
          {...props}
        >
          {children}
        </code>
      )
    },

    // Headings with gradient effect
    h1: ({ children }) => (
      <h1
        className="text-2xl lg:text-3xl font-bold mt-6 mb-4 bg-gradient-to-r from-[#F2A694] to-blue-400 bg-clip-text text-transparent"
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-xl lg:text-2xl font-semibold mt-5 mb-3 opacity-95">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-lg lg:text-xl font-semibold mt-4 mb-2 opacity-90">
        {children}
      </h3>
    ),

    // Paragraphs
    p: ({ children }) => (
      <p className="mb-4 leading-relaxed opacity-90">{children}</p>
    ),

    // Lists
    ul: ({ children }) => (
      <ul className="mb-4 ml-6 space-y-2 list-disc marker:text-[#F2A694]">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-4 ml-6 space-y-2 list-decimal marker:text-[#F2A694]">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed opacity-90">{children}</li>
    ),

    // Blockquotes
    blockquote: ({ children }) => (
      <blockquote
        className="my-4 pl-4 border-l-4 border-[#F2A694]/50 italic opacity-80"
        style={{
          background: 'color-mix(in srgb, var(--liquid-glass-color) 8%, transparent)',
          padding: '0.75rem 1rem',
          borderRadius: '0.5rem',
        }}
      >
        {children}
      </blockquote>
    ),

    // Links
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#E07A5F] hover:text-[#F2A694] underline underline-offset-2 transition-colors"
      >
        {children}
      </a>
    ),

    // Tables
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto rounded-xl">
        <table
          className="w-full border-collapse"
          style={{
            background: 'color-mix(in srgb, var(--liquid-glass-color) 8%, transparent)',
          }}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead
        style={{
          background: 'color-mix(in srgb, var(--liquid-glass-color) 15%, transparent)',
        }}
      >
        {children}
      </thead>
    ),
    th: ({ children }) => (
      <th className="px-4 py-2 text-left font-semibold border-b border-white/10">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-4 py-2 border-b border-white/10">{children}</td>
    ),

    // Horizontal rule
    hr: () => (
      <hr
        className="my-6 border-none h-px"
        style={{
          background: 'color-mix(in srgb, var(--liquid-glass-color) 30%, transparent)',
        }}
      />
    ),

    // Strong/Bold
    strong: ({ children }) => (
      <strong className="font-semibold opacity-100">{children}</strong>
    ),

    // Emphasis/Italic
    em: ({ children }) => (
      <em className="italic opacity-95">{children}</em>
    ),
  }

  return (
    <div className="prose prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  )
}
