'use client'

import { Streamdown } from 'streamdown'
import type { MermaidOptions } from 'streamdown'
import { useThemeStore } from '@/stores/useThemeStore'

interface MarkdownRendererProps {
  content: string
  isAnimating?: boolean
}

/**
 * MarkdownRenderer Component
 *
 * Renders markdown with Streamdown (optimized for AI streaming):
 * - Code blocks with Shiki syntax highlighting + LiquidGlass styling
 * - Styled headings with gradients
 * - Custom lists and blockquotes
 * - Tables, links, and inline code
 * - Mermaid diagrams and KaTeX math support
 */

/**
 * Preprocess content to filter out agent metadata and normalize formatting
 * - Removes [0x...] addresses that are meant for agent reference only
 * - Removes HTML comments containing quote IDs (invisible to user, readable by AI)
 * - Normalizes newlines (CRLF → LF) for consistent rendering
 */
function preprocessContent(content: string): string {
  // Normalize line breaks (Windows CRLF → Unix LF)
  let cleaned = content.replace(/\r\n/g, '\n');

  // Remove addresses in brackets (e.g., [0xABC123...])
  // Matches [0x followed by 40+ hex characters]
  cleaned = cleaned.replace(/\[0x[a-fA-F0-9]{40,}\]/g, '');

  // Remove HTML comments containing quote IDs
  // These are embedded by the AI for multi-turn context but hidden from users
  cleaned = cleaned.replace(/<!--QUOTE_ID:[^>]+-->/g, '');

  return cleaned;
}

// Mermaid theme configuration (light only - CSS filter handles dark mode)
const lightMermaidOptions: MermaidOptions = {
  config: {
    theme: 'default',
    themeVariables: {
      primaryColor: '#E07A5F',
      primaryTextColor: '#1a1a1a',
      primaryBorderColor: '#E07A5F',
      lineColor: '#333333',
      secondaryColor: '#F2A694',
      tertiaryColor: '#4A90A4',
      background: '#ffffff',
      mainBkg: '#f5f5f5',
      nodeBorder: '#E07A5F',
      clusterBkg: '#f0f0f0',
      clusterBorder: '#E07A5F',
      titleColor: '#1a1a1a',
      edgeLabelBackground: '#ffffff',
    }
  }
}

