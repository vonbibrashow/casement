/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Workspace chrome — closer to VS Code / Obsidian than a browser.
        surface: {
          DEFAULT: '#1b1d23',
          raised: '#232630',
          sunken: '#141519',
          border: '#2e323d'
        },
        accent: {
          DEFAULT: '#6d8cff',
          muted: '#3b4b8a'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
}
