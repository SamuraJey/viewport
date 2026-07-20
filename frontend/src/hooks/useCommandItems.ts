import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Share2 } from 'lucide-react';
import type { Command } from '../components/command/CommandRegistry';
import { projectService } from '../services/projectService';
import { shareLinkService } from '../services/shareLinkService';

export interface UseCommandItemsResult {
  projects: Command[];
  shareLinks: Command[];
  isLoading: boolean;
  error: string | null;
}

export function useCommandItems(options: { enabled: boolean }): UseCommandItemsResult {
  const { enabled } = options;
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Command[]>([]);
  const [shareLinks, setShareLinks] = useState<Command[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setProjects([]);
      setShareLinks([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchCommands = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [projectsSettled, shareLinksSettled] = await Promise.allSettled([
          projectService.getProjects(1, 5, { sort_by: 'created_at', order: 'desc' }),
          shareLinkService.getOwnerShareLinks(1, 5, undefined, 'active'),
        ]);

        if (cancelled) return;

        let failed = false;

        if (projectsSettled.status === 'fulfilled') {
          setProjects(
            projectsSettled.value.projects.map((p) => ({
              id: 'project:' + p.id,
              label: p.name,
              group: 'navigation',
              icon: FolderOpen,
              keywords: [p.name],
              perform: () => navigate('/projects/' + p.id),
            })),
          );
        } else {
          failed = true;
        }

        if (shareLinksSettled.status === 'fulfilled') {
          setShareLinks(
            shareLinksSettled.value.share_links.map((link) => ({
              id: 'sharelink:' + link.id,
              label: link.label || link.project_name || link.gallery_name || 'Share link',
              group: 'navigation',
              icon: Share2,
              keywords: [link.label, link.project_name, link.gallery_name].filter(
                (v): v is string => Boolean(v),
              ),
              perform: () => navigate('/share-links/' + link.id),
            })),
          );
        } else {
          failed = true;
        }

        if (failed) {
          setError('Failed to load commands');
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load commands');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchCommands();

    return () => {
      cancelled = true;
    };
  }, [enabled, navigate]);

  return { projects, shareLinks, isLoading, error };
}
