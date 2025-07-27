/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                'oswald': ['Oswald', 'sans-serif'],
                'cuprum': ['Cuprum', 'PT Sans', 'sans-serif'],
            },
            colors: {
                primary: {
                    50: '#eff6ff',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                    900: '#1e3a8a',
                },
                gray: {
                    850: '#1f2937',
                    900: '#1e1e1e',
                    950: '#0f0f0f',
                },
            },
            spacing: {
                '18': '4.5rem',
                '88': '22rem',
            },
            backdropBlur: {
                'xs': '2px',
            },
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
    ],
}
