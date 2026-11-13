import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#0D3B66',
          orange: '#F4D35E',
          accent: '#EE964B',
          dark: '#0B132B',
        },
      },
    },
  },
  plugins: [],
};
export default config;
