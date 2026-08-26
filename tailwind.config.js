/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 绝色巴黎香槟主题：象牙白底 → 亮香槟金 → 古金，暖调奢华。
        brand: {
          50: '#FBF5EA', // 象牙香槟
          100: '#F4E8CF', // 奶油
          200: '#EAD2A2', // 浅香槟
          300: '#DDB874', // 柔金
          400: '#CDA050', // 亮香槟金（hero 气泡 / 徽标，配深色文字）
          500: '#946C29', // 古金（主按钮，白字，对比 ≥4.5:1）
          600: '#78571F', // hover
          700: '#5E4419', // pressed / 深边框
          800: '#423012',
          900: '#2A1E0B'
        }
      },
      boxShadow: {
        float: '0 8px 32px rgba(0,0,0,0.18)'
      }
    }
  },
  plugins: []
}
