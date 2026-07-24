import { useEffect, useRef, useState } from 'react';

import { handleApiError } from '../lib/errorHandling';
import { projectService } from '../services/projectService';
import type { Project } from '../types';

interface UseCreateProjectModalOptions {
  onCreated: (project: Project) => void;
  onError: (message: string) => void;
}

export const useCreateProjectModal = ({ onCreated, onError }: UseCreateProjectModalOptions) => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [shootingDate, setShootingDate] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const open = () => {
    setName('');
    setShootingDate(new Date().toISOString().slice(0, 10));
    onError('');
    setIsOpen(true);
  };

  const close = () => setIsOpen(false);

  const save = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      const project = await projectService.createProject({
        name: name.trim(),
        shooting_date: shootingDate || undefined,
      });
      setIsOpen(false);
      onCreated(project);
    } catch (err) {
      onError(handleApiError(err).message || 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  return {
    close,
    inputRef,
    isCreating,
    isOpen,
    name,
    open,
    save,
    setName,
    setShootingDate,
    shootingDate,
  };
};

interface UseRenameProjectModalOptions {
  onError: (message: string) => void;
  onSaved: () => Promise<void>;
}

export const useRenameProjectModal = ({ onError, onSaved }: UseRenameProjectModalOptions) => {
  const [project, setProject] = useState<Project | null>(null);
  const [value, setValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const open = (nextProject: Project) => {
    setProject(nextProject);
    setValue(nextProject.name);
  };

  const close = () => {
    if (!isSaving) setProject(null);
  };

  const save = async () => {
    if (!project || !value.trim()) return;
    setIsSaving(true);
    try {
      await projectService.updateProject(project.id, { name: value.trim() });
      setProject(null);
      await onSaved();
    } catch (err) {
      onError(handleApiError(err).message || 'Failed to rename project');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    close,
    isOpen: Boolean(project),
    isSaving,
    open,
    project,
    save,
    setValue,
    value,
  };
};
