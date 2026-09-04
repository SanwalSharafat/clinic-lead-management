/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-page': 'var(--color-bg-page)',
        'surface': 'var(--color-surface)',
        'border': 'var(--color-border)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        'accent': 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-muted': 'var(--color-accent-muted)',
        'danger': 'var(--color-danger)',
        'danger-bg': 'var(--color-danger-bg)',
        'warning': 'var(--color-warning)',
        'warning-bg': 'var(--color-warning-bg)',
        'neutral-chart': 'var(--color-neutral-chart)',
      },
      borderRadius: {
        'card': '12px',
        'btn': '8px',
      }
    },
  },
  plugins: [],
}
