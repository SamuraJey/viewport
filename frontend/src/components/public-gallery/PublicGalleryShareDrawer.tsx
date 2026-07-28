import QRCode from 'react-qr-code';
import {
  Check,
  Copy,
  Mail,
  MessageCircle,
  QrCode,
  Share2,
  Smartphone,
} from 'lucide-react';

import { AppDrawer } from '../ui';

interface PublicGalleryShareDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrOpen: boolean;
  onQrOpenChange: (open: boolean) => void;
  galleryTitle: string;
  shareUrl: string;
  emailHref: string;
  smsHref: string;
  linkCopied: boolean;
  onCopyLink: () => void | Promise<unknown>;
  nativeShareSupported: boolean;
  nativeShareError: string;
  onShareViaDevice: () => void | Promise<void>;
  themeClassName: string;
}

const actionClassName =
  'group flex min-h-20 min-w-0 items-center gap-4 rounded-2xl border border-border/45 bg-surface-1 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent';

const iconClassName =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground';

export const PublicGalleryShareDrawer = ({
  open,
  onOpenChange,
  qrOpen,
  onQrOpenChange,
  galleryTitle,
  shareUrl,
  emailHref,
  smsHref,
  linkCopied,
  onCopyLink,
  nativeShareSupported,
  nativeShareError,
  onShareViaDevice,
  themeClassName,
}: PublicGalleryShareDrawerProps) => (
  <AppDrawer
    open={open}
    onOpenChange={onOpenChange}
    side="bottom"
    snapPoints={[0.5, 0.9]}
    width="md"
    title={`Share ${galleryTitle}`}
    description="Send the gallery in the format that works best for your client."
    eyebrow="Public gallery"
    icon={<Share2 className="h-5 w-5" />}
    className={`pg-public-page ${themeClassName}`}
    closeLabel="Close share gallery drawer"
  >
    <div className="grid gap-3 sm:grid-cols-2">
      {nativeShareSupported ? (
        <button
          type="button"
          onClick={() => void onShareViaDevice()}
          className={actionClassName}
        >
          <span className={iconClassName}>
            <Smartphone className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-text">Share via device</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted">
              Open your system share sheet
            </span>
          </span>
        </button>
      ) : null}

      <button type="button" onClick={() => void onCopyLink()} className={actionClassName}>
        <span className={iconClassName}>
          {linkCopied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-text">
            {linkCopied ? 'Link copied' : 'Copy link'}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-muted">
            Ready to paste anywhere
          </span>
        </span>
      </button>

      <a href={emailHref} className={actionClassName}>
        <span className={iconClassName}>
          <Mail className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-text">Email</span>
          <span className="mt-0.5 block text-xs leading-5 text-muted">Open your mail app</span>
        </span>
      </a>

      <a href={smsHref} className={actionClassName}>
        <span className={iconClassName}>
          <MessageCircle className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-text">SMS</span>
          <span className="mt-0.5 block text-xs leading-5 text-muted">
            Send from your phone
          </span>
        </span>
      </a>

      <AppDrawer
        nested
        open={qrOpen}
        onOpenChange={onQrOpenChange}
        side="bottom"
        snapPoints={[0.65, 0.92]}
        width="sm"
        title="QR code"
        description="Keep this link card open while transferring the gallery to another device."
        eyebrow="Scan to open"
        icon={<QrCode className="h-5 w-5" />}
        className={`pg-public-page ${themeClassName}`}
        closeLabel="Close QR code drawer"
        trigger={
          <button type="button" className={actionClassName}>
            <span className={iconClassName}>
              <QrCode className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-text">QR code</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted">
                Open a scan-friendly link card
              </span>
            </span>
          </button>
        }
      >
        <div className="mx-auto max-w-sm rounded-[2rem] border border-border/45 bg-surface-1 p-6 text-center shadow-sm">
          <div className="mx-auto w-44 rounded-[1.75rem] bg-white p-4 shadow-inner">
            <QRCode
              value={shareUrl}
              title={`QR code for ${galleryTitle}`}
              level="M"
              size={176}
              bgColor="#ffffff"
              fgColor="#111827"
              className="h-auto w-full"
            />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-muted">
            Gallery link
          </p>
          <p className="mt-2 break-all rounded-xl bg-surface px-3 py-2 font-mono text-xs leading-5 text-text">
            {shareUrl}
          </p>
          <button
            type="button"
            onClick={() => void onCopyLink()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {linkCopied ? 'Copied' : 'Copy gallery link'}
          </button>
        </div>
      </AppDrawer>
    </div>

    <div role="status" aria-live="polite" aria-atomic="true">
      {nativeShareError ? (
        <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {nativeShareError}
        </p>
      ) : null}
    </div>
  </AppDrawer>
);
