<script lang="ts">
  // Renders parseMarkdown's tree as Svelte elements, never {@html}: the document's text stays
  // escaped and cannot inject HTML.
  import { parseMarkdown, type MdBlock, type MdInline } from './markdown-parser.ts'

  let { content, emptyText = '', css = '' }: {
    /** Raw Markdown (typically `import doc from './x.md?raw'`). */
    content: string
    /** Shown when there is no content. */
    emptyText?: string
    css?: string
  } = $props()

  const blocks = $derived(parseMarkdown(content))
</script>

{#snippet inlines(nodes: MdInline[])}
  {#each nodes as node}
    {#if node.type === 'text'}{node.text}
    {:else if node.type === 'code'}<code>{node.text}</code>
    {:else if node.type === 'bold'}<strong>{@render inlines(node.children)}</strong>
    {:else if node.type === 'italic'}<em>{@render inlines(node.children)}</em>
    {:else if node.type === 'strike'}<del>{@render inlines(node.children)}</del>
    {:else if node.type === 'link'}<a href={node.href} target="_blank" rel="noopener noreferrer">{@render inlines(node.children)}</a>
    {/if}
  {/each}
{/snippet}

{#snippet blockList(blockItems: MdBlock[])}
  {#each blockItems as block}
    {#if block.type === 'heading'}
      <svelte:element this={'h' + block.level}>{@render inlines(block.children)}</svelte:element>
    {:else if block.type === 'paragraph'}
      <p>{@render inlines(block.children)}</p>
    {:else if block.type === 'list'}
      <svelte:element this={block.ordered ? 'ol' : 'ul'} start={block.ordered ? block.start : undefined}>
        {#each block.items as item}
          <li>{@render inlines(item.content)}{#if item.children}{@render blockList(item.children)}{/if}</li>
        {/each}
      </svelte:element>
    {:else if block.type === 'code'}
      <pre><code>{block.text}</code></pre>
    {:else if block.type === 'quote'}
      <blockquote>{@render blockList(block.blocks)}</blockquote>
    {:else if block.type === 'hr'}
      <hr />
    {:else if block.type === 'table'}
      <table>
        <thead>
          <tr>
            {#each block.header as cell, columnIndex}
              <th style:text-align={block.align[columnIndex] || 'left'}>{@render inlines(cell)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each block.rows as row}
            <tr>
              {#each row as cell, columnIndex}
                <td style:text-align={block.align[columnIndex] || 'left'}>{@render inlines(cell)}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/each}
{/snippet}

{#if blocks.length === 0}
  {#if emptyText}<div class="md-empty {css}">{emptyText}</div>{/if}
{:else}
  <div class="md {css}">{@render blockList(blocks)}</div>
{/if}

<style>
  .md {
    color: #334155;
    font-size: 15px;
    line-height: 1.5;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .md > :global(:first-child) { margin-top: 0; }
  .md > :global(:last-child) { margin-bottom: 0; }

  .md :global(:is(h1, h2, h3, h4, h5, h6)) {
    color: #1e293b;
    font-weight: 700;
    line-height: 1.25;
    margin: 17px 0 7px;
  }
  .md :global(h1) { font-size: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .md :global(h2) { font-size: 18px; color: #1e40af; }
  .md :global(h3) { font-size: 16px; }
  .md :global(:is(h4, h5, h6)) { font-size: 15px; color: #475569; }

  .md :global(p) { margin: 8px 0; }

  .md :global(:is(ul, ol)) { margin: 6px 0; padding-left: 22px; }
  .md :global(ul) { list-style: disc; }
  .md :global(ol) { list-style: decimal; }
  .md :global(li) { margin: 3px 0; }
  .md :global(li > :is(ul, ol, p)) { margin: 2px 0; }

  .md :global(a) { color: #1d4ed8; text-decoration: underline; }
  .md :global(a:hover) { color: #1e40af; }
  .md :global(strong) { font-weight: 700; color: #1e293b; }
  .md :global(em) { font-style: italic; }
  .md :global(del) { text-decoration: line-through; color: #94a3b8; }

  .md :global(code) {
    background-color: #eef2ff;
    color: #3730a3;
    font-family: ui-monospace, monospace;
    font-size: 14px;
    padding: 1px 4px;
    border-radius: 4px;
  }
  .md :global(pre) {
    background-color: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 9px 11px;
    margin: 10px 0;
    overflow-x: auto;
  }
  .md :global(pre code) { background-color: transparent; color: #334155; padding: 0; white-space: pre; }

  .md :global(blockquote) {
    border-left: 3px solid #a5b4fc;
    background-color: #f8fafc;
    margin: 10px 0;
    padding: 6px 11px;
    color: #475569;
  }
  .md :global(hr) { border: none; border-top: 1px solid #e2e8f0; margin: 14px 0; }

  .md :global(table) { border-collapse: collapse; margin: 10px 0; width: 100%; font-size: 14px; }
  .md :global(:is(th, td)) { border: 1px solid #e2e8f0; padding: 4px 8px; vertical-align: top; }
  .md :global(th) { background-color: #eef2ff; color: #1e293b; font-weight: 600; }
  .md :global(tbody tr:nth-child(even)) { background-color: #f8fafc; }

  .md-empty { color: #64748b; font-size: 15px; text-align: left; }
</style>
