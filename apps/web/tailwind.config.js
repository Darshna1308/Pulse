/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#050816', 900: '#0A0F24', 800: '#10183A', 700: '#18224A', 600: '#243163', 500: '#34437A' },
        cyan: { 200: '#B5F8FF', 300: '#7DF3FF', 400: '#2EE6F5', 500: '#12C6DA', 600: '#0A9FB3', 700: '#087C8D', 800: '#0B5F6C' },
        violet: { 200: '#D9D0FF', 300: '#B8A6FF', 400: '#9C85FF', 500: '#7C5CFF', 600: '#6343E8', 700: '#4E33BF' },
        ink: { DEFAULT: '#0D1526', 2: '#3B4559', 3: '#667085', 4: '#98A2B3' },
        line: { DEFAULT: '#E4E8F0', strong: '#D0D6E2' },
        surface: { DEFAULT: '#F5F7FB', sunken: '#EEF1F6' },
        ok: { DEFAULT: '#12804A', soft: '#E7F6EE' },
        warn: { DEFAULT: '#A86A00', soft: '#FDF4E2' },
        serious: { DEFAULT: '#C2410C', soft: '#FDEEE5' },
        critical: { DEFAULT: '#C81E45', soft: '#FDE8EC' },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk Variable"', '"Inter Variable"', 'ui-sans-serif', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(13,21,38,0.05), 0 0 0 1px rgba(13,21,38,0.02)',
        pop: '0 12px 32px -8px rgba(13,21,38,0.18), 0 2px 6px rgba(13,21,38,0.06)',
        glow: '0 0 0 1px rgba(46,230,245,0.25), 0 0 32px -4px rgba(46,230,245,0.35)',
        'glow-violet': '0 0 40px -6px rgba(124,92,255,0.45)',
      },
      keyframes: {
        'pulse-ring': { '0%': { transform: 'scale(0.8)', opacity: '0.8' }, '100%': { transform: 'scale(2.4)', opacity: '0' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.2, 0.6, 0.3, 1) infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
