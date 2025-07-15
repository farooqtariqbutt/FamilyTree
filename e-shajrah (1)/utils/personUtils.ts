import type { Person } from '../types.ts';

export const getFullName = (person?: Partial<Person> | null): string => {
  if (!person) {
    return '';
  }
  return [person.firstName, person.lastName, person.familyCast]
    .filter(Boolean)
    .join(' ');
};
