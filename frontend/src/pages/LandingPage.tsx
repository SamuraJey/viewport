import { Link, useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Camera,
  CircleCheckBig,
  ChevronRight,
  CloudUpload,
  FolderKanban,
  Link2,
  LockKeyhole,
  MessageSquareHeart,
  MousePointerClick,
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

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

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
      <header className="sticky top-0 z-50 border-b border-border/40 bg-surface/90 backdrop-blur-xl dark:border-border/30 dark:bg-surface-dark/85">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-oswald text-xl font-bold uppercase tracking-wider text-text transition-opacity hover:opacity-80 dark:text-accent-foreground"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent shadow-xs">
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
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ReadabilitySettingsButton />
            <ThemeSwitch variant="inline" />
            <Link
              to="/auth/login"
              className="inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-border/50 bg-surface-1/80 px-3 py-2 text-sm font-bold text-text transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2 hover:text-accent sm:px-4 dark:border-border/40 dark:bg-surface-dark-1/80 dark:text-accent-foreground dark:hover:bg-surface-dark-2"
            >
              Log in
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="relative z-10">
        <section className="mx-auto max-w-7xl px-3 pb-16 pt-3 sm:px-6 sm:pt-6 lg:pb-24">
          <div className="relative isolate flex min-h-[32rem] flex-col justify-end overflow-hidden rounded-2xl bg-black text-white sm:min-h-[36rem] lg:min-h-[40rem]">
            <img
              src={`${import.meta.env.BASE_URL}demo/mountain.webp`}
              alt="Snow-covered mountain summits beneath a clear blue sky"
              width={1800}
              height={1013}
              fetchPriority="high"
              className="absolute inset-0 -z-20 h-full w-full object-cover object-[62%_center]"
            />
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-black/90 via-black/50 to-transparent" />
            <div className="p-6 sm:p-10 lg:p-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.19em]">Built for photographers and studios</p>
              <h1 className="max-w-3xl text-balance font-oswald text-5xl leading-[1.02] tracking-tight sm:text-7xl lg:text-8xl">
                Your work, beautifully delivered.
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-white/95 sm:text-lg">
                Share a finished shoot in one gallery. Give clients a place to choose their favorites and download the final images.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" onClick={handleOpenDemoCabinet} className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-white px-5 font-bold text-black transition-colors hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                  Open demo dashboard <ArrowRight size={18} aria-hidden="true" />
                </button>
                <Link to="/auth/register" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-white/60 bg-black/30 px-5 font-bold text-white transition-colors hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                  Create studio account <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/25 px-6 py-3 text-sm sm:px-10 lg:px-16">
              <span>Northern Editorial</span>
              <a href={`${import.meta.env.BASE_URL}demo/mountain-credit.txt`} className="underline decoration-white/50 underline-offset-4">Mountain · Andy Betts</a>
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
                className="border-t border-border/60 py-6 sm:pr-6"
              >
                <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent ">
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
          <div className="grid gap-6 rounded-4xl border border-border/50 bg-surface/85 p-6 shadow-xs backdrop-blur dark:border-border/35 dark:bg-surface-foreground/6 lg:grid-cols-[0.85fr_1.15fr] lg:p-8">
            <div className="space-y-4">
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-accent">Workflow</p>
              <h2 className="font-oswald text-4xl font-bold uppercase tracking-wider sm:text-5xl">
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
                  className="rounded-3xl border border-border/40 bg-surface p-5 transition-all duration-200 hover:border-accent/25 hover:shadow-sm dark:border-border/30 dark:bg-surface-dark"
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
                className={`relative overflow-hidden rounded-4xl border p-6 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                  card.highlighted
                    ? 'border-accent/40 bg-accent/8'
                    : 'border-border/50 bg-surface/85 dark:border-border/35 dark:bg-surface-foreground/6'
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
                      <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
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
                className="rounded-4xl border border-border/60 bg-surface/85 p-6 shadow-xs dark:border-border/40 dark:bg-surface-foreground/8"
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

        <section
          aria-labelledby="landing-final-cta-title"
          className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6"
        >
          <div className="relative overflow-hidden rounded-4xl border border-border/50 bg-surface/90 p-6 text-text shadow-xl shadow-accent/8 backdrop-blur dark:border-border/35 dark:bg-surface-dark-1/90 dark:text-accent-foreground sm:p-8 lg:p-10">
            <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-accent/15 blur-3xl dark:bg-accent/10" />
            <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-accent/8 via-transparent to-surface-1/40 dark:to-surface-dark-2/30" />

            <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-sm font-bold text-accent">
                  <Zap className="h-4 w-4" />
                  Ready when your next client gallery is
                </p>
                <h2
                  id="landing-final-cta-title"
                  className="mt-5 max-w-3xl wrap-anywhere font-oswald text-4xl font-bold uppercase tracking-wide text-text dark:text-accent-foreground sm:text-5xl"
                >
                  Make every delivery feel intentional.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
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
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border/70 bg-surface-1/80 px-6 py-4 font-bold text-text transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2 hover:text-accent dark:border-border/50 dark:bg-surface-dark-2/70 dark:text-accent-foreground dark:hover:bg-surface-dark-2"
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
