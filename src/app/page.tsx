import fs from "fs";
import path from "path";
import Script from "next/script";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const bodyPath = path.join(process.cwd(), "src/app/clone-body.html");
  let bodyHtml = "";
  try {
    bodyHtml = fs.readFileSync(bodyPath, "utf8");
  } catch (error) {
    console.error("Failed to read clone-body.html:", error);
  }

  return (
    <>
      <div
        id="app-root"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
        suppressHydrationWarning
      />
      <Script src="/clone-app.js" strategy="afterInteractive" />
    </>
  );
}
