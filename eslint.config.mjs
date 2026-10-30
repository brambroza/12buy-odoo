import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  { ignores: ['archive/**', 'coverage/**', '.next/**'] },
  ...nextVitals,
];

export default eslintConfig;
