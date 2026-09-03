import { NotImplementedPage } from "@/components/admin/NotImplementedPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Media" };

export default function Page() {
  return <NotImplementedPage href="/admin/media" />;
}
