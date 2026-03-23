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
import { DashboardGalleryCard } from '../components/dashboard/DashboardGalleryCard';
import { AuthCard } from '../components/auth/AuthCard';
import type { Gallery } from '../types';
import { useAuthStore } from '../stores/authStore';
import { getDemoService } from '../services/demoService';
import { enableDemoMode } from '../lib/demoMode';

const featureItems = [
  {
    icon: UploadCloud,
    title: 'Быстрая загрузка фото',
    description: 'Добавляйте целые серии снимков без лишних шагов и задержек.',
  },
  {
    icon: Sparkles,
    title: 'Превью без ручной рутины',
    description: 'Галереи быстро становятся удобными для просмотра сразу после загрузки.',
  },
  {
    icon: Share2,
    title: 'Публичные галереи для клиентов',
    description: 'Делитесь съемками по ссылке и презентуйте материал в аккуратном формате.',
  },
  {
    icon: HardDrive,
    title: 'Порядок в медиатеке',
    description: 'Храните проекты структурированно и возвращайтесь к нужным кадрам за секунды.',
  },
  {
    icon: ShieldCheck,
    title: 'Доступ по уникальной ссылке',
    description: 'Делитесь галереей по ссылке: открыть ее может любой, у кого есть ссылка.',
  },
  {
    icon: Clock3,
    title: 'Стабильная работа каждый день',
    description: 'Сервис остается отзывчивым даже когда проектов становится больше.',
  },
];

const subscriptionCards = [
  {
    name: 'Starter',
    badge: 'Для личных проектов',
    points: ['Базовые лимиты уточняются', 'Интеграции уточняются', 'Поддержка по email'],
  },
  {
    name: 'Studio',
    badge: 'Для команд и продакшена',
    points: ['Расширенные лимиты уточняются', 'Гибкий доступ уточняется', 'Приоритетная поддержка'],
    highlighted: true,
  },
  {
    name: 'Enterprise',
    badge: 'Для больших инфраструктур',
    points: [
      'SLA и политика хранения уточняются',
      'Выделенная среда уточняется',
      'Сопровождение внедрения',
    ],
  },
];

const flowSteps = [
  'Создаете галерею и добавляете фотографии в пару кликов.',
  'Viewport готовит материалы к просмотру, пока вы занимаетесь следующими задачами.',
  'Проверяете результат и приводите галерею к нужной подаче.',
  'Отправляете ссылку клиенту и получаете понятный, приятный опыт просмотра.',
];

const previewGallery: Gallery = {
  id: 'preview',
  owner_id: 'preview-owner',
  name: 'Spring Campaign - Lofoten',
  created_at: '2026-03-10T10:30:00Z',
  shooting_date: '2026-03-05T09:00:00Z',
  cover_photo_id: null,
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
  const renameInputRef = useRef<HTMLInputElement>(null);

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
              Возможности
            </a>
            <a href="#workflow" className="hover:text-accent transition-colors">
              Процесс
            </a>
            <a href="#subscriptions" className="hover:text-accent transition-colors">
              Подписки
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeSwitch variant="inline" />
            <Link
              to="/auth/login"
              className="rounded-xl border border-border bg-surface-1 px-4 py-2 text-sm font-semibold hover:border-accent/40 hover:text-accent transition-all"
            >
              Войти
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
              Платформа для фотографов и команд
            </span>
            <h1 className="font-oswald text-5xl font-bold uppercase leading-[0.95] tracking-wide sm:text-6xl lg:text-7xl">
              Продавайте впечатление
              <br />
              до первой фотографии
            </h1>
            <p className="max-w-2xl text-lg text-muted sm:text-xl">
              Viewport помогает собрать весь путь работы с галереями в одном месте: от первых кадров
              до финальной презентации клиенту. Быстро, аккуратно и без лишней рутины.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/auth/register"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 font-semibold text-accent-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all"
              >
                Начать бесплатно
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={handleOpenDemoCabinet}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-1 px-6 py-3.5 font-semibold text-text hover:border-accent/40 hover:text-accent transition-all"
              >
                Открыть демо-кабинет
              </button>
            </div>
            <div className="grid max-w-xl grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-surface/70 p-4 dark:bg-surface-dark/40">
                <p className="font-oswald text-3xl font-bold uppercase">Fast</p>
                <p className="text-sm text-muted">Галерея готова к показу за считанные минуты.</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-surface/70 p-4 dark:bg-surface-dark/40">
                <p className="font-oswald text-3xl font-bold uppercase">24/7</p>
                <p className="text-sm text-muted">
                  Стабильный сервис, который не отвлекает от съемки.
                </p>
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
                  Реальный UI из дашборда
                </p>
                <GalleryVertical className="h-5 w-5 text-accent" />
              </div>
              <DashboardGalleryCard
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
              Возможности платформы
            </h2>
            <p className="mt-3 text-lg text-muted">
              Все, что нужно для красивой выдачи фотографий клиентам и уверенной работы команды.
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
              Как это работает
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
              Выбор подписки
            </h2>
            <p className="mt-3 text-lg text-muted">
              Шаблон карточек без цен и жестких планов: можно быстро заменить контент после
              финального позиционирования.
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
                  Выбрать шаблон
                </button>
              </article>
            ))}
          </div>
        </motion.section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6">
          <div className="rounded-3xl border border-border/60 bg-surface/85 p-6 dark:bg-surface-foreground/8 sm:p-8">
            <AuthCard
              title="Готовы показать клиентам идеальный опыт?"
              subtitle="Запустите Viewport и соберите весь клиентский путь в одном аккуратном пространстве"
            >
              <div className="space-y-4">
                <Link
                  to="/auth/register"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-foreground hover:brightness-110 transition-all"
                >
                  Создать аккаунт
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="text-center text-sm text-muted">
                  Без обязательств. Контент и цены добавите позже.
                </p>
              </div>
            </AuthCard>
          </div>
        </section>
      </main>
    </div>
  );
};
