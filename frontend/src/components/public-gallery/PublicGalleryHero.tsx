import { useEffect, useState } from 'react';
import type { SharedGallery } from '../../services/shareLinkService';

interface PublicGalleryHeroProps {
  gallery: SharedGallery | null;
}

export const PublicGalleryHero = ({ gallery }: PublicGalleryHeroProps) => {
  const [isHeroFullLoaded, setIsHeroFullLoaded] = useState(false);

  useEffect(() => {
    setIsHeroFullLoaded(false);
  }, [gallery?.cover?.full_url]);

  if (!gallery?.cover) {
    return (
      <div className="text-center py-16">
        <h1 className="text-4xl font-bold text-text dark:text-accent-foreground mb-2">
          {gallery?.gallery_name || 'Shared Gallery'}
        </h1>
        {gallery?.photographer && (
          <p className="text-muted dark:text-text text-lg">By {gallery.photographer}</p>
        )}
      </div>
    );
  }

  return (
    <div className="pg-hero relative w-full text-accent-foreground">
      <img
        src={gallery.cover.thumbnail_url}
        alt="Gallery cover preview"
        crossOrigin="anonymous"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isHeroFullLoaded ? 'opacity-0' : 'opacity-100'}`}
      />

      <img
        src={gallery.cover.full_url}
        alt="Gallery cover"
        crossOrigin="anonymous"
        onLoad={() => setIsHeroFullLoaded(true)}
        onError={() => setIsHeroFullLoaded(true)}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${isHeroFullLoaded ? 'opacity-100' : 'opacity-0'}`}
      />

      <div className="pg-hero__overlay" />

      <div className="relative z-10 p-6">
        {gallery.date && <p className="text-sm pg-hero__meta mb-2">{gallery.date}</p>}
        <h1 className="pg-hero__title font-bold drop-shadow-lg">
          {gallery.gallery_name || 'Shared Gallery'}
        </h1>
        <div className="mt-4 text-lg pg-hero__meta">
          {gallery.photographer && <span>{gallery.photographer}</span>}
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <a
          href="#gallery-content"
          aria-label="Scroll to photos"
          className="w-10 h-10 border-2 border-white/70 rounded-full flex items-center justify-center animate-pulse hover:bg-white/20 transition-colors duration-200"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById('gallery-content')?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-5 h-5"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </a>
      </div>
    </div>
  );
};
