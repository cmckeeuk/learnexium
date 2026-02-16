const LOCAL_IMAGE_BY_TOKEN: Record<string, number> = {
  'local://home/hero': require('../../../assets/content/home/hero.jpg'),
  'local://courses/test-course/thumbnail': require('../../../assets/content/courses/test-course/thumbnail.jpg'),
  'local://courses/test-course/lesson-1-image': require('../../../assets/content/courses/test-course/lesson-1-image.jpg'),
  'local://courses/test-course/author': require('../../../assets/content/courses/test-course/author.png'),
};

export function resolveLocalImageToken(
  value: string | number | undefined | null,
): string | number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  if (!value.startsWith('local://')) return value;
  return LOCAL_IMAGE_BY_TOKEN[value] ?? value;
}
