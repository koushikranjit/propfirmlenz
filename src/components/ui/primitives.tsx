import * as React from "react";

/**
 * Design-system primitives — docs/DESIGN.md §7, §14.
 *
 * The ONLY place base styling lives. Components reference design tokens via
 * Tailwind utilities mapped in globals.css; raw hex values never appear here
 * (enforced by an ESLint rule).
 *
 * Accessibility is built in, not bolted on: every interactive element has a
 * visible focus ring (§8), and status is never conveyed by colour alone (§2.5
 * rule 5).
 */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Button */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-medium " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-brand-cyan focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-bg-base disabled:pointer-events-none disabled:opacity-50";

const BUTTON_VARIANTS = {
  /** Gradient fill. ONE per view (docs/DESIGN.md §2.2). */
  primary:
    "bg-[image:var(--gradient-brand)] text-white hover:opacity-90 font-semibold",
  secondary:
    "bg-bg-elevated border border-border-default text-text-primary hover:bg-bg-card hover:border-border-strong",
  ghost: "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
  danger: "bg-danger/12 border border-danger/40 text-danger hover:bg-danger/20",
} as const;

const BUTTON_SIZES = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4",
  lg: "h-12 px-6",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "secondary", size = "md", className, type, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        // Explicit type: an untyped button inside a form submits it.
        type={type ?? "button"}
        className={cx(
          BUTTON_BASE,
          BUTTON_VARIANTS[variant],
          BUTTON_SIZES[size],
          className,
        )}
        {...props}
      />
    );
  },
);

/* -------------------------------------------------------------------- Card */

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        // Surface hierarchy comes from BORDERS: the official surfaces are
        // 1.00–1.11:1 apart in luminance (docs/DESIGN.md §2.5 finding 5).
        "rounded-[14px] border border-border-default bg-bg-card",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------- Badge */

const BADGE_TONES = {
  neutral: "bg-bg-elevated text-text-secondary border-border-default",
  success: "bg-success/12 text-success border-success/40",
  warning: "bg-warning/12 text-warning border-warning/40",
  danger: "bg-danger/12 text-danger border-danger/40",
  info: "bg-info/12 text-info border-info/40",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // Always carries TEXT, never colour alone (docs/DESIGN.md §2.5 rule 5).
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------- Field */

export interface FieldProps {
  label: string;
  htmlFor: string;
  /** Rendered below the control and linked via aria-describedby. */
  hint?: string;
  error?: string | undefined;
  required?: boolean;
  children: React.ReactNode;
}

/**
 * Label ABOVE the input — never placeholder-as-label (docs/DESIGN.md §7.6).
 * Errors are associated via aria-describedby and announced politely.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold uppercase tracking-wide text-text-secondary"
      >
        {label}
        {required ? (
          <span className="ml-1 font-normal text-text-muted">(required)</span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-xs font-medium text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  "w-full rounded-[10px] border border-border-default bg-bg-near-black px-3 py-2 " +
  "text-sm text-text-primary placeholder:text-text-muted " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base " +
  "disabled:opacity-50 aria-[invalid=true]:border-danger";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(CONTROL_BASE, className)} {...props} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(CONTROL_BASE, "min-h-24 resize-y", className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select ref={ref} className={cx(CONTROL_BASE, className)} {...props} />
  );
});

/* -------------------------------------------------------------- EmptyState */

/**
 * Honest empty states. "No prop firms yet" is a real answer — never a
 * fabricated count (docs/CLAUDE.md §3).
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/**
 * A value the database does not hold. NEVER substitute 0, "—" alone, or a
 * guess (docs/PROJECT.md §6.5 `[LOCKED]`).
 */
export function NotSpecified({ label = "Not specified" }: { label?: string }) {
  return <span className="text-sm italic text-text-metadata">{label}</span>;
}

/** A capability that genuinely does not exist yet. Honest, not a fake form. */
export function NotImplemented({
  feature,
  phase,
}: {
  feature: string;
  phase?: string;
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-border-default bg-bg-card px-6 py-12 text-center">
      <p className="text-sm font-semibold text-text-primary">
        {feature} is not implemented yet
      </p>
      <p className="mt-2 text-sm text-text-muted">
        {phase
          ? `Scheduled for ${phase}. Nothing is stored or displayed for it today.`
          : "Nothing is stored or displayed for it today."}
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- PageHeader */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
