import type { Metadata } from 'next';
import '../apogee.css';
import Hero from '@/components/Hero';

export const metadata: Metadata = {
  title: 'Apogee',
  description: 'Elevate your essential data to new heights',
};

export default function ApogeePage() {
  return (
    <>
      <link
        href="https://db.onlinewebfonts.com/c/13ab13418f633c1b0516fed6e30bedbc?family=Suisse+Int%27l"
        rel="stylesheet"
      />
      <style>{`
        body {
          font-family: 'Suisse Intl', -apple-system, BlinkMacSystemFont, sans-serif !important;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          margin: 0;
          padding: 0;
          background: #080A19;
        }

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes fade-down {
          from { opacity: 0; transform: translateY(-16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes fade-left {
          from { opacity: 0; transform: translateX(-20px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        @keyframes fade-right {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        @keyframes fade-scale {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }

        @keyframes bar-grow {
          from { transform: scaleY(0); opacity: 0; }
          to   { transform: scaleY(1); opacity: 1; }
        }

        .animate-fade-up    { animation: fade-up    0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-down  { animation: fade-down  0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-left  { animation: fade-left  0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-right { animation: fade-right 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-scale { animation: fade-scale 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

        .animate-bar-grow {
          animation: bar-grow 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
      `}</style>
      <Hero />
    </>
  );
}
