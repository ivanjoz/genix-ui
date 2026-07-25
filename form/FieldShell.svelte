<script lang="ts">
  // The chrome every labelled field shares: fill, masked notched border, focus ring,
  // label, and slots for adornments and overlays. It owns NO value, NO validation and
  // NO agent wiring — consumers keep all of that and pass in only their control.
  //
  // Before this existed, Input / SearchSelect / DateInput / ColorPicker each repeated the
  // same six chrome elements, which is why their borders never quite agreed.
  import type { Snippet } from "svelte";
  import { useUI } from "../runtime/index.js";
  import s from "./field-shell.module.css";
  import T from "../misc/T.svelte";

  const ui = useUI();

  export interface IFieldShell {
    label?: string;
    // The consumer owns the *when*: Input only flags after the first blur, so a pristine
    // form does not greet the user with a wall of red.
    invalid?: boolean;
    disabled?: boolean;
    css?: string;
    // field = the standard notched box · bare = no chrome, fills the parent cell
    // (table cells that already draw their own borders) · pill = rounded grey search box
    variant?: "field" | "bare" | "pill";
    // Content grows instead of being vertically centred (textarea, colour picker).
    autoHeight?: boolean;
    children: Snippet<[{ controlId: string; controlClass: string }]>;
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
    invalid,
    disabled,
    css,
    variant = "field",
    autoHeight,
    children,
    prefix,
    suffix,
    overlay,
    ...restAttributes
  }: IFieldShell = $props();

  // Minting the id here is what makes <label for> correct by construction: a consumer
  // cannot forget to wire it, because the id only reaches it through the snippet.
  const controlId = `fld-${ui.nextComponentId()}`;

  // The mask needs the label's real width to size the notch. bind:clientWidth is a
  // ResizeObserver under the hood, so the gap also corrects itself when the webfont
  // finishes loading or the language switches and the string changes length.
  let labelWidth = $state(0);
  // +4 = 2px of breathing room each side of the text.
  const notchWidth = $derived(labelWidth ? labelWidth + 4 : 0);

  // A label only draws in the default variant — bare has no chrome to notch, and pill is
  // the unlabelled search box.
  const showLabel = $derived(!!label && variant === "field");

  const rootClass = $derived(
    [
      s.field,
      css || "",
      showLabel ? "" : "no-label",
      variant === "bare" ? "is-bare" : "",
      variant === "pill" ? "is-pill" : "",
      invalid ? "is-invalid" : "",
      disabled ? "is-disabled" : "",
      prefix ? "has-prefix" : "",
      suffix ? "has-suffix" : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
</script>

<div {...restAttributes} class={rootClass} style="--notch-w: {notchWidth}px">
  {#if variant !== "bare"}
    <!-- Decorative: fill + shadow here, masked border in ::before. -->
    <div class={s.box}></div>
  {/if}

  {#if showLabel}
    <!-- `for` is what makes clicking the label focus the control. -->
    <label class="{s.lab} text-[15px]" for={controlId} bind:clientWidth={labelWidth}>
      <T text={label ?? ""} />
    </label>
  {/if}

  <div class="{s.row}{autoHeight ? ' is-textarea' : ''}">
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
