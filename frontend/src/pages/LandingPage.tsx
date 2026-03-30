import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  GalleryVertical,
  HardDrive,
  ShieldCheck,
  Share2,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { EnhancedGalleryCard } from '../components/dashboard/EnhancedGalleryCard';
import { AuthCard } from '../components/auth/AuthCard';
import type { Gallery } from '../types';
import { useAuthStore } from '../stores/authStore';
import { getDemoService } from '../services/demoService';
import { enableDemoMode } from '../lib/demoMode';
import reactLogo from '../assets/react.svg';

const featureItems = [
  {
    icon: UploadCloud,
    title: 'Fast uploads',
    description: 'Upload full shoots without extra steps or delays.',
  },
  {
    icon: Sparkles,
    title: 'Automatic previews',
    description: 'Galleries are ready to browse shortly after upload.',
  },
  {
    icon: Share2,
    title: 'Client-ready sharing',
    description: 'Share a gallery by link in a clean, polished format.',
  },
  {
    icon: HardDrive,
    title: 'Organized library',
    description: 'Keep projects structured and find the right shots in seconds.',
  },
  {
    icon: ShieldCheck,
    title: 'Link-based access',
    description: 'Share a gallery by link. Anyone with it can open the gallery.',
  },
  {
    icon: Clock3,
    title: 'Reliable every day',
    description: 'The service stays responsive as your workload grows.',
  },
];

const subscriptionCards = [
  {
    name: 'Starter',
    badge: 'For personal projects',
    points: ['Custom limits', 'Custom integrations', 'Email support'],
  },
  {
    name: 'Studio',
    badge: 'For teams and studios',
    points: ['Higher limits', 'Flexible access', 'Priority support'],
    highlighted: true,
  },
  {
    name: 'Enterprise',
    badge: 'For larger deployments',
    points: ['Custom SLA and retention policy', 'Dedicated environment', 'Implementation support'],
  },
];

const flowSteps = [
  'Create a gallery and add photos in a couple of clicks.',
  'Viewport prepares the gallery while you move on to the next task.',
  'Review the result and shape the presentation.',
  'Send the link to your client and give them a clear, polished viewing experience.',
];

const previewGallery: Gallery = {
  id: 'preview',
  owner_id: 'preview-owner',
  name: 'Spring Campaign - Lofoten',
  created_at: '2026-03-10T10:30:00Z',
  public_sort_by: 'original_filename',
  public_sort_order: 'asc',
  shooting_date: '2026-03-05',
  cover_photo_id: null,
  photo_count: 128,
  total_size_bytes: 1_200_000_000,
  has_active_share_links: true,
  cover_photo_thumbnail_url: reactLogo,
  recent_photo_thumbnail_urls: [reactLogo, reactLogo, reactLogo],
};

const previewCardVariants = {
  hidden: { opacity: 1, y: 0, scale: 1 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 340, damping: 26 },
  },
  exit: { opacity: 0.9, scale: 0.99, y: 0, transition: { duration: 0.15 } },
};

