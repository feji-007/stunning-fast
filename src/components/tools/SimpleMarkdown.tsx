import React from 'react'

/** 打开外部链接：桌面走 shell.openExternal，Web 回退到 window.open */
export function openExternal(url: string) {
  if (!url) return
  try {
    const api = (window as any).api
    if (api?.openExternal) {
      void api.openExternal(url)
      return
    }
  } catch {
    // ignore
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** 行内解析：**加粗** 与 [文本](链接)；其余按纯文本渲染 */
function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i++}`} className="font-semibold text-gray-800">
          {token.slice(2, -2)}
        </strong>
      )
    } else {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      if (mm) {
        const [, label, href] = mm
        nodes.push(
          <button
            key={`${keyPrefix}-a-${i++}`}
            type="button"
            onClick={() => openExternal(href)}
            className="text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            {label}
          </button>
        )
      } else {
        nodes.push(token)
      }
    }
    last = m.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/**
 * 轻量 Markdown 渲染（不引入额外依赖）：
 * 支持标题、段落、加粗、链接、有序/无序列表、代码块。
 * 仅用于工具配置引导等受控内容。
 */
export default function SimpleMarkdown({ text }: { text: string }) {
  if (!text) return null
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let code: { lang: string; lines: string[] } | null = null
  let key = 0

  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag
        key={`l-${key++}`}
        className={`my-1.5 ml-4 space-y-1 text-xs leading-relaxed text-gray-600 ${
          list.ordered ? 'list-decimal' : 'list-disc'
        }`}
      >
        {list.items.map((it, idx) => (
          <li key={idx}>{parseInline(it, `li-${key}-${idx}`)}</li>
        ))}
      </Tag>
    )
    list = null
  }
  const flushCode = () => {
    if (!code) return
    blocks.push(
      <pre
        key={`c-${key++}`}
        className="my-2 overflow-x-auto rounded-lg bg-gray-900 px-3 py-2 text-[11px] leading-relaxed text-gray-100"
      >
        <code>{code.lines.join('\n')}</code>
      </pre>
    )
    code = null
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (line.trim().startsWith('```')) {
      if (code) {
        flushCode()
      } else {
        flushList()
        code = { lang: line.trim().slice(3), lines: [] }
      }
      continue
    }
    if (code) {
      code.lines.push(raw)
      continue
    }
    if (!line.trim()) {
      flushList()
      continue
    }
    const ordered = /^\s*\d+\.\s+/.test(line)
    const bullet = /^\s*[-*]\s+/.test(line)
    if (ordered || bullet) {
      const content = line.replace(/^\s*(?:\d+\.|[-*])\s+/, '')
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list.items.push(content)
      continue
    }
    flushList()
    if (/^#{1,6}\s+/.test(line)) {
      const level = (line.match(/^#+/) as RegExpMatchArray)[0].length
      blocks.push(
        <p
          key={`h-${key++}`}
          className={
            level <= 2
              ? 'mt-3 mb-1 text-sm font-semibold text-gray-800'
              : 'mt-2 mb-1 text-xs font-semibold text-gray-700'
          }
        >
          {parseInline(line.replace(/^#+\s+/, ''), `h-${key}`)}
        </p>
      )
    } else {
      blocks.push(
        <p key={`p-${key++}`} className="my-1 text-xs leading-relaxed text-gray-600">
          {parseInline(line, `p-${key}`)}
        </p>
      )
    }
  }
  flushList()
  flushCode()

  return <div className="simple-markdown">{blocks}</div>
}
