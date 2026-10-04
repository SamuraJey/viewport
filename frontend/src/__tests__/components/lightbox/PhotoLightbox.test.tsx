import { expect, it, vi } from 'vitest';
import PhotoLightbox from '../../../components/lightbox/PhotoLightbox';
vi.mock('yet-another-react-lightbox', () => ({ default: 'Lightbox' }));
vi.mock('yet-another-react-lightbox/plugins/thumbnails', () => ({ default: 'Thumbnails' }));
vi.mock('yet-another-react-lightbox/plugins/fullscreen', () => ({ default: 'Fullscreen' }));
vi.mock('yet-another-react-lightbox/plugins/download', () => ({ default: 'Download' }));
vi.mock('yet-another-react-lightbox/plugins/video', () => ({ default: 'Video' }));
vi.mock('yet-another-react-lightbox/plugins/zoom', () => ({ default: 'Zoom' }));
vi.mock('../../../components/ProgressiveSlide', () => ({ ProgressiveSlide: 'ProgressiveSlide' }));
it('keeps all viewer features and progressive slide rendering in the deferred engine', () => {
  const controls = () => null;
  const viewer = PhotoLightbox({ open: true, render: { controls } });
  expect(viewer.props.plugins).toEqual(['Thumbnails', 'Fullscreen', 'Download', 'Video', 'Zoom']);
  expect(viewer.props.render).toEqual({ controls, slideContainer: 'ProgressiveSlide' });
});