export function MarkdownRenderer({ content, isAnimating = false }: MarkdownRendererProps) {
  const { theme: pragmaTheme } = useThemeStore()
  const isDark = pragmaTheme === 'pragma-dark'

  // Always use light Mermaid theme - CSS filter handles dark mode
  // This prevents re-rendering when theme changes, preserving scroll position
  const mermaidOptions = lightMermaidOptions

  // Preprocess content to remove agent metadata
  const cleanContent = preprocessContent(content);

  // CSS to override Streamdown/Shiki's styles
  // Uses .dark class selector (applied to <html> by next-themes) for theme switching
  // This avoids re-rendering, preserving scroll position on theme change
  const codeBlockCSS = `
    /* ========== CODE BLOCKS ========== */
    /* Outer container - light mode default */
    .markdown-renderer [data-streamdown="code-block"] {
      margin: 1rem 0;
      border-radius: 1rem;
      overflow: hidden;
      border: none !important;
      background-color: #f6f8fa;
    }
    .dark .markdown-renderer [data-streamdown="code-block"] {
      background-color: #22272e;
    }

    /* Header - transparent, inherits outer bg */
    .markdown-renderer [data-streamdown="code-block-header"] {
      background-color: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0.75rem 1.25rem;
      font-family: 'IBM Plex Mono', ui-monospace, monospace;
      font-size: 0.75rem;
      color: rgba(0,0,0,0.4);
    }
    .dark .markdown-renderer [data-streamdown="code-block-header"] {
      color: rgba(255,255,255,0.5);
    }
    /* Hide header when no language is specified (empty span) */
    .markdown-renderer [data-streamdown="code-block-header"]:has(span:empty) {
      display: none !important;
    }
    .markdown-renderer [data-streamdown="code-block-header"]::before,
    .markdown-renderer [data-streamdown="code-block-header"]::after {
      display: none !important;
    }

    /* Inner pre - transparent to use outer container's bg */
    .markdown-renderer [data-streamdown="code-block-body"] {
      background-color: transparent !important;
      border: none !important;
      box-shadow: none !important;
      margin: 0;
      padding: 1.25rem;
      font-size: 0.875rem;
      line-height: 1.625;
    }
    .markdown-renderer [data-streamdown="code-block-body"]::before,
    .markdown-renderer [data-streamdown="code-block-body"]::after {
      display: none !important;
    }

    /* Code inside pre */
    .markdown-renderer [data-streamdown="code-block-body"] code {
      background: transparent !important;
      padding: 0;
      display: block;
      font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', ui-monospace, monospace;
    }
    /* Brighten colors in dark mode for visibility */
    .dark .markdown-renderer [data-streamdown="code-block-body"] code {
      filter: brightness(2.5);
    }

    /* Fallback for any pre not in code-block wrapper */
    .markdown-renderer pre:not([data-streamdown]) {
      margin: 1rem 0;
      border-radius: 1rem;
      overflow: hidden;
      padding: 1.25rem;
      background-color: #f3f4f6 !important;
    }
    .dark .markdown-renderer pre:not([data-streamdown]) {
      background-color: #2a2a2a !important;
    }

    /* Inline code (not in code blocks) */
    .markdown-renderer code:not([class*="language-"]) {
      padding: 0.125rem 0.375rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', ui-monospace, monospace;
      background-color: rgba(0,0,0,0.05);
    }
    .dark .markdown-renderer code:not([class*="language-"]) {
      background-color: rgba(255,255,255,0.1);
    }

    /* ========== TABLES ========== */
    .markdown-renderer table {
      font-family: 'IBM Plex Mono', ui-monospace, monospace;
      font-size: 0.85rem;
      font-feature-settings: 'tnum' 1;
      background: rgba(0,0,0,0.03);
    }
    .dark .markdown-renderer table {
      background: rgba(255,255,255,0.05);
    }
    .markdown-renderer thead {
      background: rgba(0,0,0,0.05);
    }
    .dark .markdown-renderer thead {
      background: rgba(255,255,255,0.1);
    }
    .markdown-renderer th,
    .markdown-renderer td {
      border-color: rgba(0,0,0,0.1);
    }
    .dark .markdown-renderer th,
    .dark .markdown-renderer td {
      border-color: rgba(255,255,255,0.1);
    }

    /* ========== BLOCKQUOTES ========== */
    .markdown-renderer blockquote {
      background: rgba(0,0,0,0.03);
    }
    .dark .markdown-renderer blockquote {
      background: rgba(255,255,255,0.05);
    }

    /* ========== HORIZONTAL RULES ========== */
    .markdown-renderer hr {
      background: rgba(0,0,0,0.1);
    }
    .dark .markdown-renderer hr {
      background: rgba(255,255,255,0.2);
    }

    /* ========== MERMAID DIAGRAMS ========== */
    .markdown-renderer .mermaid,
    .markdown-renderer [data-streamdown="mermaid-block"] {
      font-family: 'SF Pro Text', 'Inter', system-ui, -apple-system, sans-serif;
    }
    /* Invert all SVGs in mermaid block for dark mode */
    .dark .markdown-renderer [data-streamdown="mermaid-block"] svg {
      filter: invert(0.92) hue-rotate(180deg) saturate(0.85) brightness(0.95) !important;
    }
    /* Exclude control button icons from inversion (higher specificity) */
    .dark .markdown-renderer [data-streamdown="mermaid-block"] div button svg,
    .dark .markdown-renderer [data-streamdown="mermaid-block"] div [role="button"] svg,
    .dark .markdown-renderer [data-streamdown="mermaid-block"] .group button svg {
      filter: none !important;
    }
  `

  return (
    <>
      <style>{codeBlockCSS}</style>
      <div className={`markdown-renderer prose ${isDark ? 'prose-invert' : ''} max-w-none max-lg:break-words max-lg:overflow-hidden`}>
        <Streamdown
          isAnimating={isAnimating}
          mermaid={mermaidOptions}
          components={{
          // NOTE: We do NOT override 'pre' or 'code' - styled via CSS to avoid double Mermaid containers

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

          // Blockquotes - background handled by CSS (.dark selector)
          blockquote: ({ children }) => (
            <blockquote
              className="my-4 pl-4 border-l-4 border-[#F2A694]/50 italic opacity-80 rounded-lg"
              style={{ padding: '0.75rem 1rem' }}
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

          // Tables - backgrounds/borders handled by CSS (.dark selector)
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-2xl">
              <table className="w-full border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          th: ({ children }) => (
            <th className="px-4 py-2 text-left font-semibold border-b">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 border-b">{children}</td>
          ),

          // Horizontal rule - background handled by CSS (.dark selector)
          hr: () => <hr className="my-6 border-none h-px" />,

          // Strong/Bold
          strong: ({ children }) => (
            <strong className="font-semibold opacity-100">{children}</strong>
          ),

          // Emphasis/Italic
          em: ({ children }) => (
            <em className="italic opacity-95">{children}</em>
          ),
        }}
      >
        {cleanContent}
      </Streamdown>
      </div>
    </>
  )
}
