import "./clone.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>Prop Firm Lenz — Compare Prop Trading Firms, Exclusive Deals &amp; Payout Tracker</title>
        <meta
          name="description"
          content="Compare 60+ prop trading firms, evaluation rules, real spreads, verified payout proof, and exclusive discount codes."
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=5"
        />
        <meta name="theme-color" content="#010117" />
        <link rel="canonical" href="https://propfirmlenz.com" />
        <link rel="icon" type="image/png" sizes="32x32" href="/brand/icon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/brand/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/brand/apple-icon-180.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
