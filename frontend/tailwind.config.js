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
