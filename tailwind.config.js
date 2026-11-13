/** @type {import('tailwindcss').Config} */
const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const palette = (name) => Object.fromEntries(shades.map((shade) => [
  shade,
  `rgb(var(--color-${name}-${shade}) / <alpha-value>)`
]));
const spacingSteps = [
  'px', '0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8',
  '9', '10', '11', '12', '14', '16', '20', '24', '28', '32', '36', '40', '44',
  '48', '52', '56', '60', '64', '72', '80', '96'
];
const spacing = Object.fromEntries(spacingSteps.map((step) => [
  step,
  `var(--space-${step.replace('.', '-')})`
]));

export default {
  content: ['./index.html', './src/renderer/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: palette('navy'),
        indigo: palette('gold'),
        amber: palette('gold'),
        emerald: palette('success'),
        rose: palette('danger'),
        cyan: palette('info'),
        navy: palette('navy'),
        gold: palette('gold'),
        olive: palette('olive'),
        success: palette('success'),
        warning: palette('gold'),
        danger: palette('danger'),
        info: palette('info'),
        white: 'rgb(var(--color-white) / <alpha-value>)'
      },
      spacing,
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)'
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        '2xl': 'var(--shadow-2xl)'
      },
      transitionDuration: {
        150: 'var(--motion-fast)',
        200: 'var(--motion-standard)'
      },
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'Noto Sans Arabic', 'Tahoma', 'Arial', 'sans-serif']
      },
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.5' }],
        sm: ['0.9375rem', { lineHeight: '1.6' }],
        base: ['1rem', { lineHeight: '1.7' }]
      }
    }
  },
  plugins: []
};
