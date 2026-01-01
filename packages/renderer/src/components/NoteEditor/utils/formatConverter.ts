/**
 * 格式转换工具
 * 功能：在 Markdown 和 HTML 格式之间进行转换
 * 描述：用于在不同编辑器之间切换时保持内容格式一致
 */

/**
 * HTML 转 Markdown/纯文本
 * @param html HTML 格式的内容
 * @returns Markdown/纯文本格式的内容
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  
  let markdown = html;
  
  // 处理预格式化文本块（保留原始格式）
  markdown = markdown.replace(/<pre[^>]*class="preserve-format"[^>]*>([\s\S]*?)<\/pre>/gi, '$1');
  
  // 处理空段落（富文本编辑器用 <p></p> 或 <p><br></p> 表示空行）
  markdown = markdown.replace(/<p[^>]*><br\s*\/?><\/p>/gi, '\n');
  markdown = markdown.replace(/<p[^>]*><\/p>/gi, '\n');
  
  // 标题
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
  markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n');
  markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n');
  markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n');
  
  // 粗体和斜体
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  
  // 代码块
  markdown = markdown.replace(/<pre[^>]*><code[^>]*class="language-(\w+)"[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```$1\n$2\n```\n');
  markdown = markdown.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n');
  markdown = markdown.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```\n');
  
  // 内联代码
  markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  
  // 链接
  markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  
  // 图片
  markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  markdown = markdown.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)');
  markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');
  
  // 双向链接（富文本编辑器格式）
  markdown = markdown.replace(/<span[^>]*data-type="wikilink"[^>]*data-title="([^"]*)"[^>]*>.*?<\/span>/gi, '[[$1]]');
  
  // 标签（富文本编辑器格式）
  markdown = markdown.replace(/<span[^>]*data-type="tag"[^>]*data-tag="([^"]*)"[^>]*>.*?<\/span>/gi, '#$1');
  
  // 列表
  markdown = markdown.replace(/<ul[^>]*>/gi, '');
  markdown = markdown.replace(/<\/ul>/gi, '\n');
  markdown = markdown.replace(/<ol[^>]*>/gi, '');
  markdown = markdown.replace(/<\/ol>/gi, '\n');
  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  
  // 段落和换行 - 每个 <p> 标签后添加换行
  markdown = markdown.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n');
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
  markdown = markdown.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1\n');
  
  // 引用
  markdown = markdown.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const lines = content.replace(/<\/?p[^>]*>/gi, '').split('\n');
    return lines.map((line: string) => `> ${line}`).join('\n') + '\n';
  });
  
  // 高亮
  markdown = markdown.replace(/<mark[^>]*>(.*?)<\/mark>/gi, '==$1==');
  
  // 删除线
  markdown = markdown.replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~');
  markdown = markdown.replace(/<del[^>]*>(.*?)<\/del>/gi, '~~$1~~');
  
  // 水平分割线
  markdown = markdown.replace(/<hr[^>]*\/?>/gi, '\n---\n');
  
  // 清理剩余的 HTML 标签
  markdown = markdown.replace(/<[^>]+>/g, '');
  
  // 解码 HTML 实体
  markdown = markdown.replace(/&lt;/g, '<');
  markdown = markdown.replace(/&gt;/g, '>');
  markdown = markdown.replace(/&amp;/g, '&');
  markdown = markdown.replace(/&quot;/g, '"');
  markdown = markdown.replace(/&#39;/g, "'");
  markdown = markdown.replace(/&nbsp;/g, ' ');
  
  // 清理多余空行（但保留单个空行）
  markdown = markdown.replace(/\n{3,}/g, '\n\n');
  
  const result = markdown.trim();
  
  return result;
}

/**
 * Markdown/纯文本 转 HTML
 * 对于纯文本，保留原始格式（缩进、空白等）
 * @param text Markdown 或纯文本内容
 * @returns HTML 格式的内容
 */
