import { forwardRef, useId, type ComponentProps, type ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/cn";

/* ────────────────────────────────────────────────────────────────────────
 * Design-system primitives. All visual decisions come from tokens in app.css.
 * Shared by storefront and admin.
 * ──────────────────────────────────────────────────────────────────────── */

/*  Size scale (shared by buttons, inputs, selects, steppers):  sm 36px · md 44px · lg 52px
    Chips 32px. Icon buttons match the control height. */
const buttonBase =
  "btn-label inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-btn transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-out disabled:pointer-events-none disabled:opacity-45 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2";
const buttonVariants = {
  primary: "bg-primary text-on-primary hover:bg-[color-mix(in_oklab,var(--t-primary)_86%,var(--t-fg))] shadow-inset-btn",
  secondary: "border border-border-strong bg-transparent text-fg hover:border-fg",
  ghost: "text-fg hover:bg-muted",
  inverse: "bg-on-inverse text-inverse hover:opacity-90",
  outlineInverse: "border border-on-inverse/50 text-on-inverse hover:border-on-inverse hover:bg-on-inverse/10",
  danger: "bg-danger text-on-danger hover:opacity-90",
  link: "text-fg underline decoration-border-strong underline-offset-4 hover:decoration-fg px-0! h-auto! normal-case! tracking-normal!",
} as const;
const buttonSizes = {
  sm: "h-9 px-3.5 btn-text-sm",
  md: "h-11 px-5 btn-text-md",
  lg: "h-13 px-7 btn-text-lg",
  icon: "h-11 w-11",
  iconSm: "h-9 w-9",
} as const;

export type ButtonProps = { variant?: keyof typeof buttonVariants; size?: keyof typeof buttonSizes };

export function buttonClass({ variant = "primary", size = "md" }: ButtonProps = {}, className?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export const Button = forwardRef<HTMLButtonElement, ComponentProps<"button"> & ButtonProps>(function Button(
  { variant, size, className, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass({ variant, size }, className)} {...props} />;
});

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & ButtonProps) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}

export function Eyebrow({ className, children, line = false }: { className?: string; children: ReactNode; line?: boolean }) {
  return (
    <p className={cn("text-eyebrow flex items-center gap-3 text-muted-fg", className)}>
      {line && <span aria-hidden className="h-px w-8 bg-current opacity-60" />}
      {children}
    </p>
  );
}

/** Renders "\n" as line breaks — used for display headlines edited in admin. */
export function Lines({ text }: { text: string }) {
  const parts = text.split("\n");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-surface border border-border bg-surface", className)} {...props} />;
}

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: "neutral" | "primary" | "soft" | "outline" | "success" | "warning" | "danger" | "inverse" }) {
  const tones = {
    neutral: "bg-muted text-muted-fg",
    primary: "bg-primary text-on-primary",
    soft: "bg-primary-soft text-primary",
    outline: "border border-primary/35 bg-surface/95 text-primary backdrop-blur-sm",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    inverse: "bg-surface/95 text-fg border border-border",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.12em]", tones[tone], className)} {...props} />;
}

/* ── Forms ─────────────────────────────────────────────────────────────── */

const control =
  "file:mr-3 file:cursor-pointer file:rounded-badge file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-note file:font-medium file:text-fg hover:file:bg-border w-full rounded-control border border-border-strong/70 bg-surface px-3.5 text-body text-fg placeholder:text-muted-fg/70 transition-[border-color,box-shadow] duration-150 outline-none focus:border-fg focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--t-primary)_14%,transparent)] aria-[invalid=true]:border-danger disabled:bg-muted disabled:text-muted-fg";

const controlSizes = { sm: "h-9 px-3 text-sm", md: "h-11" } as const;
type ControlSize = { size?: keyof typeof controlSizes };