export const LandingPage = () => {
  const prefersReducedMotion = useReducedMotion();
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const renameInputRef = useRef<HTMLTextAreaElement>(null);

  const handleOpenDemoCabinet = () => {
    enableDemoMode();
    const demoService = getDemoService();
    login(demoService.getDemoUser(), demoService.getDemoTokens());
    navigate('/dashboard');
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface text-text dark:bg-surface-dark dark:text-accent-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-20 h-96 w-96 rounded-full bg-accent/15 blur-3xl dark:bg-accent/10" />
        <div className="absolute right-0 top-28 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl dark:bg-sky-400/10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(31,144,255,0.08),transparent_40%),radial-gradient(circle_at_80%_35%,rgba(14,165,233,0.1),transparent_35%)]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-border/50 bg-surface/80 backdrop-blur-xl dark:bg-surface-dark/75">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-oswald text-xl font-bold uppercase tracking-wider"
          >
            <Camera className="h-7 w-7 text-accent" />
            Viewport
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-muted md:flex">
            <a href="#features" className="hover:text-accent transition-colors">
              Features
            </a>
            <a href="#workflow" className="hover:text-accent transition-colors">
              Workflow
            </a>
            <a href="#subscriptions" className="hover:text-accent transition-colors">
              Plans
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeSwitch variant="inline" />
            <Link
              to="/auth/login"
              className="rounded-xl border border-border bg-surface-1 px-4 py-2 text-sm font-semibold hover:border-accent/40 hover:text-accent transition-all"
            >
              Log in
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:pt-24">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="space-y-7"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-sm font-semibold text-accent">
              <ShieldCheck className="h-4 w-4" />
              Built for photographers and studios
            </span>
            <h1 className="font-oswald text-5xl font-bold uppercase leading-[0.95] tracking-wide sm:text-6xl lg:text-7xl">
              Gallery delivery,
              <br />
              made simple
            </h1>
            <p className="max-w-2xl text-lg text-muted sm:text-xl">
              Viewport keeps the whole workflow in one place, from first upload to final delivery.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/auth/register"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 font-semibold text-accent-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all"
              >
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={handleOpenDemoCabinet}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-1 px-6 py-3.5 font-semibold text-text hover:border-accent/40 hover:text-accent transition-all"
              >
                Open demo dashboard
              </button>
            </div>
            <div className="grid max-w-xl grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-surface/70 p-4 dark:bg-surface-dark/40">
                <p className="font-oswald text-3xl font-bold uppercase">Fast</p>
                <p className="text-sm text-muted">Ready to show in minutes.</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-surface/70 p-4 dark:bg-surface-dark/40">
                <p className="font-oswald text-3xl font-bold uppercase">24/7</p>
                <p className="text-sm text-muted">Stable enough to stay out of the way.</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 35, rotate: -1.5 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut', delay: 0.1 }}
            className="rounded-3xl border border-border/50 bg-surface/70 p-4 shadow-xl backdrop-blur-sm dark:bg-surface-foreground/8"
          >
            <div className="rounded-2xl border border-border/40 bg-surface p-4 dark:bg-surface-dark/65">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-cuprum text-sm font-bold uppercase tracking-widest text-muted">
                  Dashboard preview
                </p>
                <GalleryVertical className="h-5 w-5 text-accent" />
              </div>
              <EnhancedGalleryCard
                gallery={previewGallery}
                isRenamingThis={false}
                renameInput=""
                isRenaming={false}
                renameInputRef={renameInputRef}
                onRenameInputChange={() => undefined}
                onConfirmRename={() => undefined}
                onCancelRename={() => undefined}
                onBeginRename={() => undefined}
                onDelete={() => undefined}
                onShare={() => undefined}
                variants={previewCardVariants}
              />
            </div>
          </motion.div>
        </section>

        <motion.section
          id="features"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
          whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="mx-auto w-full max-w-7xl px-4 pb-18 sm:px-6"
        >
          <div className="mb-8 max-w-3xl">
            <h2 className="font-oswald text-4xl font-bold uppercase tracking-wide sm:text-5xl">
              Core capabilities
            </h2>
            <p className="mt-3 text-lg text-muted">
              Everything you need to deliver polished galleries and keep your team moving.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featureItems.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="rounded-2xl border border-border/60 bg-surface/70 p-5 shadow-xs transition-transform hover:-translate-y-1 dark:bg-surface-foreground/8"
              >
                <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-xl font-bold text-text dark:text-accent-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
              </article>
            ))}
          </div>
        </motion.section>

        <motion.section
          id="workflow"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
          whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="mx-auto w-full max-w-7xl px-4 pb-18 sm:px-6"
        >
          <div className="rounded-3xl border border-border/60 bg-surface/80 p-6 dark:bg-surface-foreground/8 sm:p-8">
            <h2 className="font-oswald text-4xl font-bold uppercase tracking-wide sm:text-5xl">
              How it works
            </h2>
            <div className="mt-8 space-y-4">
              {flowSteps.map((step, index) => (
                <div
                  key={step}
                  className="flex items-start gap-4 rounded-xl border border-border/40 bg-surface-1/50 p-4 dark:bg-surface-dark/45"
                >
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-muted sm:text-base">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section
          id="subscriptions"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
          whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6"
        >
          <div className="mb-8 max-w-3xl">
            <h2 className="font-oswald text-4xl font-bold uppercase tracking-wide sm:text-5xl">
              Choose a plan
            </h2>
            <p className="mt-3 text-lg text-muted">
              Card templates without pricing or fixed plans. Swap in final content once positioning
              is set.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {subscriptionCards.map((card) => (
              <article
                key={card.name}
                className={`rounded-3xl border p-6 ${card.highlighted ? 'border-accent/40 bg-accent/8 shadow-md' : 'border-border/60 bg-surface/80 dark:bg-surface-foreground/8'}`}
              >
                <div className="mb-5 flex items-center justify-between gap-2">
                  <h3 className="font-oswald text-3xl font-bold uppercase tracking-wide">
                    {card.name}
                  </h3>
                  {card.highlighted ? (
                    <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-accent">
                      Recommended
                    </span>
                  ) : null}
                </div>
                <p className="mb-5 text-sm font-semibold text-muted">{card.badge}</p>
                <ul className="space-y-3 text-sm text-muted">
                  {card.points.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <button className="mt-6 w-full rounded-xl border border-border bg-surface-1 px-4 py-3 text-sm font-semibold hover:border-accent/40 hover:text-accent transition-colors dark:bg-surface-dark-1">
                  Use template
                </button>
              </article>
            ))}
          </div>
        </motion.section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6">
          <div className="rounded-3xl border border-border/60 bg-surface/85 p-6 dark:bg-surface-foreground/8 sm:p-8">
            <AuthCard
              title="Ready to deliver a cleaner client experience?"
              subtitle="Launch Viewport and keep the full client journey in one polished workflow"
            >
              <div className="space-y-4">
                <Link
                  to="/auth/register"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-foreground hover:brightness-110 transition-all"
                >
                  Create an account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </AuthCard>
          </div>
        </section>
      </main>
    </div>
  );
};
