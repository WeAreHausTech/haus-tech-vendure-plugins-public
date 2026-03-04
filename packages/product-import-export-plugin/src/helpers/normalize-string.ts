import slug from 'slug'

export function normalizeString(input = '', spaceReplacer = '-', languageCode?: string): string {
  return slug(input, {
    replacement: spaceReplacer,
    fallback: false,
    locale: languageCode,
    charmap: { å: 'a', ä: 'a', ö: 'o' },
  })
}
