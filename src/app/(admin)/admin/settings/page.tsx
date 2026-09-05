import { NotImplementedPage } from "@/components/admin/NotImplementedPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default function Page() {
  return <NotImplementedPage href="/admin/settings" />;
}
