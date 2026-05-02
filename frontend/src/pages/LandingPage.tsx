import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Camera,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  FolderKanban,
  Image as ImageIcon,
  Link2,
  LockKeyhole,
  MessageSquareHeart,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Zap,
} from 'lucide-react';
import { ReadabilitySettingsButton } from '../components/ReadabilitySettingsButton';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { SkipToContentLink } from '../components/a11y/SkipToContentLink';
import { useAuthStore } from '../stores/authStore';
import { getDemoService } from '../services/demoService';
import { enableDemoMode } from '../lib/demoMode';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const trustStats = [
  { value: '10k+', label: 'photos delivered in demo studios' },
  { value: '3 min', label: 'from upload to share-ready preview' },
  { value: '24/7', label: 'client access without manual handoff' },
];

const proofLogos = ['Editorial', 'Weddings', 'Commercial', 'Portraits', 'Events'];

const featureItems = [
  {
    icon: CloudUpload,
    title: 'Upload once, deliver faster',
    description:
      'Send full shoots straight into organized galleries while Viewport handles previews and delivery links.',
  },
  {
    icon: FolderKanban,
    title: 'Project-first organization',
    description:
      'Keep every gallery, direct-only link, and client-facing collection under the project it belongs to.',
  },
  {
    icon: Link2,
    title: 'Clean share links',
    description:
      'Create branded links for galleries or full projects, pause them, protect them, and update expiration when plans change.',
  },
  {
    icon: MessageSquareHeart,
    title: 'Client selections included',
    description:
      'Let clients shortlist favorites without spreadsheets, screenshots, or back-and-forth message threads.',
  },
  {
    icon: BarChart3,
    title: 'Actionable delivery insight',
    description:
      'See views, downloads, and selection progress so follow-ups happen at the right time.',
  },
  {
    icon: LockKeyhole,
    title: 'Owner-first controls',
    description:
      'Private notes stay private, public copy stays polished, and access can be managed link by link.',
  },
];

const workflowSteps = [
  {
    icon: CloudUpload,
    title: 'Upload the shoot',
    description: 'Create a project, add galleries, and upload the final selects or the full set.',
  },
  {
    icon: Sparkles,
    title: 'Shape the presentation',
    description:
      'Choose cover visuals, public descriptions, sorting, and client selection settings.',
  },
  {
    icon: MousePointerClick,
    title: 'Send one polished link',
    description: 'Share a direct gallery or a project link that opens cleanly on any device.',
  },
];

const planCards = [
  {
    name: 'Solo',
    price: 'Start simple',
    description: 'For photographers who want a cleaner client delivery flow.',
    points: ['Project galleries', 'Public share links', 'Selection shortlists'],
  },
  {
    name: 'Studio',
    price: 'Most popular',
    description: 'For small teams that deliver multiple shoots every week.',
    points: ['Everything in Solo', 'Project-level sharing', 'Analytics and exports'],
    highlighted: true,
  },
  {
    name: 'Custom',
    price: 'Scale with care',
    description: 'For larger teams with custom retention or rollout requirements.',
    points: ['Flexible limits', 'Operational support', 'Custom environment options'],
  },
];

const testimonials = [
  {
    quote:
      'Viewport turns delivery into part of the brand experience instead of one more admin chore.',
    name: 'Mira Jensen',
    role: 'Commercial photographer',
  },
  {
    quote: 'The client selection flow is simple enough that we no longer explain how to use it.',
    name: 'Leo Martin',
    role: 'Studio lead',
  },
];

const faqItems = [
  {
    question: 'Can I try it without setting up an account?',
    answer:
      'Yes. Open the demo dashboard to explore projects, galleries, sharing, and client flows.',
  },
  {
    question: 'Does it support private and public gallery copy?',
    answer:
      'Yes. Owner-only notes stay private while public descriptions power the shared client experience.',
  },
  {
    question: 'Can clients select favorites?',
    answer:
      'Yes. Share links can collect client selections and expose owner exports with gallery context.',
  },
];

const galleryTiles = [
  'from-accent/80 to-sky-300/80',
  'from-slate-800/90 to-accent/80',
  'from-amber-200/85 to-rose-300/80',
];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

