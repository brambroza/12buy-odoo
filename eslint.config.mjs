import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  { ignores: ['archive/**'] },
  ...nextVitals,
];

export default eslintConfig;
