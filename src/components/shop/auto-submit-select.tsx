'use client';

import type { ComponentProps } from 'react';

/** `<select>` that submits its form as soon as the choice changes (e.g. the search sort order). */
export function AutoSubmitSelect(props: Omit<ComponentProps<'select'>, 'onChange'>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
