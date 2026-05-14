import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        lp: {
          bg: '#0B1323',
          panel: '#111A2E',
          cyan: '#22D3EE',
          emerald: '#4FA66A',
          amber: '#D8A42F',
          red: '#E05A4F',
          muted: '#9CA3AF',
          white: '#FFFFFF',
        },
        navy: '#0B1323',
        slatePanel: '#111A2E',
        lpCyan: '#22D3EE',
        lpEmerald: '#4FA66A',
        lpAmber: '#D8A42F',
        lpRed: '#E05A4F',
      },
      borderRadius: {
        lp: '22px',
        'lp-xl': '28px',
      },
      boxShadow: {
        'lp-glow': '0 0 0 1px rgba(34, 211, 238, 0.16), 0 24px 80px rgba(8, 47, 73, 0.24)',
        'lp-card': '0 24px 80px rgba(0, 0, 0, 0.34)',
      },
      maxWidth: {
        cockpit: '1536px',
      },
    },
  },
  plugins: [],
} satisfies Config;
