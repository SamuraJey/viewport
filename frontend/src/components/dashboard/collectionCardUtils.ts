export const getCollectionTitleTextSizeClass = (title: string) =>
  title.length > 80
    ? 'text-sm leading-snug tracking-normal'
    : title.length > 34
      ? 'text-base leading-snug tracking-tight'
      : 'text-lg leading-tight tracking-wide';