export const Input = forwardRef<HTMLInputElement, Omit<ComponentProps<"input">, "size"> & ControlSize>(function Input({ className, size = "md", ...props }, ref) {
  return <input ref={ref} className={cn(control, controlSizes[size], className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-28 py-3 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, Omit<ComponentProps<"select">, "size"> & ControlSize>(function Select({ className, children, size = "md", ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, controlSizes[size], "appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 12 8" className="pointer-events-none absolute right-4 top-1/2 h-2 w-3 -translate-y-1/2 text-muted-fg">
        <path d="m1 1.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
});

/** Label + control + hint/error. Pass the control as child; id is wired automatically. */
export function Field({
  label, hint, error, required, className, children, htmlFor,
}: { label: ReactNode; hint?: ReactNode; error?: string | null; required?: boolean; className?: string; children: (id: string) => ReactNode; htmlFor?: string }) {
  const auto = useId();
  const id = htmlFor ?? auto;
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      {/* fixed-height label row: controls in the same form row always line up */}
      <label htmlFor={id} className="text-field-label flex h-6 min-w-0 items-end" title={typeof label === "string" ? label : undefined}>
        <span className="truncate">{label}</span>
        {required && <span className="text-primary">&nbsp;*</span>}
      </label>
      {children(id)}
      {error ? <p className="text-note text-danger">{error}</p> : hint ? <p className="text-note text-muted-fg">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-sm leading-snug", className)}>
      <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded-badge accent-[var(--t-primary)]" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function RadioCard({ label, description, aside, className, ...props }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode; aside?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-4 rounded-control border border-border-strong/60 bg-surface px-4 py-3.5 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:shadow-[inset_0_0_0_1px_var(--t-primary)]", className)}>
      <input type="radio" className="h-[18px] w-[18px] accent-[var(--t-primary)]" {...props} />
      <span className="grid flex-1 gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-note text-muted-fg">{description}</span>}
      </span>
      {aside && <span className="text-sm font-medium tabular-nums">{aside}</span>}
    </label>
  );
}

/* ── Feedback ──────────────────────────────────────────────────────────── */

export function Notice({ tone = "neutral", children, className }: { tone?: "neutral" | "success" | "warning" | "danger"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-muted text-fg",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return <div role="status" className={cn("rounded-control px-4 py-3 text-sm leading-relaxed", tones[tone], className)}>{children}</div>;
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-surface border border-dashed border-border-strong/60 px-6 py-16 text-center">
      {icon && <div className="text-muted-fg">{icon}</div>}
      <h2 className="text-h3">{title}</h2>
      {text && <p className="max-w-sm text-sm text-muted-fg">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-border", className)} />;
}

export function SectionHeading({ eyebrow, title, action, className, center }: { eyebrow?: ReactNode; title: ReactNode; action?: ReactNode; className?: string; center?: boolean }) {
  return (
    <div className={cn("mb-10 flex gap-4", center ? "flex-col items-center text-center" : "flex-wrap items-end justify-between", className)}>
      <div className={cn("grid gap-3", center && "justify-items-center")}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="text-h2">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Stepper({ name, defaultValue = 1, min = 1, max = 9999, step = 1, size = "md", label, onChange }: { name: string; defaultValue?: number; min?: number; max?: number; step?: number; size?: "sm" | "md"; label: string; onChange?: (v: number) => void }) {
  const h = size === "sm" ? "h-9" : "h-11";
  const set = (input: HTMLInputElement, delta: number) => {
    const v = Math.min(max, Math.max(min, (Number(input.value) || 0) + delta));
    input.value = String(v);
    onChange?.(v);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  return (
    <div className={cn("inline-flex items-stretch rounded-control border border-border-strong/70 bg-surface", h)}>
      <button type="button" aria-label="−" className="w-9 text-muted-fg transition-colors hover:text-fg" onClick={(e) => set(e.currentTarget.nextElementSibling as HTMLInputElement, -step)}>
        −
      </button>
      <input
        name={name}
        type="number"
        inputMode="numeric"
        aria-label={label}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange?.(Number(e.currentTarget.value))}
        className="w-12 [appearance:textfield] border-0 bg-transparent text-center text-sm font-semibold tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" aria-label="+" className="w-9 text-muted-fg transition-colors hover:text-fg" onClick={(e) => set(e.currentTarget.previousElementSibling as HTMLInputElement, step)}>
        +
      </button>
    </div>
  );
}

/** Chip: filter tags, quick links, removable selections. Same shape & label rules as buttons. */
export function Chip({ active = false, removable = false, className, children, ...props }: ComponentProps<typeof Link> & { active?: boolean; removable?: boolean }) {
  return (
    <Link
      className={cn(
        "btn-label btn-text-sm inline-flex h-8 items-center gap-1.5 rounded-btn border px-3 transition-colors",
        active ? "border-primary bg-primary text-on-primary" : "border-border-strong/60 bg-surface text-fg hover:border-fg",
        className,
      )}
      {...props}
    >
      {children}
      {removable && <svg aria-hidden viewBox="0 0 12 12" className="h-2.5 w-2.5"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" /></svg>}
    </Link>
  );
}

/** Compact pagination: ‹ 1 … 4 5 6 … 57 › — never wider than a phone. */
export function Pagination({ page, pages, href, labels }: { page: number; pages: number; href: (n: number) => string; labels: { prev: string; next: string } }) {
  if (pages <= 1) return null;
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const nums = [...set].sort((a, b) => a - b);
  const item = "grid h-10 min-w-10 place-items-center rounded-btn px-2 text-sm tabular-nums transition-colors";
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="Pagination">
      <Link to={href(Math.max(1, page - 1))} aria-label={labels.prev} aria-disabled={page <= 1} className={cn(item, "hover:bg-muted", page <= 1 && "pointer-events-none opacity-30")}><ChevronLeftIcon /></Link>
      {nums.map((n, i) => (
        <span key={n} className="contents">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-muted-fg" aria-hidden>…</span>}
          <Link to={href(n)} aria-current={n === page ? "page" : undefined} className={cn(item, n === page ? "bg-fg text-bg" : "hover:bg-muted")}>{n}</Link>
        </span>
      ))}
      <Link to={href(Math.min(pages, page + 1))} aria-label={labels.next} aria-disabled={page >= pages} className={cn(item, "hover:bg-muted", page >= pages && "pointer-events-none opacity-30")}><ChevronLeftIcon className="rotate-180" /></Link>
    </nav>
  );
}
const ChevronLeftIcon = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="m15 18-6-6 6-6" /></svg>
);
