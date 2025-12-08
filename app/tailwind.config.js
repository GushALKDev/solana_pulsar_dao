/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pulsar: {
          bg: '#050511', // Darker, deeper space black
          card: 'rgba(22, 24, 50, 0.7)', // Glassmorphism base
          primary: '#00f3ff', // Neon Cyan
          secondary: '#bc13fe', // Neon Purple
          accent: '#7000ff', // Deep Purple
          text: '#e0e6ed', // Soft White
          muted: '#94a3b8', // Muted Text
          success: '#00ff9d', // Neon Green
          danger: '#ff0055', // Neon Red
        }
      },
      fontFamily: {
        sans: ['Satoshi', 'sans-serif'],
        display: ['Satoshi', 'sans-serif'],
      },
      boxShadow: {
        'neon-blue': '0 0 5px #00f3ff, 0 0 20px rgba(0, 243, 255, 0.5)',
        'neon-purple': '0 0 5px #bc13fe, 0 0 20px rgba(188, 19, 254, 0.5)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      backgroundImage: {
        'space-gradient': 'radial-gradient(circle at center, #1a1c4b 0%, #050511 100%)',
        'card-gradient': 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      }
    },
  },
  plugins: [],
}