const LandingPreview = () => (
  <div className="relative mx-auto w-full max-w-xl">
    <div className="absolute -inset-6 rounded-[2rem] bg-accent/20 blur-3xl dark:bg-accent/10" />
    <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-surface/90 p-3 shadow-2xl backdrop-blur-xl dark:bg-surface-dark/85">
      <div className="rounded-[1.5rem] border border-border/50 bg-surface-1/90 p-4 dark:bg-surface-dark-1/85">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-accent">
              Client delivery
            </p>
            <h2 className="mt-1 text-lg font-bold text-text">Northern Editorial</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-3 py-1 text-xs font-bold text-success">
            <span className="h-2 w-2 rounded-full bg-success" />
            Live link
          </span>
        </div>

        <div className="grid grid-cols-[1.2fr_0.8fr] gap-3">
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface shadow-sm">
            <div className="aspect-[4/3] bg-gradient-to-br from-slate-950 via-accent/70 to-sky-200" />
            <div className="space-y-2 p-3">
              <div className="h-2 w-2/3 rounded-full bg-text/20" />
              <div className="h-2 w-1/2 rounded-full bg-muted/20" />
            </div>
          </div>
          <div className="grid gap-3">
            {galleryTiles.map((tile) => (
              <div
                key={tile}
                className={`rounded-2xl border border-border/50 bg-gradient-to-br ${tile}`}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/50 bg-surface px-3 py-3 dark:bg-surface-dark">
            <p className="text-[0.68rem] font-bold uppercase tracking-widest text-muted">Views</p>
            <p className="mt-1 text-xl font-bold text-text">1,284</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-surface px-3 py-3 dark:bg-surface-dark">
            <p className="text-[0.68rem] font-bold uppercase tracking-widest text-muted">
              Selected
            </p>
            <p className="mt-1 text-xl font-bold text-text">42</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-surface px-3 py-3 dark:bg-surface-dark">
            <p className="text-[0.68rem] font-bold uppercase tracking-widest text-muted">
              Downloads
            </p>
            <p className="mt-1 text-xl font-bold text-text">318</p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 hidden rounded-2xl border border-border/60 bg-surface/95 p-3 shadow-xl backdrop-blur sm:block dark:bg-surface-dark/90">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <ImageIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-text">Preview ready</p>
            <p className="text-xs text-muted">128 photos processed</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const LandingPage = () => {
  useDocumentTitle('Viewport · Beautiful gallery delivery for photographers');
  const prefersReducedMotion = useReducedMotion();
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleOpenDemoCabinet = () => {
    enableDemoMode();
    const demoService = getDemoService();
    login(demoService.getDemoUser(), demoService.getDemoTokens());
    navigate('/dashboard');
  };

  const motionProps = prefersReducedMotion
    ? { initial: false as const }
    : {
        initial: 'hidden' as const,
        whileInView: 'visible' as const,
        viewport: { once: true, amount: 0.2 },
        variants: fadeUp,
        transition: { duration: 0.5, ease: 'easeOut' as const },
      };

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface text-text dark:bg-surface-dark dark:text-accent-foreground">
      <SkipToContentLink />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-[28rem] w-[28rem] rounded-full bg-accent/15 blur-3xl dark:bg-accent/10" />
        <div className="absolute right-[-10rem] top-32 h-[32rem] w-[32rem] rounded-full bg-sky-400/15 blur-3xl dark:bg-sky-400/10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_10%,rgba(31,144,255,0.10),transparent_35%),linear-gradient(180deg,transparent,rgba(31,144,255,0.04),transparent)]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-border/50 bg-surface/90 backdrop-blur-xl dark:border-border/35 dark:bg-surface-dark/85">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-oswald text-xl font-bold uppercase tracking-wider text-text transition-opacity hover:opacity-80 dark:text-accent-foreground"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-sm">
              <Camera className="h-5 w-5" />
            </span>
            Viewport
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-bold text-muted lg:flex">
            <a href="#features" className="transition-colors hover:text-accent">
              Features
            </a>
            <a href="#workflow" className="transition-colors hover:text-accent">
              Workflow
            </a>
            <a href="#pricing" className="transition-colors hover:text-accent">
              Plans
            </a>
            <a href="#faq" className="transition-colors hover:text-accent">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ReadabilitySettingsButton />
            <ThemeSwitch variant="inline" />
            <Link
              to="/auth/login"
              className="hidden rounded-xl border border-border bg-surface-1 px-4 py-2 text-sm font-bold text-text transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2 hover:text-accent sm:inline-flex dark:border-border/50 dark:bg-surface-dark-1 dark:text-accent-foreground dark:hover:bg-surface-dark-2"
            >
              Log in
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="relative z-10">
        <section className="mx-auto grid w-full max-w-7xl gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:pb-24 lg:pt-24">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="space-y-8"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-bold text-accent shadow-sm">
              <ShieldCheck className="h-4 w-4" />
              Built for photographers and studios
            </span>
            <div className="space-y-5">
              <h1 className="max-w-4xl font-oswald text-5xl font-bold uppercase leading-[0.92] tracking-wide sm:text-6xl lg:text-7xl">
                Deliver photo galleries that sell your studio twice.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted sm:text-xl">
                Viewport gives photographers a polished delivery workflow: fast uploads, beautiful
                client links, favorites, downloads, and clear analytics in one calm workspace.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/auth/register"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-4 text-base font-bold text-accent-foreground shadow-lg shadow-accent/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:brightness-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Start delivering better
                <ArrowRight className="h-5 w-5" />
              </Link>
              <button
                type="button"
                onClick={handleOpenDemoCabinet}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border bg-surface-1 px-6 py-4 text-base font-bold text-text transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-border/50 dark:bg-surface-dark-1 dark:text-accent-foreground dark:hover:bg-surface-dark-2"
              >
                Open demo dashboard
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {trustStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-3xl border border-border/60 bg-surface/80 p-4 shadow-xs backdrop-blur dark:border-border/40 dark:bg-surface-foreground/8"
                >
                  <p className="font-oswald text-3xl font-bold uppercase text-text dark:text-accent-foreground">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 32, scale: 0.98 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.65, ease: 'easeOut', delay: 0.08 }}
          >
            <LandingPreview />
          </motion.div>
        </section>

        <section
          aria-label="Trusted by photography teams"
          className="mx-auto max-w-7xl px-4 pb-16 sm:px-6"
        >
          <div className="rounded-3xl border border-border/60 bg-surface/70 px-5 py-4 shadow-xs backdrop-blur dark:border-border/40 dark:bg-surface-foreground/8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-muted">
                Built for real client delivery
              </p>
              <div className="flex flex-wrap gap-2">
                {proofLogos.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-border/60 bg-surface-1 px-3 py-1.5 text-sm font-semibold text-muted dark:border-border/40 dark:bg-surface-dark-1"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <motion.section
          id="features"
          {...motionProps}
          className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6"
        >
          <div className="mb-9 max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-accent">
              Why Viewport
            </p>
            <h2 className="mt-3 font-oswald text-4xl font-bold uppercase tracking-wide sm:text-5xl">
              Less admin. Better reveal.
            </h2>
            <p className="mt-4 text-lg leading-8 text-muted">
              A typical delivery workflow, refined around the moments that clients actually see.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featureItems.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="group rounded-3xl border border-border/60 bg-surface/80 p-6 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-accent/30 hover:shadow-lg dark:border-border/40 dark:bg-surface-foreground/8"
              >
                <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent transition-transform group-hover:scale-105">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="text-xl font-bold text-text dark:text-accent-foreground">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted">{description}</p>
              </article>
            ))}
          </div>
        </motion.section>

        <motion.section
          id="workflow"
          {...motionProps}
          className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6"
        >
          <div className="grid gap-6 rounded-[2rem] border border-border/60 bg-surface/85 p-6 shadow-xs backdrop-blur dark:border-border/40 dark:bg-surface-foreground/8 lg:grid-cols-[0.85fr_1.15fr] lg:p-8">
            <div className="space-y-4">
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-accent">Workflow</p>
              <h2 className="font-oswald text-4xl font-bold uppercase tracking-wide sm:text-5xl">
                From final edit to client yes.
              </h2>
              <p className="text-lg leading-8 text-muted">
                Viewport keeps the owner workspace operational and the public gallery intentionally
                quiet, focused, and easy to act on.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {workflowSteps.map(({ icon: Icon, title, description }, index) => (
                <article
                  key={title}
                  className="rounded-3xl border border-border/50 bg-surface p-5 dark:border-border/35 dark:bg-surface-dark"
                >
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-oswald text-3xl font-bold text-accent/35">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="font-bold text-text dark:text-accent-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section
          id="pricing"
          {...motionProps}
          className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6"
        >
          <div className="mb-9 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-accent">Plans</p>
              <h2 className="mt-3 font-oswald text-4xl font-bold uppercase tracking-wide sm:text-5xl">
                Start lean. Scale calmly.
              </h2>
              <p className="mt-4 text-lg leading-8 text-muted">
                Clear plan positioning without noisy price grids. Pick the workflow shape that fits
                your studio today.
              </p>
            </div>
            <Link
              to="/auth/register"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-accent/30 bg-accent/10 px-5 py-3 text-sm font-bold text-accent transition-all hover:-translate-y-0.5 hover:bg-accent/15"
            >
              Create account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {planCards.map((card) => (
              <article
                key={card.name}
                className={`relative overflow-hidden rounded-[2rem] border p-6 shadow-xs transition-all hover:-translate-y-1 hover:shadow-lg ${
                  card.highlighted
                    ? 'border-accent/45 bg-accent/10'
                    : 'border-border/60 bg-surface/85 dark:border-border/40 dark:bg-surface-foreground/8'
                }`}
              >
                {card.highlighted ? (
                  <div className="absolute right-5 top-5 rounded-full border border-accent/40 bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-foreground">
                    Recommended
                  </div>
                ) : null}
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-muted">
                  {card.price}
                </p>
                <h3 className="mt-4 font-oswald text-4xl font-bold uppercase tracking-wide text-text dark:text-accent-foreground">
                  {card.name}
                </h3>
                <p className="mt-3 min-h-14 text-sm leading-6 text-muted">{card.description}</p>
                <ul className="mt-6 space-y-3 text-sm text-muted">
                  {card.points.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/auth/register"
                  className="mt-7 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-text px-4 py-3 text-sm font-bold text-surface shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-accent dark:text-accent-foreground"
                >
                  Choose {card.name}
                </Link>
              </article>
            ))}
          </div>
        </motion.section>

        <motion.section {...motionProps} className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6">
          <div className="grid gap-5 lg:grid-cols-2">
            {testimonials.map((item) => (
              <figure
                key={item.name}
                className="rounded-[2rem] border border-border/60 bg-surface/85 p-6 shadow-xs dark:border-border/40 dark:bg-surface-foreground/8"
              >
                <div className="mb-5 flex gap-1 text-accent" aria-label="Five star rating">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <blockquote className="text-xl font-semibold leading-8 text-text dark:text-accent-foreground">
                  “{item.quote}”
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3 text-sm text-muted">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <Users className="h-5 w-5" />
                  </span>
                  <span>
                    <strong className="block text-text dark:text-accent-foreground">
                      {item.name}
                    </strong>
                    {item.role}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </motion.section>

        <motion.section
          id="faq"
          {...motionProps}
          className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6"
        >
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-accent">FAQ</p>
              <h2 className="mt-3 font-oswald text-4xl font-bold uppercase tracking-wide sm:text-5xl">
                Built for the delivery details.
              </h2>
            </div>
            <div className="space-y-3">
              {faqItems.map((item) => (
                <article
                  key={item.question}
                  className="rounded-3xl border border-border/60 bg-surface/85 p-5 dark:border-border/40 dark:bg-surface-foreground/8"
                >
                  <h3 className="font-bold text-text dark:text-accent-foreground">
                    {item.question}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-muted">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </motion.section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6">
          <div className="overflow-hidden rounded-[2rem] border border-accent/30 bg-text p-6 text-surface shadow-xl dark:bg-surface-foreground dark:text-surface-dark sm:p-8 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-surface/10 px-3 py-1 text-sm font-bold text-surface dark:text-surface-dark">
                  <Zap className="h-4 w-4" />
                  Ready when your next client gallery is
                </p>
                <h2 className="mt-5 max-w-3xl font-oswald text-4xl font-bold uppercase tracking-wide text-surface dark:text-surface-dark sm:text-5xl">
                  Make every delivery feel intentional.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-surface/75 dark:text-surface-dark/75">
                  Start with the live demo, then move into a workspace designed for modern photo
                  delivery.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link
                  to="/auth/register"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-4 font-bold text-accent-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:brightness-110"
                >
                  Start free
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <button
                  type="button"
                  onClick={handleOpenDemoCabinet}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-surface/25 bg-surface/10 px-6 py-4 font-bold text-surface transition-all hover:-translate-y-0.5 hover:bg-surface/15 dark:border-surface-dark/25 dark:bg-surface-dark/10 dark:text-surface-dark dark:hover:bg-surface-dark/15"
                >
                  Explore demo
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
