"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type LoginState, loginAction } from "@/lib/auth/actions";
import { Button, Field, Input } from "@/components/ui/primitives";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      className="w-full"
      disabled={pending}
      // Width is preserved while loading so nothing shifts (docs/DESIGN.md §7.1).
    >
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({ next }: { next: string | null }) {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field label="Email" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </Field>

      <Field label="Password" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </Field>

      {state.error ? (
        // A single generic message — never reveals whether the account exists,
        // is suspended, or is locked (docs/CLAUDE.md §6).
        <p
          id="login-error"
          role="alert"
          aria-live="polite"
          className="rounded-[10px] border border-danger/40 bg-danger/12 px-3 py-2 text-sm font-medium text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
