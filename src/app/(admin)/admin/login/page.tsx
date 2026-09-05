import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentAdmin, safeNextPath } from "@/lib/auth/current-admin";
import { LoginForm } from "./LoginForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  // Validated here AND again in the action — an open redirect is not a UI bug.
  const next = safeNextPath(rawNext);

  const admin = await getCurrentAdmin();
  if (admin) redirect(next ?? "/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          {/* The only thing on the page besides the form, so it gets the size
              a sign-in mark should have. */}
          <Image
            src="/brand/logo-576.png"
            alt="Prop Firm Lenz"
            width={576}
            height={288}
            priority
            className="h-20 w-auto"
          />
        </div>

        <div className="rounded-[14px] border border-border-default bg-bg-card p-6">
          <h1 className="text-lg font-semibold text-text-primary">
            Sign in to the admin
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Accounts are created by invitation. There is no self-registration.
          </p>

          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}