export function markdownToHtml(text: string): string {
  if (!text) return '';
  
  // 如果内容没有换行符且不是 Markdown，直接返回段落
  if (!text.includes('\n') && !isMarkdownContent(text)) {
    return `<p>${escapeHtml(text)}</p>`;
  }
  
  let html = text;
  
  // 代码块（先处理，避免内部内容被其他规则影响）
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const index = codeBlocks.length;
    codeBlocks.push(`<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`);
    return `__CODE_BLOCK_${index}__`;
  });
  
  // 标题（从 h6 到 h1，避免 ## 被 # 先匹配）
  html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
  html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // 粗体和斜体（先处理组合，再处理单独的）
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  
  // 删除线
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  
  // 高亮
  html = html.replace(/==(.+?)==/g, '<mark>$1</mark>');
  
  // 内联代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // 图片 ![alt](url) - 必须在链接之前处理
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  
  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // 双向链接 [[笔记名]]
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<span data-type="wikilink" class="wikilink" data-title="$1">[[$1]]</span>');
  
  // 水平分割线（--- 或 *** 或 ___）- 必须在行首，且整行只有这些字符
  html = html.replace(/^([-*_])\1{2,}\s*$/gim, '<hr class="editor-hr">');
  
  // 处理列表、引用和段落
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  let inBlockquote = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const unorderedMatch = line.match(/^[-*+]\s+(.*)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    const blockquoteMatch = line.match(/^>\s*(.*)$/);
    
    // 处理引用块
    if (blockquoteMatch) {
      // 先关闭列表
      if (inList) {
        result.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      // 开始或继续引用块
      if (!inBlockquote) {
        result.push('<blockquote>');
        inBlockquote = true;
      }
      const quoteContent = blockquoteMatch[1] || '';
      if (quoteContent.trim()) {
        result.push(`<p>${quoteContent}</p>`);
      }
    } else if (unorderedMatch) {
      // 先关闭引用块
      if (inBlockquote) {
        result.push('</blockquote>');
        inBlockquote = false;
      }
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${unorderedMatch[1]}</li>`);
    } else if (orderedMatch) {
      // 先关闭引用块
      if (inBlockquote) {
        result.push('</blockquote>');
        inBlockquote = false;
      }
      if (!inList || listType !== 'ol') {
        if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${orderedMatch[1]}</li>`);
    } else {
      // 关闭引用块
      if (inBlockquote) {
        result.push('</blockquote>');
        inBlockquote = false;
      }
      if (inList) {
        result.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      
      // 检查是否已经是 HTML 标签
      if (line.match(/^<(h[1-6]|blockquote|pre|ul|ol|li|div|hr)/i) || 
          line.match(/__CODE_BLOCK_\d+__/) ||
          line.trim() === '') {
        result.push(line);
      } else if (line.trim()) {
        // 普通文本行转为段落
        result.push(`<p>${line.trim()}</p>`);
      }
    }
  }
  
  // 关闭未闭合的标签
  if (inBlockquote) {
    result.push('</blockquote>');
  }
  if (inList) {
    result.push(listType === 'ol' ? '</ol>' : '</ul>');
  }
  
  html = result.join('');
  
  // 恢复代码块
  codeBlocks.forEach((block, index) => {
    html = html.replace(`__CODE_BLOCK_${index}__`, block);
  });
  
  // 清理空段落
  html = html.replace(/<p><\/p>/g, '');
  
  return html;
}



/**
 * 转义 HTML 特殊字符
 * @param text 原始文本
 * @returns 转义后的文本
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 检测内容是否为 HTML 格式
 * @param content 内容字符串
 * @returns 是否为 HTML 格式
 */
export function isHtmlContent(content: string): boolean {
  if (!content) return false;
  // 检测是否以 HTML 标签开头（更严格的检测）
  // 只有当内容以 <p>, <div>, <h1> 等块级标签开头时才认为是 HTML
  const startsWithHtmlTag = /^\s*<(p|div|h[1-6]|ul|ol|blockquote|pre)[^>]*>/i.test(content);
  return startsWithHtmlTag;
}

/**
 * 检测内容是否为 Markdown 格式
 * @param content 内容字符串
 * @returns 是否为 Markdown 格式
 */
export function isMarkdownContent(content: string): boolean {
  if (!content) return false;
  
  // 如果内容包含多行，通常就是需要格式化的内容
  if (content.includes('\n')) {
    return true;
  }
  
  // 检测常见的 Markdown 语法
  const markdownPatterns = [
    /^#{1,6}\s/m,           // 标题
    /\*\*[^*]+\*\*/,        // 粗体
    /(?<!\*)\*[^*\n]+\*(?!\*)/,  // 斜体（排除粗体）
    /\[[^\]]+\]\([^)]+\)/,  // 链接 [text](url)
    /!\[[^\]]*\]\([^)]+\)/, // 图片 ![alt](url)
    /^[-*+]\s/m,            // 无序列表
    /^\d+\.\s/m,            // 有序列表
    /^>\s*/m,               // 引用（更宽松）
    /```[\s\S]*?```/,       // 代码块
    /`[^`\n]+`/,            // 内联代码
    /\[\[[^\]]+\]\]/,       // 双向链接
    /~~[^~]+~~/,            // 删除线
    /==[^=]+==/,            // 高亮
    /^[-*_]{3,}\s*$/m,      // 水平分割线
  ];
  
  return markdownPatterns.some(pattern => pattern.test(content));
}
