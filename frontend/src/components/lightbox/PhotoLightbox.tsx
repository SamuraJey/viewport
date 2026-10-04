import Lightbox, { type LightboxExternalProps } from 'yet-another-react-lightbox';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import Download from 'yet-another-react-lightbox/plugins/download';
import Video from 'yet-another-react-lightbox/plugins/video';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import { ProgressiveSlide } from '../ProgressiveSlide';

export default function PhotoLightbox(props: LightboxExternalProps) {
  return (
    <Lightbox
      {...props}
      plugins={[Thumbnails, Fullscreen, Download, Video, Zoom]}
      render={{ ...props.render, slideContainer: ProgressiveSlide }}
    />
  );
}
