import DefaultDemo from '@/components/ui/demo';

export const metadata = {
  title: 'Course & Design Cards — Rebranded Design System',
  description: 'Showcase of course design cards with new vibrant purple brand palette and gradients',
};

export default function CardsDemoPage() {
  return (
    <main className="min-h-screen bg-[#010117] text-white page-hero-gradient px-4 py-12 md:py-20">
      <div className="max-w-7xl mx-auto space-y-10">
        {/* Header */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold uppercase tracking-wider text-[#8F58FF]">
            <span>✨</span> New Brand Design System
          </div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight gradient-text">
            Course &amp; Design Cards
          </h1>
          <p className="text-base md:text-lg text-[#D9D9D9]/80">
            Interactive, responsive cards with vibrant status accents, smooth progress bars,
            stacked avatars, and ambient glow on dark surfaces.
          </p>
        </div>

        {/* Demo Cards Section */}
        <div className="card-glass p-6 md:p-10 rounded-2xl border border-white/10 shadow-2xl">
          <DefaultDemo />
        </div>

        {/* Global Gradient Styles Showcase */}
        <div className="pt-8 space-y-6">
          <h2 className="text-xl md:text-2xl font-bold gradient-text">
            Global Card &amp; Gradient Style System (All Pages)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card-brand">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8F58FF]">
                .card-brand
              </span>
              <h3 className="text-lg font-bold text-white mt-2 mb-1">Brand Elevated Card</h3>
              <p className="text-sm text-[#B6B6BA]">
                Clean `#0D0D1C` surface with purple tint hover border and ambient elevation.
              </p>
            </div>

            <div className="card-glass p-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8F58FF]">
                .card-glass
              </span>
              <h3 className="text-lg font-bold text-white mt-2 mb-1">Glassmorphism Card</h3>
              <p className="text-sm text-[#B6B6BA]">
                Translucent frosted backdrop blur with subtle White 10 border for modern hero sections.
              </p>
            </div>

            <div className="card-gradient-border p-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8F58FF]">
                .card-gradient-border
              </span>
              <h3 className="text-lg font-bold text-white mt-2 mb-1">Gradient Border Card</h3>
              <p className="text-sm text-[#B6B6BA]">
                Dynamic linear gradient border flowing from `#8F58FF` to `#7936FF`.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
