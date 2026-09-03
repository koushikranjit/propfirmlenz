import { NotImplementedPage } from "@/components/admin/NotImplementedPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export default function Page() {
  return <NotImplementedPage href="/admin/users" />;
}
