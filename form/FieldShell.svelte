<script lang="ts">
  // The chrome every labelled field shares: fill, masked notched border, focus ring,
  // label, and slots for adornments and overlays. It owns NO value, NO validation and
  // NO agent wiring — consumers keep all of that and pass in only their control.
  //
  // Before this existed, Input / SearchSelect / DateInput / ColorPicker each repeated the
  // same six chrome elements, which is why their borders never quite agreed.
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { useUI } from "../runtime/index.js";
  import s from "./field-shell.module.css";
  import T from "../misc/T.svelte";

  const ui = useUI();

  // The drag handlers are spread onto the root with the data-* attributes: the whole field,
  // label and padding included, is the drop target of a file-dropping consumer.
  export interface IFieldShell extends Pick<HTMLAttributes<HTMLDivElement>,
    "ondragenter" | "ondragover" | "ondragleave" | "ondrop"> {
    label?: string;
    // bold = a 16px bold label, for forms filled on a phone where the 15px regular
    // label reads too faint next to the value.
    labelStyle?: "normal" | "bold";
    // Overrides the label's font size (px) set by labelStyle: the consumer decides when, e.g.
    // a smaller one for a long label.
    labelFontSize?: number;
    // top = embedded in the border's notch (default) · side = beside the box, outside it, for
    // filter rows that must stay one line tall · inline = inside the box before the value,
    // split from it by a bar. side and inline draw an unnotched box, like an unlabelled field.
    labelPosition?: "top" | "side" | "inline";
    // The consumer owns the *when*: Input only flags after the first blur, so a pristine
    // form does not greet the user with a wall of red.
    invalid?: boolean;
    disabled?: boolean;
    // Draws the focus look while the consumer's picker layer is open (focus is elsewhere then).
    active?: boolean;
    // Strength of the focus ring: the % of --accent-solid mixed into it (default 38).
    ringIntensity?: number;
    css?: string;
    // field = the standard notched box · bare = no chrome, fills the parent cell
    // (table cells that already draw their own borders) · pill = unlabelled rounded search box
    variant?: "field" | "bare" | "pill";
    // small = a 32px control for dense surfaces; the box fills it, so there is no notch room.
    size?: "normal" | "small";
    // Content grows instead of being vertically centred (textarea, colour picker).
    autoHeight?: boolean;
    children: Snippet<[{ controlId: string; controlClass: string }]>;
    // Inline after the label text (a small validity glyph). It is part of the label, so the
    // notch measured from the label grows to fit it.
    labelSuffix?: Snippet;
    prefix?: Snippet;
    suffix?: Snippet;
    // Dropdowns / calendars. Rendered inside the root, which is the positioned ancestor
    // they anchor against.
    overlay?: Snippet;
    // The data-* agent attributes are spread onto the root, so this component stays
    // unaware of the agent registry and each consumer keeps its own data-id / data-type.
    [dataAttribute: `data-${string}`]: string | number | undefined;
  }

  const {
    label,
    labelStyle = "normal",
    labelFontSize,
    labelPosition = "top",
    invalid,
    disabled,
    active,
    ringIntensity = 38,
    css,
    variant = "field",
    size = "normal",
    autoHeight,
    children,
    labelSuffix,
    prefix,
    suffix,
    overlay,
    ...restAttributes
  }: IFieldShell = $props();

  // Minting the id here is what makes <label for> correct by construction: a consumer
  // cannot forget to wire it, because the id only reaches it through the snippet.
  const controlId = `fld-${ui.nextComponentId()}`;

  // A label wider than the field wraps: every line but the last stands above the box, and the
  // last one is the label embedded in the border. Two measures do that: how far the last line
  // sits below the first (the box moves down by it, --label-extra) and the last line's width
  // (the notch). The bind:client* below are ResizeObservers under the hood, so both correct
  // themselves when the webfont finishes loading, the field resizes or the language switches.
  let labelElement = $state<HTMLLabelElement>();
  let labelTextElement = $state<HTMLSpanElement>();
  let labelWidth = $state(0);
  let labelHeight = $state(0);
  // The validity glyph comes and goes after the first blur without resizing the label (its first
  // line is the wider one): its own width is what re-measures the notch then.
  let labelSuffixWidth = $state(0);
  let lastLineWidth = $state(0);
  let labelExtraHeight = $state(0);
  // +4 = 2px of breathing room each side of the text.
  const notchWidth = $derived(lastLineWidth ? lastLineWidth + 4 : 0);

  // label and labelSuffixWidth are read so a new text or glyph of the same box size is measured again.
  $effect(() => {
    void labelSuffixWidth;
    if (!labelElement || !labelWidth || !labelHeight || !label) {
      lastLineWidth = 0;
      labelExtraHeight = 0;
      return;
    }
    const labelLines = measureLabelLines(labelElement);
    lastLineWidth = labelLines.lastLineWidth;
    labelExtraHeight = labelLines.lastLineOffset;
  });

  // The line boxes of the label's TEXT give the lines' tops: the validity glyph after it is smaller
  // and sits lower, so its top is not a line's. The last line's width does include the glyph.
  const measureLabelLines = (element: HTMLElement): { lastLineOffset: number; lastLineWidth: number } => {
    const textRange = document.createRange();
    textRange.selectNodeContents(labelTextElement || element);
    const textRects = [...textRange.getClientRects()].filter((rect) => rect.width > 0);
    if (textRects.length === 0) { return { lastLineOffset: 0, lastLineWidth: element.clientWidth }; }
    const firstLineTop = Math.min(...textRects.map((rect) => rect.top));
    const lastLineTop = Math.max(...textRects.map((rect) => rect.top));
    const labelRange = document.createRange();
    labelRange.selectNodeContents(element);
    const lastLineRects = [...labelRange.getClientRects()].filter((rect) => rect.width > 0 && rect.top >= lastLineTop - 2);
    const lastLineRight = Math.max(...lastLineRects.map((rect) => rect.right));
    return {
      lastLineOffset: Math.round(lastLineTop - firstLineTop),
      lastLineWidth: Math.min(Math.ceil(lastLineRight - element.getBoundingClientRect().left), element.clientWidth),
    };
  };

  // A label only draws in the default variant — bare has no chrome to notch, and pill is
  // the unlabelled search box.
  const showLabel = $derived(!!label && variant === "field");
  // Only the top label is cut into the border; side and inline leave the box unnotched.
  const showNotchLabel = $derived(showLabel && labelPosition === "top");
  const showSideLabel = $derived(showLabel && labelPosition === "side");
  const showInlineLabel = $derived(showLabel && labelPosition === "inline");
  const labelTextClass = $derived(labelStyle === "bold" ? "text-[16px] font-bold" : "text-[15px]");

  const rootClass = $derived(
    [
      s.field,
      // css stays on the field even with a side label: it sizes the box, and consumers pass
      // state flags through it (has-interactive-prefix…) that the module CSS reads off this root.
      css || "",
      showNotchLabel ? "" : "no-label",
      variant === "bare" ? "is-bare" : "",
      variant === "pill" ? "is-pill" : "",
      size === "small" ? "is-small" : "",
      invalid ? "is-invalid" : "",
      disabled ? "is-disabled" : "",
      active ? "is-active" : "",
      prefix ? "has-prefix" : "",
      suffix ? "has-suffix" : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
</script>

{#snippet plainLabel(labelClass: string)}
  <label class="{labelClass} {labelTextClass}" for={controlId} style:font-size={labelFontSize ? `${labelFontSize}px` : undefined}>
    <T text={label ?? ""} />{#if labelSuffix}{@render labelSuffix()}{/if}
  </label>
{/snippet}

{#snippet field()}
<div {...restAttributes} class={rootClass} style="--notch-w: {notchWidth}px; --label-extra: {labelExtraHeight}px; --ring-intensity: {ringIntensity}%">
  {#if variant !== "bare"}
    <!-- Decorative: fill + shadow here, masked border in ::before. -->
    <div class={s.box}></div>
  {/if}

  {#if showNotchLabel}
    <!-- `for` is what makes clicking the label focus the control. -->
    <label class="{s.lab} {labelStyle === 'bold' ? s.labBold : ''} {labelTextClass}" for={controlId} style:font-size={labelFontSize ? `${labelFontSize}px` : undefined} bind:this={labelElement} bind:clientWidth={labelWidth} bind:clientHeight={labelHeight}>
      <span bind:this={labelTextElement}><T text={label ?? ""} /></span>{#if labelSuffix}<span class="inline-block" bind:clientWidth={labelSuffixWidth}>{@render labelSuffix()}</span>{/if}
    </label>
  {/if}

  <div class="{s.row}{autoHeight ? ' is-textarea' : ''}">
    {#if showInlineLabel}
      {@render plainLabel(s.labInline)}
    {/if}
    {#if prefix}
      <div class={s.prefix}>{@render prefix()}</div>
    {/if}

    {@render children({ controlId, controlClass: s.inp })}

    {#if suffix}
      <div class={s.suffix}>{@render suffix()}</div>
    {/if}
  </div>

  {@render overlay?.()}
</div>
{/snippet}

{#if showSideLabel}
  <div class={s.sideLabelRow}>
    {@render plainLabel(s.labSide)}
    {@render field()}
  </div>
{:else}
  {@render field()}
{/if}
